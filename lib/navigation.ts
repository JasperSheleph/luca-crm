import type { Role } from "@/lib/domain/permissions";

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
  { href: "/today",            label: "Today",     roles: ["sales_rep"],                 mobile: true },
  { href: "/my-deals",         label: "My Deals",  roles: ["sales_rep"],                 mobile: true },

  // Deals is one screen doing both jobs: find a lead, and hand several over.
  // A separate Leads screen existed and was only confusing.
  { href: "/queue",            label: "Queue",     roles: ["admin", "crm_manager"],      mobile: true },
  { href: "/deals",            label: "Deals",     roles: ["admin", "crm_manager"],      mobile: true },

  { href: "/admin/dashboard",  label: "Dashboard", roles: ["admin"],                     mobile: true },
  { href: "/admin/users",      label: "Users",     roles: ["admin"] },
  { href: "/admin/settings",   label: "Settings",  roles: ["admin"] },
  { href: "/admin/import",     label: "Import",    roles: ["admin"] },
  { href: "/admin/health",     label: "Health",    roles: ["admin"] },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((i) => i.roles.includes(role));
}

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  switch (role) {
    case "sales_rep": return "/today";
    case "crm_manager": return "/queue";
    case "admin": return "/admin/dashboard";
  }
}
