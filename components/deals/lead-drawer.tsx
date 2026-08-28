"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Badge from "@/components/ui/badge";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import StageBadge from "@/components/deals/stage-badge";
import Timeline from "@/components/deals/timeline";
import LogActivity from "@/components/deals/log-activity";
import { StageControl, NextActionControl } from "@/components/deals/deal-controls";
import { age } from "@/components/deals/relative-time";
import { allowedTransitions, type DealStage } from "@/lib/domain/stages";
import { telHref } from "@/lib/domain/phone";
import { formatAmount, formatDate } from "@/lib/config/design-tokens";
import type { Role } from "@/lib/domain/permissions";
import type { ListValue } from "@/lib/types";
import type { DealDetail, TimelineEntry } from "@/lib/queries/deals";

export interface DrawerContext {
  role: Role;
  requiredFieldsForAppointment: string[];
  lists: Record<string, ListValue[]>;
}

interface Payload {
  deal: DealDetail;
  timeline: TimelineEntry[];
}

/**
 * A lead opened over the list rather than instead of it.
 *
 * Deliberately NOT modal: no backdrop, and nothing traps focus. The list keeps
 * working underneath — filters, scrolling, ticking boxes — because the job this
 * serves is running down a queue of leads, not studying one in isolation. For
 * that, "Open full deal" goes to the real page.
 */
