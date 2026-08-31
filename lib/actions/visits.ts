"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";
import { fireNotification, dealNotificationVars } from "@/lib/notifications/from-action";
import { presetHref, AWAITING_VERIFICATION } from "@/lib/domain/presets";
import { can, canViewDeal } from "@/lib/domain/permissions";
import { canTransition, type DealStage } from "@/lib/domain/stages";
import type { AppUser } from "@/lib/types";

export interface VisitState { ok?: boolean; error?: string; message?: string }

type Client = Awaited<ReturnType<typeof createClient>>;

/** Photos per visit. A phone gallery is not the point; five is enough to show a site. */
const MAX_PHOTOS = 5;
/** The bucket's own ceiling is 2 MB. The client compresses to roughly 300 KB. */
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

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

/** Latitude/longitude as sent by the browser, or nulls if it was refused. */
function coords(formData: FormData, prefix: "start" | "end") {
  const lat = Number(formData.get(`${prefix}_lat`));
  const lng = Number(formData.get(`${prefix}_lng`));
  const ok = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0);
  return ok ? { lat, lng } : { lat: null, lng: null };
}

/**
 * Check in at the site.
 *
 * Geolocation is a deterrent, not proof — it is trivially spoofable, and the
 * verification call in step 6 is the real control. Refusing location does not
 * block the check-in: a rep standing in a basement with no fix still has to be
 * able to work, and blocking would only teach them to skip the app entirely.
 */
export async function startVisit(_prev: VisitState, formData: FormData): Promise<VisitState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "check_in_visit", deal)) {
    return { error: "Only the rep this deal is assigned to can check in." };
  }

  const appointmentId = String(formData.get("appointment_id") ?? "").trim() || null;

  // Checking in twice is a double tap on a phone, not a second visit.
  const { data: open } = await supabase
    .from("visits").select("id").eq("deal_id", dealId).is("completed_at", null).maybeSingle();
  if (open) return { ok: true, message: "Already checked in." };

  const { lat, lng } = coords(formData, "start");
  const now = new Date().toISOString();

  const { data: visit, error } = await supabase.from("visits").insert({
    deal_id: dealId,
    appointment_id: appointmentId,
    rep_id: user.id,
    started_at: now,
    start_lat: lat,
    start_lng: lng,
  }).select("id").single();
  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "visit_started",
    notes: lat === null ? "Location not available" : null,
    metadata: { visit_id: visit.id, lat, lng },
  });

  refresh(dealId);
  return { ok: true, message: "Checked in." };
}

/**
 * Check out, ending the visit.
 *
 * This is the hinge of the whole verification design: completing a visit sets
 * `visit_verification_status` to `pending`, which is what puts the deal in the
 * CRM Manager's Awaiting-verification queue and what blocks a quote until
 * somebody has rung the customer. See lib/domain/stages.ts.
 */
export async function completeVisit(_prev: VisitState, formData: FormData): Promise<VisitState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "check_in_visit", deal)) {
    return { error: "Only the rep this deal is assigned to can check out." };
  }

  const visitId = String(formData.get("visit_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!notes) return { error: "Write what you found on site before checking out." };

  const { lat, lng } = coords(formData, "end");
  const now = new Date().toISOString();

  const { error } = await supabase.from("visits").update({
    completed_at: now, end_lat: lat, end_lng: lng, notes,
  }).eq("id", visitId).eq("deal_id", dealId).is("completed_at", null);
  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "visit_completed",
    notes,
    metadata: { visit_id: visitId, lat, lng },
  });

  // Never downgrade a verification already settled: re-visiting a confirmed
  // deal must not silently reopen the gate behind it.
  const current = deal.visit_verification_status as string;
  const nowAwaiting = current === "not_required" || current === "unreachable";
  if (nowAwaiting) {
    await supabase.from("deals").update({ visit_verification_status: "pending" }).eq("id", dealId);
  }

  // Told only when the deal actually enters the Awaiting-verification bucket.
  // A second visit on a deal already sitting there is not news — it is already
  // in her queue, and telling her twice is how the queue stops being read.
  if (nowAwaiting) {
    const vars = await dealNotificationVars(supabase, deal);
    await fireNotification({
      triggerKey: "visit_awaiting_verification",
      vars: { ...vars, rep_name: user.name },
      dealId,
      href: presetHref(AWAITING_VERIFICATION),
    });
  }

  const stage = deal.stage as DealStage;
  const verdict = canTransition("site_visit_done", {
    role: user.role,
    requiredFieldsForAppointment: [],
    deal: deal as never,
  });
  if (verdict.ok) {
    await supabase.from("deals").update({ stage: "site_visit_done" }).eq("id", dealId);
    await supabase.from("deal_stage_history").insert({
      deal_id: dealId, from_stage: stage, to_stage: "site_visit_done", changed_by: user.id,
    });
    await supabase.from("activities").insert({
      deal_id: dealId, user_id: user.id, type: "stage_change",
      metadata: { from: stage, to: "site_visit_done" },
    });
  }

  if (formData.get("appointment_id")) {
    await supabase.from("appointments").update({ status: "completed" })
      .eq("id", String(formData.get("appointment_id"))).eq("deal_id", dealId);
  }

  // The visit is done; whatever happens next gets its own date.
  await supabase.from("deals")
    .update({ next_action_at: null, next_action_note: null }).eq("id", dealId);

  refresh(dealId);
  return { ok: true, message: "Visit complete. The customer will be called to confirm it." };
}

/**
 * Add a photo of the site.
 *
 * The file arrives already compressed by the browser — a modern phone camera
 * produces 4 MB frames and the bucket ceiling is 2 MB, so uploading the
 * original would fail on a rep's own handset. Stored PATH only, never a URL:
 * the bucket is private and links are signed on demand.
 */
export async function uploadVisitPhoto(_prev: VisitState, formData: FormData): Promise<VisitState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "check_in_visit", deal)) {
    return { error: "Only the rep this deal is assigned to can add photos." };
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Pick a photo first." };
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "That photo is too large even after compressing. Try another." };
  }

  const { count } = await supabase
    .from("attachments").select("id", { count: "exact", head: true })
    .eq("deal_id", dealId).eq("type", "visit_photo");
  if ((count ?? 0) >= MAX_PHOTOS) {
    return { error: `${MAX_PHOTOS} photos is the limit for a visit.` };
  }

  // The storage policies read the deal id out of the first path segment, so
  // this shape is load-bearing — see 20260828120300_storage.sql.
  const path = `${dealId}/${crypto.randomUUID()}.jpg`;
  const { error: upload } = await supabase.storage
    .from("visit-photos")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (upload) return { error: upload.message };

  const { error } = await supabase.from("attachments").insert({
    deal_id: dealId, type: "visit_photo", file_url: path,
    file_size: file.size, uploaded_by: user.id,
  });
  if (error) return { error: error.message };

  refresh(dealId);
  return { ok: true, message: "Photo added." };
}
