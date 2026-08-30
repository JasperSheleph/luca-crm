/**
 * A ranked list of magnitudes.
 *
 * One hue for every bar, never a value-ramp: the length already encodes the
 * size, and colouring darker-where-bigger spends the only free channel saying
 * the same thing twice. Every row is directly labelled, so identity never rests
 * on colour — which is also what makes this readable in greyscale and to a
 * colourblind reader without any further work.
 *
 * Bars are thin, the track is a hairline tint, and there is no border drawn
 * around a mark. Server component: nothing here needs to be interactive, and a
 * tooltip on a directly-labelled bar would repeat what is already on screen.
 */

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** Rendered instead of the raw number, e.g. "62%" or "12 of 40". */
  display?: string;
  /** Muted styling for a folded tail — "Other" is not a finding. */
  muted?: boolean;
}

export default function BarList({
  rows, empty = "Nothing yet.", max,
}: {
  rows: BarRow[];
  empty?: string;
  /** Fix the scale across two lists that should be compared. */
  max?: number;
}) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  }

  // Scale to the largest bar, not to the total: this compares rows to each
  // other, and a share-of-total scale would leave every bar a sliver.
  const ceiling = max ?? Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className={`truncate text-sm ${r.muted ? "text-ink-muted" : "text-ink"}`} title={r.label}>
              {r.label}
            </span>
            <span className="tabular shrink-0 text-sm font-medium text-ink">
              {r.display ?? r.value.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-navy-100">
            <div
              className={`h-1.5 rounded-full ${r.muted ? "bg-parked" : "bg-navy-700"}`}
              style={{
                width: `${ceiling > 0 ? (r.value / ceiling) * 100 : 0}%`,
                // A non-zero value must never render as nothing. Four deals out
                // of a thousand is 0.4% — a sub-pixel bar that reads identical
                // to zero, which is the one distinction this chart owes the
                // reader. The exact figure sits beside it either way.
                minWidth: r.value > 0 ? "0.375rem" : undefined,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
