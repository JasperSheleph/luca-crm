"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useActionState, useEffect, useState, useTransition } from "react";
import StageBadge from "@/components/deals/stage-badge";
import { age, dueLabel } from "@/components/deals/relative-time";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import { inputBase, inputClass } from "@/components/ui/field";
import { bulkAssign, type DealActionState } from "@/lib/actions/deals";
import { DEAL_STAGES } from "@/lib/domain/stages";
import { STAGE_LABELS, formatAmount } from "@/lib/config/design-tokens";
import type { DealListRow } from "@/lib/queries/deals";

interface Options {
  sources: { id: number; label: string }[];
  users: { id: string; name: string; role: string }[];
  campaigns: string[];
  cities: string[];
}

export interface BulkAssignConfig {
  crmManagers: { id: string; name: string }[];
  reps: { id: string; name: string }[];
  canAssignManager: boolean;
  canAssignRep: boolean;
}

export default function DealsTable({
  rows, total, page, perPage, options, showOwners = true, bulk,
}: {
  rows: DealListRow[];
  total: number;
  page: number;
  perPage: number;
  options: Options;
  showOwners?: boolean;
  /** Omitted for the rep view, which has nothing to hand out. */
  bulk?: BulkAssignConfig;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Selection is off until asked for, so the ordinary path — find a lead, open
  // it — is never cluttered by checkboxes nobody wanted.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignState, assignAction, assignPending] = useActionState<DealActionState, FormData>(bulkAssign, {});

  const canBulk = !!bulk && (bulk.canAssignManager || bulk.canAssignRep);

  // Typing shouldn't fire a query per keystroke, but it should feel immediate.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => set("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // A successful assign leaves stale ticks behind otherwise.
  useEffect(() => {
    if (assignState.ok) setSelected(new Set());
  }, [assignState]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const filtered = ["stage", "owner", "source", "city", "campaign", "from", "to", "overdue", "uncontacted"]
    .some((k) => params.get(k));
  const pages = Math.ceil(total / perPage);
  const allShown = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const columns = (showOwners ? 7 : 6) + (selecting ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a phone number or name…"
          aria-label="Search by phone number or name"
          className={`${inputBase} w-full sm:w-72`}
        />

        <select value={params.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)}
                aria-label="Stage" className={`${inputBase} w-40`}>
          <option value="">Any stage</option>
          {DEAL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
        </select>

        {showOwners && (
          <select value={params.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)}
                  aria-label="Owner" className={`${inputBase} w-44`}>
            <option value="">Anyone</option>
            {options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}

        <select value={params.get("source") ?? ""} onChange={(e) => set("source", e.target.value)}
                aria-label="Source" className={`${inputBase} w-40`}>
          <option value="">Any source</option>
          {options.sources.map((s) => <option key={s.id} value={String(s.id)}>{s.label}</option>)}
        </select>

        <select value={params.get("city") ?? ""} onChange={(e) => set("city", e.target.value)}
                aria-label="City" className={`${inputBase} w-40`}>
          <option value="">Any city</option>
          {options.cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <select value={params.get("campaign") ?? ""} onChange={(e) => set("campaign", e.target.value)}
                aria-label="Campaign" className={`${inputBase} w-52`}>
          <option value="">Any campaign</option>
          {options.campaigns.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <Button size="sm" variant={params.get("overdue") ? "primary" : "secondary"}
                onClick={() => set("overdue", params.get("overdue") ? "" : "1")}>
          Overdue
        </Button>
        <Button size="sm" variant={params.get("uncontacted") ? "primary" : "secondary"}
                onClick={() => set("uncontacted", params.get("uncontacted") ? "" : "1")}>
          Never called
        </Button>

        {filtered && (
          <Button size="sm" variant="ghost" onClick={() => startTransition(() => router.push(pathname))}>
            Clear
          </Button>
        )}

        <span className="ml-auto flex items-center gap-2">
          <span className="tabular text-sm text-ink-muted">
            {pending ? "…" : `${total.toLocaleString("en-IN")} lead${total === 1 ? "" : "s"}`}
          </span>

          {canBulk && (
            <Button
              size="sm"
              variant={selecting ? "primary" : "secondary"}
              onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}
            >
              {selecting ? "Done" : "Select"}
            </Button>
          )}

          <a href={`/deals/export?${params.toString()}`}
             className="rounded-md border border-border bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-navy-50">
            Export
          </a>
        </span>
      </div>

      {/* Filter first, then select — which is why this lives on the deals list
          rather than a second screen with its own, weaker filters. */}
      {selecting && canBulk && (
        <form action={assignAction} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-navy-50 px-3 py-2">
          <span className="tabular text-sm text-ink-muted">
            {selected.size > 0 ? `${selected.size} selected` : "Tick the leads to hand over"}
          </span>

          {[...selected].map((id) => <input key={id} type="hidden" name="deal_ids" value={id} />)}

          {bulk!.canAssignManager && bulk!.canAssignRep ? (
            <select name="as_role" aria-label="Assign as" className={`${inputBase} w-40 py-1 text-sm`}>
              <option value="sales_rep">As Sales Rep</option>
              <option value="crm_manager">As CRM Manager</option>
            </select>
          ) : (
            <input type="hidden" name="as_role" value={bulk!.canAssignManager ? "crm_manager" : "sales_rep"} />
          )}

          <select name="user_id" required aria-label="Assign to" className={`${inputBase} w-48 py-1 text-sm`}>
            <option value="">Assign to…</option>
            {bulk!.canAssignRep && (
              <optgroup label="Sales Reps">
                {bulk!.reps.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            )}
            {bulk!.canAssignManager && (
              <optgroup label="CRM Managers">
                {bulk!.crmManagers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            )}
          </select>

          <Button type="submit" size="sm" disabled={assignPending || selected.size === 0}>
            {assignPending ? "Assigning…" : `Assign ${selected.size || ""}`.trim()}
          </Button>

          {selected.size > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          )}
        </form>
      )}

      {assignState.error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{assignState.error}</p>}
      {assignState.message && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{assignState.message}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              {selecting && (
                <th className="w-9 px-3 py-2">
                  <input
                    type="checkbox" checked={allShown} aria-label="Select every lead shown"
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                    className="size-4 accent-navy-900"
                  />
                </th>
              )}
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              {showOwners && <th className="px-3 py-2 font-medium">Owner</th>}
              <th className="px-3 py-2 font-medium">Budget</th>
              <th className="px-3 py-2 font-medium">Next action</th>
              <th className="px-3 py-2 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const due = dueLabel(d.next_action_at);
              const ticked = selected.has(d.id);
              return (
                <tr key={d.id} className={`border-b border-border last:border-0 ${ticked ? "bg-navy-100" : "hover:bg-navy-50"}`}>
                  {selecting && (
                    <td className="px-3 py-2">
                      <input
                        type="checkbox" checked={ticked} onChange={() => toggle(d.id)}
                        aria-label={`Select ${d.customer_name ?? d.customer_phone}`}
                        className="size-4 accent-navy-900"
                      />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Link href={`/deals/${d.id}`} className="font-medium text-ink hover:text-navy-700 hover:underline">
                      {d.customer_name || "Unnamed"}
                    </Link>
                    <div className="tabular flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                      {d.customer_phone}
                      {d.is_repeat && <Badge tone="neutral">repeat</Badge>}
                      {d.invalid_phone && <Badge tone="warning">check number</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{d.city || "—"}</td>
                  <td className="px-3 py-2"><StageBadge stage={d.stage} size="sm" /></td>
                  {showOwners && (
                    <td className="px-3 py-2 text-ink-muted">
                      {d.rep_owner_name || d.crm_owner_name || <span className="text-warning">Unassigned</span>}
                    </td>
                  )}
                  <td className="tabular px-3 py-2 text-ink-muted">
                    {d.budget_amount ? formatAmount(d.budget_amount) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {due
                      ? <span className={due.overdue ? "font-medium text-danger" : "text-ink-muted"}>{due.text}</span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="tabular px-3 py-2 text-right text-ink-muted">{age(d.created_at)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-3 py-10 text-center text-sm text-ink-muted">
                  {filtered || q ? "No leads match that." : "No leads yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="tabular text-ink-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>
              Previous
            </Button>
            <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export { inputClass };
