"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { getCurrentUser, assigneeHoldsRole } from "@/lib/queries/users";
import { can, canViewDeal } from "@/lib/domain/permissions";
import { canTransition, type DealStage } from "@/lib/domain/stages";
import type { AppUser, AppointmentStatus } from "@/lib/types";

export interface AppointmentState { ok?: boolean; error?: string; message?: string }

type Client = Awaited<ReturnType<typeof createClient>>;

/**
 * Same shape as lib/actions/deals.ts. Duplicated deliberately rather than
 * exported from there: that module is "use server", so anything it exports
 * becomes a callable server endpoint, and a context loader is not one.
 */
async function context(dealId: string): Promise<
  | { user: AppUser; deal: Record<string, unknown>; supabase: Client }
  | { error: string }
> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are not signed in." };

  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) return { error: "That deal no longer exists." };
  if (!canViewDeal(user, deal)) return { error: "You do not have access to that deal." };

  return { user, deal, supabase };
}

function refresh(dealId: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/my-deals");
  revalidatePath("/today");
}

/**
 * Book a site visit.
 *
 * Booking is also what moves the deal to Appointment Scheduled, and that
 * transition is the one qualification gate in the system — it refuses until
 * `required_fields_for_appointment` are filled. The check runs through
 * canTransition like every other stage change; there is no second path.
 */
export async function scheduleAppointment(
  _prev: AppointmentState, formData: FormData,
): Promise<AppointmentState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "schedule_appointment", deal)) {
    return { error: "You cannot schedule a visit on that deal." };
  }

  const at = String(formData.get("scheduled_at") ?? "").trim();
  if (!at) return { error: "Pick a date and time." };

  const repId = String(formData.get("rep_id") ?? "").trim() || (deal.rep_owner_id as string | null);
  const scheduledAt = new Date(at).toISOString();

  const { data: settingRow } = await supabase
    .from("app_settings").select("value").eq("key", "required_fields_for_appointment").maybeSingle();

  // Only gate the first booking. A deal already past this point — say one being
  // re-visited from Negotiation — must not be dragged backwards.
  const stage = deal.stage as DealStage;
  const moving = stage === "qualifying";
  if (moving) {
    const verdict = canTransition("appointment_scheduled", {
      role: user.role,
      requiredFieldsForAppointment: (settingRow?.value as string[]) ?? [],
      deal: deal as never,
    });
    if (!verdict.ok) return { error: verdict.reason };
  }

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({ deal_id: dealId, rep_id: repId, scheduled_at: scheduledAt, created_by: user.id })
    .select("id").single();
  if (error) return { error: error.message };

  // Booking a visit for a rep IS handing him the deal. Without this the
  // appointment carries his id while `deals.rep_owner_id` stays null, and RLS
  // scopes the rep's every screen — /today included — through that column, so
  // the visit he is expected to make is invisible to him. Found exactly that
  // way: an appointment booked for today that never appeared on Today.
  if (repId && repId !== deal.rep_owner_id) {
    const check = await assigneeHoldsRole(repId, "sales_rep");
    if (check.ok) {
      await supabase.from("deals").update({ rep_owner_id: repId }).eq("id", dealId);
      if (deal.rep_owner_id) {
        await supabase.from("assignments")
          .update({ unassigned_at: new Date().toISOString() })
          .eq("deal_id", dealId).eq("user_id", deal.rep_owner_id as string).is("unassigned_at", null);
      }
      await supabase.from("assignments").insert({
        deal_id: dealId, user_id: repId, role_at_assignment: "sales_rep", assigned_by: user.id,
      });
      await supabase.from("activities").insert({
        deal_id: dealId, user_id: user.id, type: "assignment",
        notes: `Assigned to ${check.name}`,
        metadata: { role: "sales_rep", user_id: repId, via: "appointment" },
      });
    }
  }

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "appointment_set",
    notes: String(formData.get("notes") ?? "").trim() || null,
    metadata: { appointment_id: appointment.id, scheduled_at: scheduledAt },
  });

  if (moving) {
    await supabase.from("deals").update({ stage: "appointment_scheduled" }).eq("id", dealId);
    await supabase.from("deal_stage_history").insert({
      deal_id: dealId, from_stage: stage, to_stage: "appointment_scheduled", changed_by: user.id,
    });
    await supabase.from("activities").insert({
      deal_id: dealId, user_id: user.id, type: "stage_change",
      metadata: { from: stage, to: "appointment_scheduled" },
    });
  }

  // The visit is now the next thing owed on this deal, so it is also the
  // reminder. Without this the deal reads as having no next action.
  await supabase.from("deals")
    .update({ next_action_at: scheduledAt, next_action_note: "Site visit" })
    .eq("id", dealId);

  refresh(dealId);
  return { ok: true, message: "Visit booked." };
}

