/**
 * Pipeline stages and transitions.
 *
 * EVERY stage change goes through canTransition() / assertTransition(), called
 * from a server action. There is no other path. The UI never decides.
 */

export const DEAL_STAGES = [
  "qualifying", "appointment_scheduled", "site_visit_done",
  "quote_sent", "negotiation", "won", "lost", "not_pursued", "nurture",
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

export type VerificationStatus =
  | "not_required" | "pending" | "confirmed" | "failed" | "unreachable";

/** Allowed moves. Anything not listed here is refused. */
const TRANSITIONS: Record<DealStage, DealStage[]> = {
  qualifying:            ["appointment_scheduled", "nurture", "lost", "not_pursued"],
  appointment_scheduled: ["site_visit_done", "qualifying", "lost", "nurture"],
  site_visit_done:       ["quote_sent", "lost", "nurture"],
  quote_sent:            ["negotiation", "lost", "nurture"],
  negotiation:           ["won", "lost", "nurture"],
  nurture:               ["qualifying"],
  not_pursued:           ["qualifying"],  // admin only — revive
  lost:                  ["qualifying"],  // admin only — revive
  won:                   [],              // terminal
};

/** Reviving a dead deal is an admin action, not a CRM Manager one. */
const ADMIN_ONLY_FROM: DealStage[] = ["not_pursued", "lost"];

export const TERMINAL_STAGES: DealStage[] = ["won", "lost", "not_pursued"];

export interface TransitionContext {
  role: "admin" | "crm_manager" | "sales_rep";
  /** app_settings.required_fields_for_appointment */
  requiredFieldsForAppointment: string[];
  /** The deal, as a plain record — this module never touches the database. */
  deal: Record<string, unknown> & {
    stage: DealStage;
    visit_verification_status: VerificationStatus;
  };
  /** Mandatory when moving to lost / not_pursued. */
  reasonId?: number | null;
  /** Won means the advance actually arrived. */
  advanceAmount?: number | null;
}

export interface TransitionResult {
  ok: boolean;
  /** Plain language — this string is shown to the user verbatim. */
  reason?: string;
}

export function canTransition(to: DealStage, ctx: TransitionContext): TransitionResult {
  const from = ctx.deal.stage;

  if (from === to) return { ok: false, reason: `Deal is already ${to.replace(/_/g, " ")}.` };

  const allowed = TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Cannot move a deal from ${from.replace(/_/g, " ")} to ${to.replace(/_/g, " ")}.` };
  }

  if (ADMIN_ONLY_FROM.includes(from) && ctx.role !== "admin") {
    return { ok: false, reason: "Only an admin can revive a closed deal." };
  }

  // A failed verification freezes the deal. The customer said no visit took
  // place; nothing advances until an admin resolves it.
  if (ctx.deal.visit_verification_status === "failed" && !TERMINAL_STAGES.includes(to)) {
    return { ok: false, reason: "This deal is frozen — the customer did not confirm the site visit. An admin must resolve it first." };
  }

  // The one qualification gate in the whole system.
  if (to === "appointment_scheduled") {
    const missing = ctx.requiredFieldsForAppointment.filter((f) => {
      const v = ctx.deal[f];
      return v === null || v === undefined || v === "";
    });
    if (missing.length > 0) {
      return { ok: false, reason: `Fill these before booking an appointment: ${missing.map(prettyField).join(", ")}.` };
    }
  }

  // The verification gate: a completed visit must be confirmed before a quote.
  if (to === "quote_sent") {
    const s = ctx.deal.visit_verification_status;
    if (s === "pending" || s === "unreachable") {
      return { ok: false, reason: "The site visit has not been verified with the customer yet." };
    }
  }

  if ((to === "lost" || to === "not_pursued") && !ctx.reasonId) {
    return { ok: false, reason: `A reason is required to mark a deal ${to === "lost" ? "Lost" : "Not Pursued"}.` };
  }

  if (to === "won" && !ctx.advanceAmount) {
    return { ok: false, reason: "Won means the advance has been received. Record the advance amount." };
  }

  return { ok: true };
}

export function assertTransition(to: DealStage, ctx: TransitionContext): void {
  const r = canTransition(to, ctx);
  if (!r.ok) throw new Error(r.reason ?? "Transition not allowed.");
}

export function allowedTransitions(ctx: TransitionContext): DealStage[] {
  return DEAL_STAGES.filter((s) => canTransition(s, ctx).ok);
}

function prettyField(f: string): string {
  return f
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}
