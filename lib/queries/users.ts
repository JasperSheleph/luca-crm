import { createClient } from "@/lib/db/server";
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
