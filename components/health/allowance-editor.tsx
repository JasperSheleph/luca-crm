"use client";

import { useActionState } from "react";
import { updateSetting, type ActionState } from "@/lib/actions/settings";
import Button from "@/components/ui/button";
import { inputBase } from "@/components/ui/field";

/**
 * The two Supabase plan allowances, edited where the percentages they scale
 * are read.
 *
 * They used to live in Admin → Settings, one screen away from the only numbers
 * they affect. They are not really settings in the sense the rest of that page
 * means — nothing about how LUCA works changes — they are the denominator of
 * two figures on this page.
 *
 * They cannot simply be dropped: the migration seeds both at the Supabase FREE
 * tier, so on the day LUCA move to Pro every percentage here reads about
 * sixteen and a hundred times too high. Editing them has to stay a row edit
 * rather than a code change.
 */

const GB = 1_073_741_824;

function Row({
  settingKey, label, value, proValue, proLabel,
}: {
  settingKey: string;
  label: string;
  value: number;
  proValue: number;
  proLabel: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSetting, {});

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="key" value={settingKey} />
      <label className="w-28 shrink-0 text-xs text-ink-muted" htmlFor={settingKey}>{label}</label>
      <input
        id={settingKey} name="value" type="number" min={1} defaultValue={value}
        className={`${inputBase} w-48 py-1 text-sm`}
      />
      <span className="text-xs text-ink-muted">bytes — {proLabel} is {proValue} on Pro</span>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {state.error && <span role="alert" className="text-xs text-danger">{state.error}</span>}
      {state.message && <span className="text-xs text-success">{state.message}</span>}
    </form>
  );
}

export default function AllowanceEditor({
  databaseBytes, storageBytes,
}: {
  databaseBytes: number;
  storageBytes: number;
}) {
  return (
    <div className="mt-4 space-y-2 rounded-md border border-border bg-navy-50 px-3 py-3">
      <p className="text-xs text-ink-muted">
        The two percentages above are measured against your Supabase plan&rsquo;s allowance.
        Change these the day the plan changes — against the wrong allowance the
        percentages mean nothing.
      </p>
      <Row
        settingKey="database_limit_bytes" label="Database" value={databaseBytes}
        proValue={8 * GB} proLabel="8 GB"
      />
      <Row
        settingKey="storage_limit_bytes" label="File storage" value={storageBytes}
        proValue={100 * GB} proLabel="100 GB"
      />
    </div>
  );
}
