import type { Role } from "@/lib/domain/permissions";
import { presetHref, TO_CALL } from "@/lib/domain/presets";

export interface NavItem {
  href: string;
  label: string;
  roles: Role[];
  /** Shown in the mobile bar. Reps and owners live on phones. */
  mobile?: boolean;
}

/**
 * Two interfaces, not three. Admin and CRM Manager share screens with
 * role-gated actions; only the rep view is genuinely distinct.
 * Admin is a superset of CRM Manager — see lib/domain/permissions.ts.
 */
export const NAV: NavItem[] = [
  // First for the admin: it is the only screen that answers "does anything
  // need me today" before you have decided what to look at.
  { href: "/admin/dashboard",  label: "Dashboard", roles: ["admin"],                     mobile: true },

  { href: "/today",            label: "Today",     roles: ["sales_rep"],                 mobile: true },
  { href: "/my-deals",         label: "My Deals",  roles: ["sales_rep"],                 mobile: true },

  // Deals is one screen doing every job: find a lead, work the queue through a
  // preset, and hand several over. A separate Leads screen existed and was only
  // confusing; a separate Queue screen would have been the same mistake again.
  { href: "/deals",            label: "Deals",     roles: ["admin", "crm_manager"],      mobile: true },

  // Everyone gets these, whatever their role.
  { href: "/notifications",    label: "Alerts",    roles: ["admin", "crm_manager", "sales_rep"], mobile: true },

  { href: "/admin/users",      label: "Users",     roles: ["admin"] },
  { href: "/admin/settings",   label: "Settings",  roles: ["admin"] },
  { href: "/admin/import",     label: "Import",    roles: ["admin"] },
  { href: "/admin/health",     label: "Health",    roles: ["admin"] },

  // Last on the bar on purpose. The sidebar already carries who-you-are and
  // Sign out, but the sidebar is desktop-only, and the reps — the people most
  // likely to need it — only ever see a phone.
  { href: "/account",          label: "Account",   roles: ["admin", "crm_manager", "sales_rep"], mobile: true },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((i) => i.roles.includes(role));
}

/**
 * The CRM Manager's "To Call" preset: never contacted, oldest first. Her
 * landing page, and where the retired /queue route sends anyone with a
 * bookmark. Derived from the preset list so the chip she clicks and the page
 * she lands on can never drift apart.
 */
export const TO_CALL_PRESET = presetHref(TO_CALL);

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "sales_rep": return "/today";
    case "crm_manager": return TO_CALL_PRESET;
    case "admin": return "/admin/dashboard";
  }
}
