"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import StageBadge from "@/components/deals/stage-badge";
import { age, dueLabel } from "@/components/deals/relative-time";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import MultiSelect from "@/components/ui/multi-select";
import { inputBase } from "@/components/ui/field";
import { bulkAssign, type DealActionState } from "@/lib/actions/deals";
import { DEAL_STAGES } from "@/lib/domain/stages";
import { STAGE_LABELS } from "@/lib/config/design-tokens";
import { telHref } from "@/lib/domain/phone";
import { CITY_OTHER } from "@/lib/domain/city";
import { WORK_PRESETS, presetQuery, activePreset, type WorkPreset } from "@/lib/domain/presets";
import LeadDrawer, { type DrawerContext } from "@/components/deals/lead-drawer";
// Type-only: erased at compile time, so it does not pull the server module in.
import type { DealListRow } from "@/lib/queries/deals";

interface Options {
  sources: { id: number; label: string }[];
  users: { id: string; name: string; role: string }[];
  campaigns: string[];
  cities: string[];
  hasUnrecognisedCities: boolean;
}

/** The filters that take several values at once. */
const LIST_FILTERS = ["stage", "owner", "source", "city", "campaign"] as const;

export interface BulkAssignConfig {
  crmManagers: { id: string; name: string }[];
  reps: { id: string; name: string }[];
  canAssignManager: boolean;
  canAssignRep: boolean;
}

