"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { getCurrentUser } from "@/lib/queries/users";
import { can } from "@/lib/domain/permissions";

export interface ActionState { ok?: boolean; error?: string; message?: string }

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !can(user, "manage_settings")) return null;
  return user;
}

const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/* ------------------------------------------------------------------ lists */

export async function addListValue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an admin can change settings." };

  const listType = String(formData.get("list_type") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!listType || !label) return { error: "Enter a name." };

  const supabase = await createClient();
  const { data: siblings } = await supabase
    .from("list_values").select("sort_order").eq("list_type", listType)
    .order("sort_order", { ascending: false }).limit(1);

  const { error } = await supabase.from("list_values").insert({
    list_type: listType,
    value: slug(label),
    label,
    sort_order: (siblings?.[0]?.sort_order ?? 0) + 10,
  });
  if (error) {
    return { error: error.code === "23505" ? `"${label}" already exists in this list.` : error.message };
  }

  revalidatePath("/admin/settings");
  return { ok: true, message: `Added "${label}".` };
}

export async function renameListValue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an admin can change settings." };

  const id = Number(formData.get("id"));
  const label = String(formData.get("label") ?? "").trim();
  if (!id || !label) return { error: "Enter a name." };

  // Renaming changes only the label. `value` is the stable key historical rows
  // point at, so it never moves.
  const supabase = await createClient();
  const { error } = await supabase.from("list_values").update({ label }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message: "Renamed." };
}

/**
 * Deactivate, never delete. A value referenced by fifty historical deals would
 * silently break reporting if it disappeared, so there is no delete anywhere.
 */
export async function setListValueActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an admin can change settings." };

  const id = Number(formData.get("id"));
  const isActive = String(formData.get("is_active")) === "true";

  const supabase = await createClient();
  const { error } = await supabase.from("list_values").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message: isActive ? "Back in use." : "Hidden from new records. Existing deals keep it." };
}

export async function moveListValue(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an admin can change settings." };

  const id = Number(formData.get("id"));
  const direction = String(formData.get("direction"));
  const supabase = await createClient();

  const { data: row } = await supabase.from("list_values").select("*").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found." };

  const { data: neighbours } = await supabase
    .from("list_values").select("id, sort_order")
    .eq("list_type", row.list_type)
    [direction === "up" ? "lt" : "gt"]("sort_order", row.sort_order)
    .order("sort_order", { ascending: direction !== "up" })
    .limit(1);

  const swap = neighbours?.[0];
  if (!swap) return { ok: true };

  await supabase.from("list_values").update({ sort_order: swap.sort_order }).eq("id", row.id);
  await supabase.from("list_values").update({ sort_order: row.sort_order }).eq("id", swap.id);

  revalidatePath("/admin/settings");
  return { ok: true };
}

/* --------------------------------------------------------------- settings */

/** Each key is validated for its own shape — a malformed one breaks the app quietly. */
const SETTING_SCHEMAS: Record<string, z.ZodTypeAny> = {
  lead_assignment_mode: z.enum(["auto_single", "round_robin", "manual"]),
  budget_bands: z.array(z.object({ label: z.string().min(1), max: z.number().positive() })).min(1),
  required_fields_for_appointment: z.array(z.string()),
  service_area_cities: z.array(z.string().min(1)),
  city_aliases: z.record(z.string(), z.string()),
  quote_followup_days: z.array(z.number().int().positive()).min(1),
  verification_escalation_hours: z.number().int().positive(),
  whatsapp_enabled: z.boolean(),
  rep_initials_map: z.record(z.string(), z.string()),
};

export async function updateSetting(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an admin can change settings." };

  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "");
  const schema = SETTING_SCHEMAS[key];
  if (!schema) return { error: `Unknown setting: ${key}` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That is not valid JSON. Check for a missing comma or quote." };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { error: result.error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: result.data as never, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq("key", key);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}

/* ---------------------------------------------------------- notifications */

export async function updateNotificationRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  if (!user) return { error: "Only an admin can change settings." };

  const id = Number(formData.get("id"));
  const patch: Record<string, unknown> = {
    is_enabled: formData.get("is_enabled") === "on",
    updated_at: new Date().toISOString(),
  };

  const time = String(formData.get("daily_at_time") ?? "").trim();
  if (time) patch.daily_at_time = time;

  // The form asks for "N minutes before", so it collects a positive number.
  // The column stores the signed offset an event is shifted by, which for
  // "before" is negative. Convert here rather than showing "-120 minutes before".
  const offset = formData.get("offset_minutes");
  if (offset !== null && String(offset).trim() !== "") {
    patch.offset_minutes = -Math.abs(Number(offset));
  }

  const threshold = formData.get("threshold_value");
  if (threshold !== null && String(threshold).trim() !== "") patch.threshold_value = Number(threshold);

  const role = String(formData.get("recipient_role") ?? "").trim();
  if (role) patch.recipient_role = role;

  const supabase = await createClient();
  const { error } = await supabase.from("notification_rules").update(patch).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved." };
}
