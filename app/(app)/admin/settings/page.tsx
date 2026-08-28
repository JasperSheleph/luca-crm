import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getSettings } from "@/lib/queries/settings";
import PageHeader from "@/components/ui/page-header";
import SettingsClient, { type NotificationRuleRow } from "./settings-client";
import type { ListValue } from "@/lib/types";

const LIST_ORDER = [
  "call_disposition", "lead_source", "not_pursued_reason", "loss_reason",
  "property_type", "building_subtype", "lift_mechanism",
  "construction_status", "space_available",
];

export default async function Page() {
  await requireRole("admin");
  const supabase = await createClient();

  const [{ data: values }, settings, { data: rules }] = await Promise.all([
    supabase.from("list_values").select("*").order("list_type").order("sort_order"),
    getSettings(),
    supabase
      .from("notification_rules")
      .select("id, trigger_key, is_enabled, timing_type, offset_minutes, daily_at_time, recipient_type, recipient_role, threshold_value, notification_templates(body_preview)")
      .order("id"),
  ]);

  // Inactive values are shown too — an admin has to be able to restore one.
  const lists: Record<string, ListValue[]> = {};
  for (const type of LIST_ORDER) lists[type] = [];
  for (const v of (values ?? []) as ListValue[]) (lists[v.list_type] ??= []).push(v);

  const ruleRows: NotificationRuleRow[] = (rules ?? []).map((r) => {
    const tpl = r.notification_templates as { body_preview: string } | { body_preview: string }[] | null;
    return {
      id: r.id, trigger_key: r.trigger_key, is_enabled: r.is_enabled,
      timing_type: r.timing_type, offset_minutes: r.offset_minutes,
      daily_at_time: r.daily_at_time, recipient_type: r.recipient_type,
      recipient_role: r.recipient_role, threshold_value: r.threshold_value,
      body_preview: Array.isArray(tpl) ? tpl[0]?.body_preview ?? null : tpl?.body_preview ?? null,
    };
  });

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Everything here is a database row, not code — change it yourself, any time."
      />
      <SettingsClient lists={lists} settings={settings} rules={ruleRows} />
    </>
  );
}
