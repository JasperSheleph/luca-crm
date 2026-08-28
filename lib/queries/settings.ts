import { createClient } from "@/lib/db/server";
import type { ListValue } from "@/lib/types";

/** All app_settings as a plain object. */
export async function getSettings(): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}

/** Active values for one dropdown, in the order admins arranged them. */
export async function getListValues(listType: string): Promise<ListValue[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("list_values").select("*")
    .eq("list_type", listType).eq("is_active", true)
    .order("sort_order");
  return (data ?? []) as ListValue[];
}

/** Several lists in one round trip — deal detail needs six of them. */
export async function getListValuesFor(
  listTypes: string[],
): Promise<Record<string, ListValue[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("list_values").select("*")
    .in("list_type", listTypes).eq("is_active", true)
    .order("sort_order");

  const out: Record<string, ListValue[]> = Object.fromEntries(listTypes.map((t) => [t, []]));
  for (const row of (data ?? []) as ListValue[]) {
    (out[row.list_type] ??= []).push(row);
  }
  return out;
}
