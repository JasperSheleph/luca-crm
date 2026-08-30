"use client";

import { useActionState, useState } from "react";
import {
  addListValue, renameListValue, setListValueActive, moveListValue,
  updateSetting, updateNotificationRule, type ActionState,
} from "@/lib/actions/settings";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { inputBase, inputClass } from "@/components/ui/field";
import type { ListValue } from "@/lib/types";
import {
  ModeEditor, BooleanEditor, NumberEditor, NumberListEditor,
  LinesEditor, PairsEditor, FieldsEditor, BandsEditor,
} from "@/components/settings/setting-editors";

export interface NotificationRuleRow {
  id: number;
  trigger_key: string;
  is_enabled: boolean;
  timing_type: string;
  offset_minutes: number | null;
  daily_at_time: string | null;
  recipient_type: string;
  recipient_role: string | null;
  threshold_value: number | null;
  body_preview: string | null;
}

const LIST_LABELS: Record<string, { title: string; description: string }> = {
  call_disposition:   { title: "Call outcomes", description: "RNR stays first — it is 30% of all outcomes and must be the fastest to pick." },
  lead_source:        { title: "Lead sources", description: "Where a lead came from." },
  not_pursued_reason: { title: "Not-pursued reasons", description: "Required when dropping a lead after a call." },
  loss_reason:        { title: "Loss reasons", description: "Required when marking a deal Lost." },
  property_type:      { title: "Property types", description: "" },
  building_subtype:   { title: "Building types", description: "" },
  lift_mechanism:     { title: "Lift mechanisms", description: "" },
  construction_status:{ title: "Construction status", description: "" },
  space_available:    { title: "Space available", description: "" },
};

const SETTING_HELP: Record<string, { title: string; help: string }> = {
  lead_assignment_mode:            { title: "How new leads are shared out", help: '"auto_single" sends everything to one CRM Manager, "round_robin" spreads them evenly, "manual" leaves them for an admin to assign.' },
  budget_bands:                    { title: "Budget bands", help: "Used for grouping on the dashboard. Each band needs a label and the amount it runs up to." },
  required_fields_for_appointment: { title: "Needed before booking a site visit", help: "The only qualification gate in the system. Everything else stays optional on purpose — a field that blocks work does not get filled." },
  service_area_cities:             { title: "Service area", help: "Tamil Nadu and Puducherry. Around 60% of leads are outside Chennai; that is normal business, not a warning." },
  city_aliases:                    { title: "City spellings", help: 'Their data holds hundreds of spellings for about 30 cities. Map each variant to one name, e.g. "trichy": "tiruchirappalli".' },
  quote_followup_days:             { title: "Quote follow-up reminders", help: "Days after a quote is sent to nudge, if the customer has not replied." },
  verification_escalation_hours:   { title: "Verification escalation", help: "How long an unreachable verification call waits before both admins are told." },
  whatsapp_enabled:                { title: "WhatsApp messages", help: "Off until a WhatsApp number is registered. Everything still appears in the in-app notification centre either way." },
  rep_initials_map:                { title: "Rep initials", help: 'For the legacy tracker import: maps initials like "JN" to a person.' },
  stalled_deal_days:               { title: "When a deal counts as stalled", help: "Days with nothing logged before the dashboard flags an open deal as going cold." },
  database_limit_bytes:            { title: "Database allowance", help: "Whatever your Supabase plan includes, in bytes. Free is 536870912 (512 MB); Pro is 8589934592 (8 GB). Only used for the percentage on the Health page." },
  storage_limit_bytes:             { title: "File storage allowance", help: "Whatever your Supabase plan includes, in bytes. Free is 1073741824 (1 GB); Pro is 107374182400 (100 GB). Only used for the percentage on the Health page." },
};

function Note({ state }: { state: ActionState }) {
  if (state.error) return <p role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="mt-2 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>;
  return null;
}

