/**
 * A proportion drawn as a length.
 *
 * Extracted because three places drew the same hairline track by hand and only
 * two of them remembered the rule that matters: **a non-zero value must never
 * render as nothing.** Four deals in a thousand is 0.4% — a sub-pixel bar that
 * reads identically to zero, which is the one distinction a bar owes its
 * reader. The Health page had it wrong; putting the rule in one place fixed it.
 *
 * `fill` takes a Tailwind class, which is how STAGE_STYLES already works: the
 * class comes from design-tokens, so nothing here names a colour.
 */
export default function Meter({
  value, max, fill = "bg-navy-700", className = "",
}: {
  value: number;
  /** The full length. Falls back to 1 so a zero-scale never divides by zero. */
  max: number;
  fill?: string;
  className?: string;
}) {
  const ceiling = max > 0 ? max : 1;
  return (
    <div className={`h-1.5 w-full rounded-full bg-navy-100 ${className}`}>
      <div
        className={`h-1.5 rounded-full ${fill}`}
        style={{
          width: `${Math.min(100, (value / ceiling) * 100)}%`,
          minWidth: value > 0 ? "0.375rem" : undefined,
        }}
      />
    </div>
  );
}
