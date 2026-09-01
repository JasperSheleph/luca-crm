import { createClient } from "@/lib/db/server";
import { ROLE_LABELS, type Role } from "@/lib/domain/permissions";
import type { AppUser } from "@/lib/types";

/**
 * The signed-in user's profile row. Returns null when not signed in, or when
 * an auth user exists with no profile — treat both as "not logged in".
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error || !data) return null;
  if (!data.is_active) return null;
  return data as AppUser;
}

export async function listUsers(): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("*").order("created_at");
  return (data ?? []) as AppUser[];
}

export async function listActiveCrmManagers(): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users").select("*")
    .eq("role", "crm_manager").eq("is_active", true)
    .order("created_at");
  return (data ?? []) as AppUser[];
}

export async function listActiveReps(): Promise<AppUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users").select("*")
    .eq("role", "sales_rep").eq("is_active", true)
    .order("name");
  return (data ?? []) as AppUser[];
}

/**
 * May this person hold that ownership column?
 *
 * The two columns are not interchangeable: RLS lets a rep reach a deal — and
 * everything hanging off it, appointments included — through `rep_owner_id`
 * and nothing else. Put a rep's id in `crm_owner_id` and the deal vanishes from
 * his screens while every other view still shows him as the owner.
 *
 * Lives here rather than in an action because both lib/actions/deals.ts and
 * lib/actions/appointments.ts need it, and a "use server" module cannot export
 * a helper without also publishing it as a callable endpoint.
 */
export async function assigneeHoldsRole(
  userId: string,
  asRole: "crm_manager" | "sales_rep",
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const supabase = await createClient();
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
