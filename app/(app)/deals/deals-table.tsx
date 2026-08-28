"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import StageBadge from "@/components/deals/stage-badge";
import { age, dueLabel } from "@/components/deals/relative-time";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import { inputBase, inputClass } from "@/components/ui/field";
import { DEAL_STAGES } from "@/lib/domain/stages";
import { STAGE_LABELS, formatAmount } from "@/lib/config/design-tokens";
import type { DealListRow } from "@/lib/queries/deals";

interface Options {
  sources: { id: number; label: string }[];
  users: { id: string; name: string; role: string }[];
  campaigns: string[];
  cities: string[];
}

export default function DealsTable({
  rows, total, page, perPage, options, showOwners = true,
}: {
  rows: DealListRow[];
  total: number;
  page: number;
  perPage: number;
  options: Options;
  showOwners?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  // Typing shouldn't fire a query per keystroke, but it should feel immediate.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => set("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  const filtered = ["stage", "owner", "source", "city", "campaign", "from", "to", "overdue", "uncontacted"]
    .some((k) => params.get(k));
  const pages = Math.ceil(total / perPage);

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
          <a href={`/deals/export?${params.toString()}`}
             className="rounded-md border border-border bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-navy-50">
            Export
          </a>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
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
              return (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-navy-50">
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
                <td colSpan={showOwners ? 7 : 6} className="px-3 py-10 text-center text-sm text-ink-muted">
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
