import type { Outcomes } from "@/lib/domain/metrics";

/**
 * Where every lead ended up, in five numbers that add to the total.
 *
 * The funnel above deliberately leaves out Lost, Not Pursued and Nurture —
 * parallel exits are not steps — which means the biggest bucket of outcomes was
 * invisible, and the funnel's bars could not be reconciled with the open count.
 * This is the reconciliation.
 */
export default function OutcomeStrip({ o }: { o: Outcomes }) {
  const cells: { label: string; value: number; muted?: boolean }[] = [
    { label: "Still open", value: o.open - o.nurture },
    { label: "Parked", value: o.nurture, muted: true },
    { label: "Won", value: o.won },
    { label: "Lost", value: o.lost, muted: true },
    { label: "Not pursued", value: o.notPursued, muted: true },
  ];

  return (
    <div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label}>
            <dt className="text-xs text-ink-muted">{c.label}</dt>
            <dd className={`tabular text-sm font-medium ${c.muted ? "text-ink-muted" : "text-ink"}`}>
              {c.value.toLocaleString("en-IN")}
            </dd>
          </div>
        ))}
      </dl>
      {o.won + o.lost + o.notPursued === 0 && (
        <p className="mt-2 text-xs text-ink-muted">
          Nothing has closed yet. Every lead is still in play.
        </p>
      )}
    </div>
  );
}