function ListEditor({ listType, values }: { listType: string; values: ListValue[] }) {
  const meta = LIST_LABELS[listType] ?? { title: listType, description: "" };
  const [add, addAction, adding] = useActionState<ActionState, FormData>(addListValue, {});
  const [row, rowAction] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const intent = String(fd.get("intent"));
      if (intent === "rename") return renameListValue(prev, fd);
      if (intent === "move") return moveListValue(prev, fd);
      return setListValueActive(prev, fd);
    }, {},
  );

  return (
    <Card title={meta.title} description={meta.description}>
      <ul className="divide-y divide-border">
        {values.map((v, i) => (
          <li key={v.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <form action={rowAction} className="flex flex-1 items-center gap-2">
              <input type="hidden" name="intent" value="rename" />
              <input type="hidden" name="id" value={v.id} />
              <input name="label" defaultValue={v.label}
                     className={`${inputClass} flex-1 ${v.is_active ? "" : "text-ink-muted line-through"}`} />
              <Button size="sm" variant="ghost" type="submit">Save</Button>
            </form>
            {!v.is_active && <Badge tone="muted">Hidden</Badge>}
            <form action={rowAction} className="flex gap-0.5">
              <input type="hidden" name="intent" value="move" />
              <input type="hidden" name="id" value={v.id} />
              <button name="direction" value="up" disabled={i === 0} aria-label="Move up"
                      className="rounded px-1.5 py-1 text-xs text-ink-muted hover:bg-navy-50 disabled:opacity-30">↑</button>
              <button name="direction" value="down" disabled={i === values.length - 1} aria-label="Move down"
                      className="rounded px-1.5 py-1 text-xs text-ink-muted hover:bg-navy-50 disabled:opacity-30">↓</button>
            </form>
            <form action={rowAction}>
              <input type="hidden" name="intent" value="active" />
              <input type="hidden" name="id" value={v.id} />
              <input type="hidden" name="is_active" value={String(!v.is_active)} />
              <Button size="sm" variant="ghost" type="submit">{v.is_active ? "Hide" : "Restore"}</Button>
            </form>
          </li>
        ))}
      </ul>

      <form action={addAction} className="mt-3 flex gap-2">
        <input type="hidden" name="list_type" value={listType} />
        <input name="label" placeholder="Add another…" className={`${inputClass} flex-1`} />
        <Button size="sm" variant="secondary" type="submit" disabled={adding}>Add</Button>
      </form>

      <p className="mt-2 text-xs text-ink-muted">
        Values are hidden, never deleted — deleting one that fifty old deals point at would break your reports.
      </p>
      <Note state={add} />
      <Note state={row} />
    </Card>
  );
}

/** Each setting gets the control it deserves — never a box of raw JSON. */
function SettingControl({ settingKey, value }: { settingKey: string; value: unknown }) {
  switch (settingKey) {
    case "lead_assignment_mode":
      return <ModeEditor value={value} />;
    case "whatsapp_enabled":
      return <BooleanEditor value={value} label="Send WhatsApp messages as well as in-app notifications" />;
    case "verification_escalation_hours":
      return <NumberEditor value={value} suffix="hours before both admins are told" />;
    case "stalled_deal_days":
      return <NumberEditor value={value} suffix="days with nothing logged" />;
    case "database_limit_bytes":
      return <NumberEditor value={value} suffix="bytes — 8589934592 on Supabase Pro" />;
    case "storage_limit_bytes":
      return <NumberEditor value={value} suffix="bytes — 107374182400 on Supabase Pro" />;
    case "quote_followup_days":
      return <NumberListEditor value={value} suffix="days after the quote goes out" />;
    case "service_area_cities":
      return <LinesEditor value={value} placeholder={"chennai\ncoimbatore\nmadurai"} />;
    case "city_aliases":
      return <PairsEditor value={value} leftLabel="what people type" rightLabel="the real city" />;
    case "rep_initials_map":
      return <PairsEditor value={value} leftLabel="initials" rightLabel="user id" />;
    case "required_fields_for_appointment":
      return <FieldsEditor value={value} />;
    case "budget_bands":
      return <BandsEditor value={value} />;
    default:
      return <textarea name="value" defaultValue={JSON.stringify(value, null, 2)} rows={6}
                       className={`${inputClass} font-mono text-xs`} />;
  }
}

