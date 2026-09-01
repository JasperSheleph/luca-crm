"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";
import { can, canViewDeal, ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import { canTransition, type DealStage } from "@/lib/domain/stages";
import { fireNotification, dealNotificationVars } from "@/lib/notifications/from-action";
import { formatAmount } from "@/lib/config/design-tokens";
import type { AppUser } from "@/lib/types";

export interface DealActionState { ok?: boolean; error?: string; message?: string }

type Client = Awaited<ReturnType<typeof createClient>>;

/** Loads the actor and the deal together, refusing early if either is wrong. */
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
  revalidatePath("/notifications");
}

/* ------------------------------------------------------------- activities */

/**
 * Log a call, a note, or a commitment.
 *
 * Deliberately tolerant about what it needs: a disposition alone is a complete
 * call log. RNR is 30% of all outcomes, so logging one has to be a single
 * action with no required typing — that is the adoption test for the whole
 * system, and everything here is shaped around it.
 */
export async function logActivity(_prev: DealActionState, formData: FormData): Promise<DealActionState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "log_activity", deal)) return { error: "You cannot log activity on that deal." };

  const type = String(formData.get("type") ?? "note") as "call" | "note" | "commitment";
  const dispositionId = formData.get("disposition_id");
  const notes = String(formData.get("notes") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();

  if (type === "note" && !notes) return { error: "Write something first." };
  if (type === "call" && !dispositionId) return { error: "Pick what happened on the call." };
  if (type === "commitment" && (!notes || !dueDate)) {
    return { error: "A commitment needs what was promised and by when." };
  }

  const { error } = await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type,
    disposition_id: dispositionId ? Number(dispositionId) : null,
    notes: notes || null,
    metadata: type === "commitment" ? { due_date: dueDate, status: "open" } : null,
  });
  if (error) return { error: error.message };

  const patch: Record<string, unknown> = {};

  // Lead age at first contact is a headline metric, and this is the only
  // moment it can be captured.
  if (type === "call" && !deal.first_contacted_at) {
    patch.first_contacted_at = new Date().toISOString();
  }

  // A logged call clears the reminder it was answering; the next one gets set
  // explicitly. Leaving it would keep the deal permanently "overdue".
  const nextAction = String(formData.get("next_action_at") ?? "").trim();
  if (nextAction) {
    patch.next_action_at = new Date(nextAction).toISOString();
    patch.next_action_note = notes || null;
  } else if (type === "call" && deal.next_action_at) {
    patch.next_action_at = null;
    patch.next_action_note = null;
  }

  if (Object.keys(patch).length) await supabase.from("deals").update(patch).eq("id", dealId);

  refresh(dealId);
  return { ok: true, message: "Logged." };
}

/* ----------------------------------------------------------------- stages */

export async function changeStage(_prev: DealActionState, formData: FormData): Promise<DealActionState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  const to = String(formData.get("to_stage") ?? "") as DealStage;
  const reasonId = formData.get("reason_id") ? Number(formData.get("reason_id")) : null;
  const reasonNotes = String(formData.get("reason_notes") ?? "").trim();
  const advance = formData.get("advance_amount") ? Number(formData.get("advance_amount")) : null;
  const wakeAt = String(formData.get("nurture_wake_at") ?? "").trim();

  const { data: settingRow } = await supabase
    .from("app_settings").select("value").eq("key", "required_fields_for_appointment").maybeSingle();

  // The single gate. Never duplicated in the UI — the UI asks this function.
  const verdict = canTransition(to, {
    role: user.role,
    requiredFieldsForAppointment: (settingRow?.value as string[]) ?? [],
    deal: deal as never,
    reasonId,
    advanceAmount: advance,
  });
  if (!verdict.ok) return { error: verdict.reason };

  if (to === "nurture" && !wakeAt) return { error: "Pick the date to bring this back." };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stage: to };

  if (to === "nurture") { patch.nurture_wake_at = new Date(wakeAt).toISOString(); patch.next_action_at = null; }
  if (to === "won")  { patch.won_at = now; patch.advance_amount = advance; patch.advance_received_at = now; patch.next_action_at = null; }
  if (to === "lost") { patch.lost_at = now; patch.lost_reason_id = reasonId; patch.lost_notes = reasonNotes || null; patch.next_action_at = null; }
  if (to === "not_pursued") { patch.not_pursued_reason_id = reasonId; patch.not_pursued_notes = reasonNotes || null; patch.next_action_at = null; }
  if (to === "qualifying") { patch.nurture_wake_at = null; }

  const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
  if (error) return { error: error.message };

  // Both, every time. The history table is the audit trail; the activity is
  // what a human reads on the timeline.
  await supabase.from("deal_stage_history").insert({
    deal_id: dealId,
    from_stage: deal.stage as DealStage,
    to_stage: to,
    changed_by: user.id,
    reason: reasonNotes || null,
  });
  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "stage_change",
    notes: reasonNotes || null,
    metadata: { from: deal.stage, to, ...(advance ? { advance } : {}) },
  });

  // The owners want to know the moment an advance lands, and this is the only
  // stage change anyone asked to be told about.
  if (to === "won") {
    await fireNotification({
      triggerKey: "deal_won",
      vars: {
        customer_name: (await dealNotificationVars(supabase, deal)).customer_name,
        amount: formatAmount(advance),
      },
      dealId,
      href: `/deals/${dealId}`,
    });
  }

  refresh(dealId);
  return { ok: true, message: "Stage updated." };
}