export default function LeadDrawer({
  dealId, ctx, onClose, onStep, position,
}: {
  dealId: string | null;
  ctx: DrawerContext;
  onClose: () => void;
  /** Move to the previous/next lead in the list currently on screen. */
  onStep: (direction: -1 | 1) => void;
  position: { index: number; total: number } | null;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Arrow-keying back to a lead already seen should be instant, so what has
  // been fetched stays fetched for the life of the page.
  const cache = useRef<Map<string, Payload>>(new Map());
  const requestFor = useRef<string | null>(null);

  useEffect(() => {
    if (!dealId) { setPayload(null); setError(null); return; }

    const cached = cache.current.get(dealId);
    if (cached) { setPayload(cached); setError(null); setLoading(false); }

    requestFor.current = dealId;
    if (!cached) setLoading(true);

    const controller = new AbortController();
    fetch(`/api/deals/${dealId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "That lead is not available." : "Could not load that lead.");
        return (await res.json()) as Payload;
      })
      .then((data) => {
        cache.current.set(dealId, data);
        // A slow response for a lead already stepped past must not overwrite
        // whatever is on screen now.
        if (requestFor.current !== dealId) return;
        setPayload(data); setError(null);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError" || requestFor.current !== dealId) return;
        setError(e.message);
      })
      .finally(() => { if (requestFor.current === dealId) setLoading(false); });

    return () => controller.abort();
  }, [dealId]);

  // Logging a call from in here changes the timeline; the server action
  // revalidates the route, so drop the cached copy and re-read it.
  useEffect(() => {
    if (!dealId) return;
    const onRefresh = () => {
      cache.current.delete(dealId);
      fetch(`/api/deals/${dealId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Payload | null) => { if (d && requestFor.current === dealId) { cache.current.set(dealId, d); setPayload(d); } })
        .catch(() => {});
    };
    window.addEventListener("luca:deal-changed", onRefresh);
    return () => window.removeEventListener("luca:deal-changed", onRefresh);
  }, [dealId]);

  const open = !!dealId;
  const deal = payload?.deal;

  const transitions: DealStage[] = deal
    ? allowedTransitions({
        role: ctx.role,
        requiredFieldsForAppointment: ctx.requiredFieldsForAppointment,
        deal: deal as never,
        // Both are collected by the form; this only decides which buttons show.
        reasonId: 1,
        advanceAmount: 1,
      })
    : [];

  const tel = deal ? telHref(deal.customer_phone) : undefined;

  return (
    <aside
      aria-hidden={!open}
      aria-label="Lead details"
      /* z-50 puts it above the mobile bottom nav (z-40). On a phone this is a
         full-screen view and should own the screen; the nav comes back the
         moment it closes. On desktop it sits beside the list, which keeps
         working underneath. */
      className={`fixed inset-0 z-50 flex flex-col border-border bg-paper shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none md:inset-y-0 md:left-auto md:right-0 md:w-[34rem] md:border-l lg:w-[38rem] ${
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      {/* Header stays put while the body scrolls. */}
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          {deal ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-ink">
                  {deal.customer_name || "Unnamed lead"}
                </h2>
                <StageBadge stage={deal.stage} firstContactedAt={deal.first_contacted_at} size="sm" />
              </div>
              <p className="mt-0.5 truncate text-xs text-ink-muted">
                {[deal.city, deal.source_label].filter(Boolean).join(" · ")}
              </p>
            </>
          ) : (
            <h2 className="text-base font-semibold text-ink">{loading ? "Loading…" : "Lead"}</h2>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {position && (
            <>
              <span className="tabular hidden pr-1 text-xs text-ink-muted sm:inline">
                {position.index + 1} of {position.total}
              </span>
              <button
                type="button" onClick={() => onStep(-1)} aria-label="Previous lead"
                disabled={position.index <= 0}
                className="rounded px-1.5 py-1 text-sm text-ink-muted hover:bg-navy-50 hover:text-ink disabled:opacity-30"
              >↑</button>
              <button
                type="button" onClick={() => onStep(1)} aria-label="Next lead"
                disabled={position.index >= position.total - 1}
                className="rounded px-1.5 py-1 text-sm text-ink-muted hover:bg-navy-50 hover:text-ink disabled:opacity-30"
              >↓</button>
            </>
          )}
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="rounded px-2 py-1 text-sm text-ink-muted hover:bg-navy-50 hover:text-ink"
          >✕</button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {!deal && loading && (
          <div className="space-y-3" aria-hidden="true">
            <div className="h-16 animate-pulse rounded-md bg-navy-50" />
            <div className="h-32 animate-pulse rounded-md bg-navy-50" />
          </div>
        )}

        {deal && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-navy-50 px-3 py-2 text-sm">
              {tel
                ? <a href={tel} className="tabular font-medium text-navy-700 hover:underline">{deal.customer_phone}</a>
                : <span className="tabular text-ink-muted">{deal.customer_phone}</span>}
              {deal.invalid_phone && <Badge tone="warning">check number</Badge>}
              {deal.is_repeat && <Badge tone="neutral">repeat</Badge>}
              <span className="ml-auto text-xs text-ink-muted">
                {age(deal.created_at)} old · {deal.first_contacted_at
                  ? `first called ${formatDate(deal.first_contacted_at)}`
                  : "never called"}
              </span>
            </div>

            {deal.budget_amount ? (
              <p className="text-sm text-ink-muted">Budget {formatAmount(deal.budget_amount)}</p>
            ) : null}

            <Card title="Log what happened">
              <LogActivity dealId={deal.id} dispositions={ctx.lists.call_disposition ?? []} />
            </Card>

            <StageControl
              dealId={deal.id}
              stage={deal.stage}
              allowed={transitions}
              lossReasons={ctx.lists.loss_reason ?? []}
              notPursuedReasons={ctx.lists.not_pursued_reason ?? []}
            />

            <NextActionControl
              dealId={deal.id}
              at={deal.next_action_at}
              note={deal.next_action_note}
            />

            <Card
              title="History"
              description={`${payload!.timeline.length} entr${payload!.timeline.length === 1 ? "y" : "ies"}, newest first`}
            >
              <Timeline entries={payload!.timeline} />
            </Card>
          </>
        )}
      </div>

      {deal && (
        <footer className="border-t border-border px-4 py-2.5">
          <Link href={`/deals/${deal.id}`}>
            <Button size="sm" variant="secondary">Open full deal</Button>
          </Link>
          <span className="ml-3 text-xs text-ink-muted">
            Esc closes · <kbd>↑</kbd> <kbd>↓</kbd> move between leads
          </span>
        </footer>
      )}
    </aside>
  );
}
