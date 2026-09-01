import Meter from "./meter";
import type { RateRow } from "@/lib/domain/metrics";

/**
 * Contact rate and drop rate, one row per campaign or source.
 *
 * Replaces two side-by-side bar lists. Twelve bars in two columns on a phone
 * was unreadable, and splitting the two rates meant reading a name twice to
 * compare them. The lead count is shown because these are filtered to a
 * minimum: "80% reached" over eleven leads is a different claim from over four
 * hundred, and the reader cannot judge it without knowing which.
 *
 * The drop figure carries the word "dropped" rather than relying on position or
 * colour — warning and danger are indistinguishable by hue in this palette.
 */
export default function RateRows({ rows, empty }: { rows: RateRow[]; empty: string }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const contactRate = r.contacted / r.total;
        const dropRate = r.dropped / r.total;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink" title={r.label}>{r.label}</span>
              <span className="tabular shrink-0 text-sm font-medium text-ink">
                {Math.round(contactRate * 100)}% reached
              </span>
            </div>
            <Meter value={r.contacted} max={r.total} className="mt-1" />
            <p className="tabular mt-1 text-xs text-ink-muted">
              {r.total.toLocaleString("en-IN")} leads · {r.dropped.toLocaleString("en-IN")} dropped
              {r.dropped > 0 && ` (${Math.round(dropRate * 100)}%)`}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