/* ------------------------------------------------------------- assignment */

/**
 * The two assignment columns are not interchangeable: RLS lets a rep read a
 * deal through `rep_owner_id` and nothing else. So assigning a sales rep "as
 * CRM Manager" writes his id into `crm_owner_id`, the deal never reaches his
 * My Deals, and the UI still says "Assigned." — a silent loss, which is how it
 * was found.
 *
 * The bulk bar on /deals offers the role and the person as two independent
 * selects, so the mismatched pair is reachable from the UI. Filtering that list
 * fixes the path; this fixes the rule, for every caller.
 */
async function assigneeHoldsRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  asRole: "crm_manager" | "sales_rep",
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const { data } = await supabase
    .from("users").select("name, role, is_active").eq("id", userId).maybeSingle();

  if (!data) return { ok: false, error: "That person no longer exists." };
  if (!data.is_active) return { ok: false, error: `${data.name} is deactivated.` };

  // Admin is a superset of CRM Manager (lib/domain/permissions.ts), so an admin
  // may legitimately hold the CRM Manager column. Nobody but a rep may hold the
  // rep column — that is what the rep's whole view keys off.
  const allowed = asRole === "crm_manager"
    ? data.role === "crm_manager" || data.role === "admin"
    : data.role === "sales_rep";

  if (!allowed) {
    return {
      ok: false,
      error: `${data.name} is a ${ROLE_LABELS[data.role as Role] ?? data.role}, so cannot be assigned as ${ROLE_LABELS[asRole]}.`,
    };
  }
  return { ok: true, name: data.name };
}


/** Never overwrites an owner without appending to `assignments`. */
export async function assignDeal(_prev: DealActionState, formData: FormData): Promise<DealActionState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  const userId = String(formData.get("user_id") ?? "");
  const asRole = String(formData.get("as_role") ?? "") as "crm_manager" | "sales_rep";

  const permission = asRole === "crm_manager" ? "assign_lead_to_crm_manager" : "assign_lead_to_rep";
  if (!can(user, permission)) return { error: "You cannot reassign this deal." };

  const column = asRole === "crm_manager" ? "crm_owner_id" : "rep_owner_id";
  const previous = deal[column] as string | null;
  if (previous === (userId || null)) return { ok: true };

  // Clearing an owner needs no check; setting one does.
  if (userId) {
    const check = await assigneeHoldsRole(supabase, userId, asRole);
    if (!check.ok) return { error: check.error };
  }

  const { error } = await supabase.from("deals").update({ [column]: userId || null }).eq("id", dealId);
  if (error) return { error: error.message };

  if (previous) {
    await supabase.from("assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("deal_id", dealId).eq("user_id", previous).is("unassigned_at", null);
  }
  if (userId) {
    await supabase.from("assignments").insert({
      deal_id: dealId, user_id: userId, role_at_assignment: asRole, assigned_by: user.id,
    });
    const { data: assignee } = await supabase.from("users").select("name").eq("id", userId).maybeSingle();
    await supabase.from("activities").insert({
      deal_id: dealId, user_id: user.id, type: "assignment",
      notes: `Assigned to ${assignee?.name ?? "someone"}`,
      metadata: { role: asRole, user_id: userId },
    });

    await fireNotification({
      triggerKey: "lead_assigned",
      vars: await dealNotificationVars(supabase, deal),
      dealId,
      dealOwnerIds: [userId],
      href: `/deals/${dealId}`,
    });
  }

  refresh(dealId);
  return { ok: true, message: "Assigned." };
}