export default function DealsTable({
  rows, total, page, perPage, options, showOwners = true, showPresets = false, bulk, drawer,
}: {
  rows: DealListRow[];
  total: number;
  page: number;
  perPage: number;
  options: Options;
  showOwners?: boolean;
  /** The CRM Manager's work queue. Off for the rep view, which has its own. */
  showPresets?: boolean;
  /** Omitted for the rep view, which has nothing to hand out. */
  bulk?: BulkAssignConfig;
  /** Everything the slide-over needs that is the same for every lead. */
  drawer: DrawerContext;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [moreOpen, setMoreOpen] = useState(!!params.get("campaign"));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  /**
   * The open lead lives in the URL so it survives a refresh and can be sent to
   * someone — but it is written with the History API rather than router.push.
   * A Next navigation would re-run the page's queries and rebuild the table for
   * what is only an overlay, which makes arrow-keying through leads crawl.
   */
  const [openLead, setOpenLead] = useState<string | null>(() => params.get("lead"));

  const showLead = (id: string | null, replace = false) => {
    setOpenLead(id);
    const sp = new URLSearchParams(window.location.search);
    if (id) sp.set("lead", id); else sp.delete("lead");
    const url = `${window.location.pathname}${sp.toString() ? `?${sp}` : ""}`;
    if (replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
  };

  // Back and forward should move through the leads that were opened.
  useEffect(() => {
    const onPop = () => setOpenLead(new URLSearchParams(window.location.search).get("lead"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openIndex = openLead ? rows.findIndex((r) => r.id === openLead) : -1;

  const step = (direction: -1 | 1) => {
    if (openIndex < 0) return;
    const next = rows[openIndex + direction];
    if (next) showLead(next.id, true);
  };

  // Escape closes; arrows walk the list. Ignored while typing, and while a
  // filter dropdown is open — Escape belongs to that first.
  useEffect(() => {
    if (!openLead) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;

      if (e.key === "Escape") {
        if (document.querySelector("[role=listbox]")) return;
        showLead(null);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        step(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLead, openIndex, rows]);
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

  useEffect(() => {
    if (assignState.ok) setSelected(new Set());
  }, [assignState]);

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "page") next.delete("page");
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  /**
   * List filters are held locally as well as in the URL.
   *
   * router.push is asynchronous, so two ticks in quick succession both read the
   * same pre-push URL and the second overwrites the first — picking two stages
   * left you with one. The ref is updated synchronously on every change, so
   * each tick builds on the previous one rather than on whatever the address
   * bar happens to say.
   */
  const readFromUrl = () =>
    Object.fromEntries(LIST_FILTERS.map((k) => [k, (params.get(k) ?? "").split(",").filter(Boolean)]));

  const [lists, setLists] = useState<Record<string, string[]>>(readFromUrl);
  const listsRef = useRef(lists);

  // Re-sync when the URL changes from outside: back button, or Clear all.
  useEffect(() => {
    const fromUrl = readFromUrl();
    listsRef.current = fromUrl;
    setLists(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const listOf = (key: string) => lists[key] ?? [];

  const setList = (key: string) => (values: string[]) => {
    const next = { ...listsRef.current, [key]: values };
    listsRef.current = next;
    setLists(next);

    const sp = new URLSearchParams(params.toString());
    for (const k of LIST_FILTERS) {
      if (next[k]?.length) sp.set(k, next[k].join(",")); else sp.delete(k);
    }
    sp.delete("page");
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const FILTER_KEYS = [...LIST_FILTERS, "overdue", "uncontacted", "verification", "waking", "quotesla"];
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const pages = Math.ceil(total / perPage);
  const allShown = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const columns = (showOwners ? 8 : 7);

  /**
   * A preset replaces the filter state rather than adding to it: these are
   * views of the work, not extra conditions on the current one. Clicking the
   * active one again returns to the plain browsable list.
   */
  const preset = activePreset((k) => params.get(k));
  const applyPreset = (p: WorkPreset) =>
    startTransition(() =>
      router.push(preset?.key === p.key ? pathname : `${pathname}?${presetQuery(p)}`),
    );

  const cityOptions = [
    ...options.cities.map((c) => ({ value: c, label: c })),
    // Free text in the Meta form means pincodes, addresses and typos land in
    // this column. They stay reachable without flooding the list.
    ...(options.hasUnrecognisedCities
      ? [{ value: CITY_OTHER, label: "Other / unrecognised" }]
      : []),
  ];

  return (
    <div className="space-y-3">
      {/* The work queue. Ordered, not browsable: each of these is a filter
          combination plus an oldest-first sort, so a view stays linkable and
          Export returns exactly what is on screen. */}
      {showPresets && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Work queue">
          {WORK_PRESETS.map((p) => {
            const on = preset?.key === p.key;
            return (
              <button
                key={p.key}
                type="button"
                title={p.hint}
                aria-pressed={on}
                onClick={() => applyPreset(p)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  on
                    ? "border-navy-900 bg-navy-900 font-medium text-white"
                    : "border-border bg-paper text-ink hover:border-navy-700 hover:bg-navy-100"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Row 1 — everything that narrows the list. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a phone number or name…"
          aria-label="Search by phone number or name"
          className={`${inputBase} w-full sm:w-64`}
        />

        <MultiSelect
          label="Any stage" width="w-40"
          options={DEAL_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] }))}
          selected={listOf("stage")} onChange={setList("stage")}
        />

        {showOwners && (
          <MultiSelect
            label="Anyone" width="w-40"
            options={options.users.map((u) => ({ value: u.id, label: u.name }))}
            selected={listOf("owner")} onChange={setList("owner")}
          />
        )}

        <MultiSelect
          label="Any source" width="w-40"
          options={options.sources.map((s) => ({ value: String(s.id), label: s.label }))}
          selected={listOf("source")} onChange={setList("source")}
        />

        <MultiSelect
          label="Any city" width="w-40" searchable
          options={cityOptions}
          selected={listOf("city")} onChange={setList("city")}
        />

        <button
          type="button"
          title="Follow-up date has passed"
          onClick={() => set("overdue", params.get("overdue") ? "" : "1")}
          className={`${inputBase} ${params.get("overdue") ? "border-navy-700 bg-navy-100 font-medium" : ""}`}
        >
          Overdue
        </button>

        <button
          type="button"
          title="Nobody has logged a call yet"
          onClick={() => set("uncontacted", params.get("uncontacted") ? "" : "1")}
          className={`${inputBase} ${params.get("uncontacted") ? "border-navy-700 bg-navy-100 font-medium" : ""}`}
        >
          Never called
        </button>

        <Button size="sm" variant="ghost" onClick={() => setMoreOpen((v) => !v)}>
          {moreOpen ? "Fewer filters" : "More filters"}
        </Button>

        {activeFilters > 0 && (
          <Button size="sm" variant="ghost" onClick={() => startTransition(() => router.push(pathname))}>
            Clear all
          </Button>
        )}
      </div>

      {/* Campaign is a date-stamped ad name that grows with every ad LUCA runs.
          Useful for pulling one campaign and exporting it; not for daily work. */}
      {moreOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-navy-50 px-3 py-2">
          <span className="text-xs text-ink-muted">Campaign</span>
          <MultiSelect
            label="Any campaign" width="w-64" searchable
            options={options.campaigns.map((c) => ({ value: c, label: c }))}
            selected={listOf("campaign")} onChange={setList("campaign")}
          />
        </div>
      )}

      {/* Row 2 — selection and export. Fixed position so Export never drifts
          below when the filter row wraps. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-paper px-3 py-2">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox" checked={allShown} aria-label="Select every lead shown"
            onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
            className="size-4 accent-navy-900"
          />
          Select all
        </label>

        <span className="tabular text-sm text-ink-muted">
          {pending ? "…" : `${total.toLocaleString("en-IN")} lead${total === 1 ? "" : "s"}`}
          {selected.size > 0 && ` · ${selected.size} selected`}
        </span>

        {canBulk && selected.size > 0 && (
          <form action={assignAction} className="flex flex-wrap items-center gap-2">
            {[...selected].map((id) => <input key={id} type="hidden" name="deal_ids" value={id} />)}

            {bulk!.canAssignManager && bulk!.canAssignRep ? (
              <select name="as_role" aria-label="Assign as" className={`${inputBase} w-40 py-1 text-sm`}>
                <option value="sales_rep">As Sales Rep</option>
                <option value="crm_manager">As CRM Manager</option>
              </select>
            ) : (
              <input type="hidden" name="as_role" value={bulk!.canAssignManager ? "crm_manager" : "sales_rep"} />
            )}

            <select name="user_id" required aria-label="Assign to" className={`${inputBase} w-44 py-1 text-sm`}>
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

            <Button type="submit" size="sm" disabled={assignPending}>
              {assignPending ? "Assigning…" : `Assign ${selected.size}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </form>
        )}

        <a
          href={`/deals/export?${params.toString()}`}
          className="ml-auto rounded-md border border-border bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-navy-50"
        >
          Export
        </a>
      </div>

      {assignState.error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{assignState.error}</p>}
      {assignState.message && <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{assignState.message}</p>}

      <div className="overflow-x-auto rounded-lg border border-border bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
              <th className="w-9 px-3 py-2">
                <span className="sr-only">Select</span>
              </th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              {showOwners && <th className="px-3 py-2 font-medium">Owner</th>}
              <th className="px-3 py-2 font-medium">Next action</th>
              <th className="px-3 py-2 text-right font-medium">Age</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const due = dueLabel(d.next_action_at);
              const ticked = selected.has(d.id);
              const isOpen = openLead === d.id;
              const tel = telHref(d.customer_phone);
              return (
                <tr
                  key={d.id}
                  onClick={() => showLead(d.id)}
                  aria-current={isOpen ? "true" : undefined}
                  className={`cursor-pointer border-b border-border last:border-0 ${
                    isOpen
                      ? "bg-navy-100 shadow-[inset_3px_0_0_0_var(--navy-900)]"
                      : ticked ? "bg-navy-100" : "hover:bg-navy-50"
                  }`}
                >
                  {/* Ticking a box is selecting for a bulk action, not opening. */}
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox" checked={ticked} onChange={() => toggle(d.id)}
                      aria-label={`Select ${d.customer_name ?? d.customer_phone}`}
                      className="size-4 accent-navy-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    {/* A real href, so cmd-click and middle-click still open the
                        full page in a new tab. A plain click uses the drawer. */}
                    <Link
                      href={`/deals/${d.id}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        showLead(d.id);
                      }}
                      className="font-medium text-ink hover:text-navy-700 hover:underline"
                    >
                      {d.customer_name || "Unnamed"}
                    </Link>
                    {d.is_repeat && <Badge tone="neutral">repeat</Badge>}
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    {tel
                      ? <a href={tel} className="text-navy-700 hover:underline">{d.customer_phone}</a>
                      : <span className="text-ink-muted">{d.customer_phone}</span>}
                    {d.invalid_phone && <div><Badge tone="warning">check number</Badge></div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{d.source_label || "—"}</td>
                  <td className="px-3 py-2 text-ink-muted">{d.city || "—"}</td>
                  <td className="px-3 py-2">
                    <StageBadge stage={d.stage} firstContactedAt={d.first_contacted_at} size="sm" />
                  </td>
                  {showOwners && (
                    <td className="px-3 py-2 text-ink-muted">
                      {d.rep_owner_name || d.crm_owner_name || <span className="text-warning">Unassigned</span>}
                    </td>
                  )}
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
                <td colSpan={columns + 1} className="px-3 py-10 text-center text-sm text-ink-muted">
                  {preset?.emptyUntil
                    ? `Nothing here until ${preset.emptyUntil}.`
                    : activeFilters || q ? "No leads match that." : "No leads yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LeadDrawer
        dealId={openLead}
        ctx={drawer}
        onClose={() => showLead(null)}
        onStep={step}
        onLogged={() => step(1)}
        position={openIndex >= 0 ? { index: openIndex, total: rows.length } : null}
      />

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