function SettingEditor({ settingKey, value }: { settingKey: string; value: unknown }) {
  const meta = SETTING_HELP[settingKey] ?? { title: settingKey, help: "" };
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSetting, {});

  return (
    <form action={action} className="border-b border-border py-4 last:border-0">
      <input type="hidden" name="key" value={settingKey} />
      <p className="mb-1 text-sm font-medium text-ink">{meta.title}</p>
      {meta.help && <p className="mb-2 text-xs text-ink-muted">{meta.help}</p>}
      <SettingControl settingKey={settingKey} value={value} />
      <div className="mt-2"><Button size="sm" variant="secondary" type="submit" disabled={pending}>Save</Button></div>
      <Note state={state} />
    </form>
  );
}

function RuleEditor({ rule }: { rule: NotificationRuleRow }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateNotificationRule, {});
  return (
    <form action={action} className="border-b border-border py-3 last:border-0">
      <input type="hidden" name="id" value={rule.id} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" name="is_enabled" defaultChecked={rule.is_enabled} className="size-4 accent-navy-900" />
          {rule.trigger_key.replace(/_/g, " ")}
        </label>
        {rule.timing_type === "daily_at" || rule.timing_type === "weekly_at" ? (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            at <input name="daily_at_time" type="time" defaultValue={rule.daily_at_time?.slice(0, 5) ?? ""} className={`${inputBase} w-28 py-1`} /> IST
          </label>
        ) : rule.timing_type === "offset" ? (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            <input name="offset_minutes" type="number" min={0} defaultValue={Math.abs(rule.offset_minutes ?? 0)} className={`${inputBase} w-24 py-1`} /> minutes before
          </label>
        ) : (
          <Badge tone="neutral">immediate</Badge>
        )}
        {rule.threshold_value !== null && (
          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
            after <input name="threshold_value" type="number" defaultValue={rule.threshold_value} className={`${inputBase} w-20 py-1`} /> days
          </label>
        )}
        <span className="text-xs text-ink-muted">
          to {rule.recipient_type === "deal_owner" ? "whoever owns the deal" : rule.recipient_role ?? rule.recipient_type}
        </span>
        <Button size="sm" variant="ghost" type="submit" disabled={pending}>Save</Button>
      </div>
      {rule.body_preview && (
        <p className="mt-1.5 rounded bg-navy-50 px-2 py-1 font-mono text-xs text-ink-muted">{rule.body_preview}</p>
      )}
      <Note state={state} />
    </form>
  );
}

export default function SettingsClient({
  lists, settings, rules,
}: {
  lists: Record<string, ListValue[]>;
  settings: Record<string, unknown>;
  rules: NotificationRuleRow[];
}) {
  const tabs = ["Dropdown lists", "How it works", "Notifications"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("Dropdown lists");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === t ? "border-navy-900 font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Dropdown lists" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(lists).map(([type, values]) => (
            <ListEditor key={type} listType={type} values={values} />
          ))}
        </div>
      )}

      {tab === "How it works" && (
        <Card title="Settings" description="Change these here rather than asking a developer.">
          {Object.entries(settings)
            .filter(([k]) => k in SETTING_HELP)
            .map(([k, v]) => <SettingEditor key={k} settingKey={k} value={v} />)}
        </Card>
      )}

      {tab === "Notifications" && (
        <Card
          title="When people get told things"
          description="Turn a rule off, change its timing or its threshold. All times are India time."
        >
          {rules.map((r) => <RuleEditor key={r.id} rule={r} />)}
          <p className="mt-3 rounded-md bg-navy-50 px-3 py-2 text-xs text-ink-muted">
            The message wording cannot be edited here. WhatsApp only delivers templates Meta has
            approved in advance, so changing the words means submitting them to Meta again. The
            timing, the recipient and whether a rule runs at all are all yours to change.
          </p>
        </Card>
      )}
    </div>
  );
}
