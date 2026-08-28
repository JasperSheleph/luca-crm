/**
 * The single source of truth for who can do what.
 *
 * Used by BOTH server actions and the UI, so a button never appears for an
 * action the server will refuse. Changing permissions means changing this file
 * and nothing else.
 *
 * Admin is a deliberate superset of CRM Manager — that is what lets the owners
 * cover when a CRM Manager is away.
 */

export type Role = "admin" | "crm_manager" | "sales_rep";

export type Action =
  | "assign_lead_to_crm_manager"
  | "assign_lead_to_rep"
  | "view_all_deals"
  | "edit_qualification"
  | "log_activity"
  | "schedule_appointment"
  | "check_in_visit"
  | "run_verification_call"
  | "resolve_failed_verification"
  | "upload_quote"
  | "close_deal"
  | "manage_users"
  | "manage_settings"
  | "run_import"
  | "view_dashboard"
  | "export_deals";

const MATRIX: Record<Action, Role[]> = {
  assign_lead_to_crm_manager:  ["admin"],
  assign_lead_to_rep:          ["admin", "crm_manager"],
  view_all_deals:              ["admin", "crm_manager"],
  edit_qualification:          ["admin", "crm_manager"],
  log_activity:                ["admin", "crm_manager", "sales_rep"],
  schedule_appointment:        ["admin", "crm_manager", "sales_rep"],
  check_in_visit:              ["sales_rep"],
  run_verification_call:       ["admin", "crm_manager"],
  resolve_failed_verification: ["admin"],
  upload_quote:                ["admin", "crm_manager"],
  close_deal:                  ["admin", "crm_manager"],
  manage_users:                ["admin"],
  manage_settings:             ["admin"],
  run_import:                  ["admin"],
  view_dashboard:              ["admin"],
  export_deals:                ["admin", "crm_manager"],
};

/** Actions a rep may take, but only on a deal he owns. */
const OWN_DEAL_ONLY: Action[] = [
  "log_activity", "schedule_appointment", "check_in_visit",
];

export interface Actor {
  id: string;
  role: Role;
}

export interface DealScope {
  rep_owner_id?: string | null;
}

export function can(actor: Actor, action: Action, deal?: DealScope): boolean {
  if (!MATRIX[action]?.includes(actor.role)) return false;

  if (actor.role === "sales_rep" && deal !== undefined && OWN_DEAL_ONLY.includes(action)) {
    return deal.rep_owner_id === actor.id;
  }
  return true;
}

/** Can this actor see this deal at all? Mirrors the RLS policy on `deals`. */
export function canViewDeal(actor: Actor, deal: DealScope): boolean {
  if (actor.role === "admin" || actor.role === "crm_manager") return true;
  return deal.rep_owner_id === actor.id;
}

export function assertCan(actor: Actor, action: Action, deal?: DealScope): void {
  if (!can(actor, action, deal)) {
    throw new Error("You do not have permission to do that.");
  }
}
