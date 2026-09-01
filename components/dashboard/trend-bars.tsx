import { formatMonth } from "@/lib/config/design-tokens";
import type { MonthPoint } from "@/lib/domain/metrics";

/**
 * Leads per month, each column split into called and not-yet-called.
 *
 * Intake and response in one mark: a tall column that is mostly pale is a month
 * the ads worked and nobody rang back. Every column is directly labelled and
 * carries both numbers in its `aria-label`, so nothing rests on the two tints.
 *
 * Divs rather than SVG. With twelve labelled columns there is no scaling maths
 * to do and no text alternative to invent, and it matches how every other mark
 * in this app is drawn.
 */
export default function TrendBars({ points }: { points: MonthPoint[] }) {
  // Two bars are not a trend. Below three months, say the numbers instead of
  // drawing a shape that implies a direction.
  if (points.filter((p) => p.total > 0).length < 3) {
    const seen = points.filter((p) => p.total > 0);
    return (
      <p className="py-4 text-sm text-ink-muted">
        {seen.length === 0
          ? "No leads recorded yet."
          : `Not enough months to show a trend yet — ${seen
              .map((p) => `${formatMonth(p.key)}: ${p.total}`)
              .join(", ")}.`}
      </p>
    );
  }

  const ceiling = Math.max(...points.map((p) => p.total), 1);

  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {points.map((p) => {
          const uncalled = p.total - p.contacted;
          return (
            <div
              key={p.key}
              // h-full matters: the percentage heights below resolve against
              // this column, and without an explicit height it is auto — which
              // makes every bar zero tall while the numbers still read fine.
              className="flex h-full flex-1 flex-col justify-end"
              role="img"
              aria-label={`${formatMonth(p.key)}: ${p.total} leads, ${p.contacted} called`}
            >
              <div
                className="w-full rounded-t-sm bg-navy-100"
                style={{ height: `${(uncalled / ceiling) * 100}%` }}
              />
              <div
                className="w-full bg-navy-700"
                style={{
                  height: `${(p.contacted / ceiling) * 100}%`,
                  // Same rule as Meter: one called lead must not look like none.
                  minHeight: p.contacted > 0 ? "2px" : undefined,
                }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1 flex gap-1">
        {points.map((p) => (
          <span key={p.key} className="flex-1 truncate text-center text-[10px] text-ink-muted">
            {formatMonth(p.key).slice(0, 3)}
          </span>
        ))}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-navy-700" aria-hidden="true" /> called
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-navy-100" aria-hidden="true" /> not called yet
        </span>
      </p>
    </div>
  );
}