/* ---------------------------------------------------------- qualification */

/**
 * All optional, always. The tracker proves the point: Floors was filled on 46
 * of 1,762 rows while the same information appeared constantly inside the
 * remarks text. A field that slows down logging does not get filled.
 */
export async function updateQualification(_prev: DealActionState, formData: FormData): Promise<DealActionState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "edit_qualification", deal)) return { error: "You cannot edit those fields." };

  const num = (k: string) => {
    const v = formData.get(k);
    return v === null || String(v).trim() === "" ? null : Number(v);
  };
  const text = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v === "" ? null : v;
  };

  const patch = {
    floors: num("floors"),
    property_type_id: num("property_type_id"),
    building_subtype_id: num("building_subtype_id"),
    lift_mechanism_id: num("lift_mechanism_id"),
    construction_status_id: num("construction_status_id"),
    space_available_id: num("space_available_id"),
    num_lifts: num("num_lifts"),
    budget_amount: num("budget_amount"),
    site_address: text("site_address"),
    minimum_space: text("minimum_space"),
    timeline_months: text("timeline_months"),
  };

  const { error } = await supabase.from("deals").update(patch).eq("id", dealId);
  if (error) return { error: error.message };

  refresh(dealId);
  return { ok: true, message: "Saved." };
}

export async function setNextAction(_prev: DealActionState, formData: FormData): Promise<DealActionState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "log_activity", deal)) return { error: "You cannot change that." };

  const at = String(formData.get("next_action_at") ?? "").trim();
  const note = String(formData.get("next_action_note") ?? "").trim();

  const { error } = await supabase.from("deals").update({
    next_action_at: at ? new Date(at).toISOString() : null,
    next_action_note: note || null,
  }).eq("id", dealId);
  if (error) return { error: error.message };

  refresh(dealId);
  return { ok: true, message: at ? "Reminder set." : "Reminder cleared." };
}

/* ------------------------------------------------------------------ bulk */

/**
 * Admin → Leads. Used when onboarding a CRM Manager, covering leave, or rebalancing.
 *
 * Deliberately sends NO lead_assigned notifications. Handing over two hundred
 * leads would put two hundred messages in one person's notification centre and
 * on their phone, which is how a notification system gets muted — and the leads
 * are about to appear in their queue anyway. The single-deal path notifies; the
 * bulk path is a visible administrative act that speaks for itself.
 */
export async function bulkAssign(_prev: DealActionState, formData: FormData): Promise<DealActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You are not signed in." };

  const asRole = String(formData.get("as_role") ?? "") as "crm_manager" | "sales_rep";
  const permission = asRole === "crm_manager" ? "assign_lead_to_crm_manager" : "assign_lead_to_rep";
  if (!can(user, permission)) return { error: "You cannot reassign leads." };

  const userId = String(formData.get("user_id") ?? "");
  const ids = formData.getAll("deal_ids").map(String).filter(Boolean);
  if (!userId) return { error: "Choose who to assign them to." };
  if (!ids.length) return { error: "Select some leads first." };

  const supabase = await createClient();
  const column = asRole === "crm_manager" ? "crm_owner_id" : "rep_owner_id";

  const check = await assigneeHoldsRole(supabase, userId, asRole);
  if (!check.ok) return { error: check.error };

  const { error } = await supabase.from("deals").update({ [column]: userId }).in("id", ids);
  if (error) return { error: error.message };

  await supabase.from("assignments").insert(
    ids.map((id) => ({ deal_id: id, user_id: userId, role_at_assignment: asRole, assigned_by: user.id })),
  );
  const { data: assignee } = await supabase.from("users").select("name").eq("id", userId).maybeSingle();
  await supabase.from("activities").insert(
    ids.map((id) => ({
      deal_id: id, user_id: user.id, type: "assignment" as const,
      notes: `Assigned to ${assignee?.name ?? "someone"}`,
      metadata: { role: asRole, user_id: userId, bulk: true },
    })),
  );

  revalidatePath("/admin/leads");
  revalidatePath("/deals");
  return { ok: true, message: `${ids.length} lead${ids.length === 1 ? "" : "s"} assigned to ${assignee?.name ?? "them"}.` };
}
