/**
 * Lead distribution.
 *
 * `crm_manager` is a role, not a person. The system must behave identically
 * with one holder or five. Mode lives in app_settings.lead_assignment_mode so
 * admins change it from Settings, never in code.
 */

export type AssignmentMode = "auto_single" | "round_robin" | "manual";

export interface AssignableUser {
  id: string;
  is_active: boolean;
}

export interface AssignmentInput {
  mode: AssignmentMode;
  /** Active CRM Managers, in a stable order (by created_at). */
  crmManagers: AssignableUser[];
  /** Count of deals already assigned to each manager, for round_robin. */
  currentLoad?: Record<string, number>;
}

/**
 * Returns the CRM Manager id a new lead should go to, or null to leave it
 * unassigned for an admin to pick up in Admin -> Leads.
 */
export function pickCrmOwner(input: AssignmentInput): string | null {
  const active = input.crmManagers.filter((u) => u.is_active);
  if (active.length === 0) return null;

  switch (input.mode) {
    case "manual":
      return null;

    case "auto_single":
      // Everything to the single active manager. With several active, the
      // first is deterministic rather than arbitrary — an admin reassigns.
      return active[0].id;

    case "round_robin": {
      const load = input.currentLoad ?? {};
      let best = active[0];
      let bestLoad = load[best.id] ?? 0;
      for (const u of active.slice(1)) {
        const l = load[u.id] ?? 0;
        if (l < bestLoad) { best = u; bestLoad = l; }
      }
      return best.id;
    }

    default:
      return null;
  }
}
