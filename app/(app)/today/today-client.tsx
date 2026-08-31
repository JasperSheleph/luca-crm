"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import { startVisit, type VisitState } from "@/lib/actions/visits";
import { telHref } from "@/lib/domain/phone";
import { formatDateTime } from "@/lib/config/design-tokens";
import type { TodayRow } from "@/lib/queries/visits";

/**
 * Check in straight from the day's list.
 *
 * The rep is standing outside the building holding a phone; making them open
 * the deal first is the difference between this being used and not. Checking
 * out needs notes, so that stays on the deal.
 */
function CheckIn({ row }: { row: TodayRow }) {
  const [state, action] = useActionState<VisitState, FormData>(startVisit, {});
  useDealChanged(state);
  const formRef = useRef<HTMLFormElement>(null);
  const [locating, setLocating] = useState(false);

  const go = async () => {
    setLocating(true);
    // Location is a deterrent, not proof, and a basement with no fix must not
    // stop a rep working — so this gives up rather than blocking.
    const at = await new Promise<GeolocationPosition | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        resolve, () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    });
    setLocating(false);
    const form = formRef.current!;
    (form.elements.namedItem("start_lat") as HTMLInputElement).value = at ? String(at.coords.latitude) : "";
    (form.elements.namedItem("start_lng") as HTMLInputElement).value = at ? String(at.coords.longitude) : "";
    form.requestSubmit();
  };

  if (row.visit && !row.visit.completed_at) {
    return (
      <Link href={`/deals/${row.deal_id}`}>
        <Button size="sm" variant="secondary">Check out</Button>
      </Link>
    );
  }
  if (row.visit?.completed_at) return <Badge tone="success">Done</Badge>;

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="deal_id" value={row.deal_id} />
      <input type="hidden" name="appointment_id" value={row.appointment.id} />
      <input type="hidden" name="start_lat" defaultValue="" />
      <input type="hidden" name="start_lng" defaultValue="" />
      <Button type="button" size="sm" disabled={locating} onClick={go}>
        {locating ? "Locating…" : "Check in"}
      </Button>
      {state.error && <p role="alert" className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export default function TodayClient({
  appointments, overdue,
}: {
  appointments: TodayRow[];
  overdue: {
    id: string; customer_name: string | null; customer_phone: string;
    city: string | null; next_action_at: string | null; next_action_note: string | null;
  }[];
}) {
  return (
    <div className="space-y-4">
      <Card
        title="Visits today"
        description={appointments.length ? undefined : "Nothing booked for today"}
      >
        {appointments.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No visits today. Anything overdue is below.
          </p>
        ) : (
          <ul className="space-y-3">
            {appointments.map((row) => {
              const tel = telHref(row.customer_phone);
              return (
                <li key={row.appointment.id} className="flex flex-wrap items-start gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/deals/${row.deal_id}`} className="text-sm font-medium text-ink hover:underline">
                      {row.customer_name || "Unnamed lead"}
                    </Link>
                    <p className="tabular mt-0.5 text-xs text-ink-muted">
                      {formatDateTime(row.appointment.scheduled_at)}
                      {row.city && ` · ${row.city}`}
                    </p>
                    {row.site_address && (
                      <p className="mt-0.5 text-xs text-ink-muted">{row.site_address}</p>
                    )}
                    {/* Two taps on a phone: ring them, or start the visit. */}
                    {tel && (
                      <a href={tel} className="tabular mt-1 inline-block text-xs font-medium text-navy-700 hover:underline">
                        {row.customer_phone}
                      </a>
                    )}
                  </div>
                  <CheckIn row={row} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Overdue"
        description={overdue.length ? "The follow-up date has passed" : undefined}
      >
        {overdue.length === 0 ? (
          <p className="text-sm text-ink-muted">Nothing overdue. </p>
        ) : (
          <ul className="space-y-2">
            {overdue.map((d) => {
              const tel = telHref(d.customer_phone);
              return (
                <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 border-b border-border pb-2 last:border-0 last:pb-0">
                  <Link href={`/deals/${d.id}`} className="text-sm font-medium text-ink hover:underline">
                    {d.customer_name || "Unnamed lead"}
                  </Link>
                  {tel && (
                    <a href={tel} className="tabular text-xs font-medium text-navy-700 hover:underline">
                      {d.customer_phone}
                    </a>
                  )}
                  {d.next_action_note && <span className="text-xs text-ink-muted">{d.next_action_note}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