/**
 * Move a booked visit. The reason is mandatory — a rescheduled visit is the
 * commonest way a deal quietly dies, and "why" is the only thing that makes
 * the pattern visible later.
 */
export async function rescheduleAppointment(
  _prev: AppointmentState, formData: FormData,
): Promise<AppointmentState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "schedule_appointment", deal)) {
    return { error: "You cannot change that visit." };
  }

  const id = String(formData.get("appointment_id") ?? "");
  const at = String(formData.get("scheduled_at") ?? "").trim();
  const reason = String(formData.get("reschedule_reason") ?? "").trim();
  if (!at) return { error: "Pick the new date and time." };
  if (!reason) return { error: "Say why it moved — this is what makes a pattern visible later." };

  const { data: existing } = await supabase
    .from("appointments").select("scheduled_at").eq("id", id).eq("deal_id", dealId).maybeSingle();
  if (!existing) return { error: "That visit no longer exists." };

  const scheduledAt = new Date(at).toISOString();
  const { error } = await supabase.from("appointments").update({
    scheduled_at: scheduledAt,
    status: "rescheduled",
    rescheduled_from: existing.scheduled_at,
    reschedule_reason: reason,
  }).eq("id", id);
  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "appointment_changed",
    notes: reason,
    metadata: { appointment_id: id, from: existing.scheduled_at, to: scheduledAt },
  });

  await supabase.from("deals")
    .update({ next_action_at: scheduledAt, next_action_note: "Site visit (rescheduled)" })
    .eq("id", dealId);

  refresh(dealId);
  return { ok: true, message: "Visit moved." };
}

/**
 * Confirm, cancel, or mark a no-show. Confirming is the rep saying "yes, I am
 * going" — it is what turns a booking someone else made into a commitment.
 */
export async function setAppointmentStatus(
  _prev: AppointmentState, formData: FormData,
): Promise<AppointmentState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "schedule_appointment", deal)) {
    return { error: "You cannot change that visit." };
  }

  const id = String(formData.get("appointment_id") ?? "");
  const status = String(formData.get("status") ?? "") as AppointmentStatus;
  if (!["confirmed", "cancelled", "no_show"].includes(status)) {
    return { error: "That is not a status this can set." };
  }

  const patch: Record<string, unknown> = { status };
  if (status === "confirmed") patch.rep_confirmed_at = new Date().toISOString();

  const { error } = await supabase.from("appointments").update(patch).eq("id", id).eq("deal_id", dealId);
  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "appointment_changed",
    notes: String(formData.get("notes") ?? "").trim() || null,
    metadata: { appointment_id: id, status },
  });

  // A cancelled visit is no longer the thing owed; leaving it as the next
  // action would keep the deal permanently overdue against a visit nobody
  // intends to make.
  if (status === "cancelled") {
    await supabase.from("deals")
      .update({ next_action_at: null, next_action_note: null }).eq("id", dealId);
  }

  refresh(dealId);
  return { ok: true, message: status === "confirmed" ? "Confirmed." : "Updated." };
}
