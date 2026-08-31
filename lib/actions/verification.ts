"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";
import { fireNotification, dealNotificationVars } from "@/lib/notifications/from-action";
import { can, canViewDeal } from "@/lib/domain/permissions";
import type { AppUser, VerificationStatus } from "@/lib/types";

export interface VerificationState { ok?: boolean; error?: string; message?: string }

type Client = Awaited<ReturnType<typeof createClient>>;

/** What a verification call can conclude. `not_required` is a resolution, not an outcome. */
const OUTCOMES: VerificationStatus[] = ["confirmed", "failed", "unreachable"];

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
}

/**
 * Record what the customer said when rung about a site visit.
 *
 * This is the one control that catches a visit that never happened. It is not
 * theft prevention — a rep who wants to divert a lead simply never logs it,
 * and centralised intake is what stops that. This catches false reporting.
 *
 * `failed` freezes the deal: the customer says no visit took place, and
 * lib/domain/stages.ts refuses every transition except the terminal ones until
 * an admin resolves it. Nothing here re-implements that rule.
 */
export async function recordVerification(
  _prev: VerificationState, formData: FormData,
): Promise<VerificationState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "run_verification_call", deal)) {
    return { error: "Only a CRM Manager or an admin makes verification calls." };
  }

  const outcome = String(formData.get("outcome") ?? "") as VerificationStatus;
  if (!OUTCOMES.includes(outcome)) return { error: "Pick what the customer said." };

  const notes = String(formData.get("notes") ?? "").trim();
  if (outcome === "failed" && !notes) {
    return { error: "Write down what the customer actually said. This freezes the deal." };
  }

  // Tie the call to the visit it is about, so a second visit later can be
  // verified on its own rather than inheriting this verdict.
  const { data: visit } = await supabase
    .from("visits").select("id").eq("deal_id", dealId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false }).limit(1).maybeSingle();

  const { error } = await supabase.from("visit_verifications").insert({
    deal_id: dealId,
    visit_id: visit?.id ?? null,
    verified_by: user.id,
    outcome,
    notes: notes || null,
  });
  if (error) return { error: error.message };

  await supabase.from("deals").update({ visit_verification_status: outcome }).eq("id", dealId);

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "verification_call",
    notes: notes || null,
    metadata: { outcome, visit_id: visit?.id ?? null },
  });

  // A customer saying no visit took place is the one thing in this system the
  // owners must hear about without being asked. Only an admin can resolve it,
  // so only an admin is told — that is the rule's recipient, not a choice made
  // here.
  if (outcome === "failed") {
    await fireNotification({
      triggerKey: "verification_failed",
      vars: await dealNotificationVars(supabase, deal),
      dealId,
      href: `/deals/${dealId}`,
    });
  }

  refresh(dealId);
  return {
    ok: true,
    message: outcome === "failed"
      ? "Recorded. This deal is frozen until an admin resolves it."
      : "Recorded.",
  };
}

/**
 * Admin closes out a failed verification.
 *
 * The resolution is never left as `failed` — that is the frozen state, and a
 * deal cannot sit there once a human has looked at it. Either the visit did
 * happen after all (`confirmed`), or this deal does not need the check
 * (`not_required`). The note is mandatory: this is the record of a judgement
 * about a rep, and it should not be possible to make one silently.
 */
export async function resolveVerification(
  _prev: VerificationState, formData: FormData,
): Promise<VerificationState> {
  const dealId = String(formData.get("deal_id") ?? "");
  const ctx = await context(dealId);
  if ("error" in ctx) return { error: ctx.error };

  const { user, deal, supabase } = ctx;
  if (!can(user, "resolve_failed_verification", deal)) {
    return { error: "Only an admin can resolve a failed verification." };
  }
  if (deal.visit_verification_status !== "failed") {
    return { error: "That deal is not frozen." };
  }

  const resolution = String(formData.get("resolution") ?? "") as VerificationStatus;
  if (resolution !== "confirmed" && resolution !== "not_required") {
    return { error: "Say whether the visit happened or the check does not apply." };
  }

  const notes = String(formData.get("resolution_notes") ?? "").trim();
  if (!notes) return { error: "Write down how this was resolved." };

  const now = new Date().toISOString();

  // Stamp the failed call this resolves, not every call ever made on the deal.
  const { data: failed } = await supabase
    .from("visit_verifications").select("id").eq("deal_id", dealId).eq("outcome", "failed")
    .is("resolved_at", null).order("called_at", { ascending: false }).limit(1).maybeSingle();

  if (failed) {
    await supabase.from("visit_verifications").update({
      resolved_by: user.id, resolved_at: now, resolution_notes: notes,
    }).eq("id", failed.id);
  }

  const { error } = await supabase.from("deals")
    .update({ visit_verification_status: resolution }).eq("id", dealId);
  if (error) return { error: error.message };

  await supabase.from("activities").insert({
    deal_id: dealId,
    user_id: user.id,
    type: "verification_call",
    notes,
    metadata: { resolved_to: resolution },
  });

  refresh(dealId);
  return { ok: true, message: "Resolved. The deal can move again." };
}
