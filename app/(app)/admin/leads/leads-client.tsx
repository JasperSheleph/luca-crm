"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkAssign, type DealActionState } from "@/lib/actions/deals";
import StageBadge from "@/components/deals/stage-badge";
import { age } from "@/components/deals/relative-time";
import Button from "@/components/ui/button";
import Badge from "@/components/ui/badge";
import { inputBase } from "@/components/ui/field";
import type { DealListRow } from "@/lib/queries/deals";

export default function LeadsClient({
  rows, crmManagers, reps,
}: {
  rows: DealListRow[];
  crmManagers: { id: string; name: string }[];
  reps: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState<DealActionState, FormData>(bulkAssign, {});

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allShown = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-paper px-3 py-2">
        <span className="tabular text-sm text-ink-muted">
          {selected.size > 0 ? `${selected.size} selected` : `${rows.length} shown`}
        </span>

        {selected.size > 0 && (
          <>
            {[...selected].map((id) => <input key={id} type="hidden" name="deal_ids" value={id} />)}

            <select name="as_role" aria-label="Assign as" className={`${inputBase} w-40 py-1 text-sm`}>
              <option value="crm_manager">As CRM Manager</option>
              <option value="sales_rep">As Sales Rep</option>
            </select>

            <select name="user_id" required aria-label="Assign to" className={`${inputBase} w-48 py-1 text-sm`}>
              <option value="">Assign to…</option>
              <optgroup label="CRM Managers">
                {crmManagers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
              <optgroup label="Sales Reps">
                {reps.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            </select>

            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Assigning…" : `Assign ${selected.size}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        )}
      </div>

      {state.error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      {state.message && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{state.message}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="w-9 px-3 py-2">
                <input
                  type="checkbox" checked={allShown} aria-label="Select all shown"
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  className="size-4 accent-navy-900"
                />
              </th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">CRM Manager</th>
              <th className="px-3 py-2 font-medium">Sales Rep</th>
              <th className="px-3 py-2 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={`border-b border-border last:border-0 ${selected.has(d.id) ? "bg-navy-100" : "hover:bg-navy-50"}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)}
                    aria-label={`Select ${d.customer_name ?? d.customer_phone}`}
                    className="size-4 accent-navy-900"
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/deals/${d.id}`} className="font-medium text-ink hover:text-navy-700 hover:underline">
                    {d.customer_name || "Unnamed"}
                  </Link>
                  <div className="tabular text-xs text-ink-muted">{d.customer_phone}</div>
                </td>
                <td className="px-3 py-2 text-ink-muted">{d.city || "—"}</td>
                <td className="px-3 py-2"><StageBadge stage={d.stage} size="sm" /></td>
                <td className="px-3 py-2 text-ink-muted">
                  {d.crm_owner_name ?? <Badge tone="warning">none</Badge>}
                </td>
                <td className="px-3 py-2 text-ink-muted">{d.rep_owner_name ?? "—"}</td>
                <td className="tabular px-3 py-2 text-right text-ink-muted">{age(d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
