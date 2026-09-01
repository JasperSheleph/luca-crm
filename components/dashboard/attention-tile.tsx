import Link from "next/link";
import { ATTENTION_STATES } from "@/lib/config/design-tokens";

/**
 * One work queue, as a number you can press.
 *
 * The whole tile is the link, because the only useful thing to do with "eleven
 * overdue" is to go and look at the eleven. It lands on the same preset the
 * chip row on /deals uses, so the count and the list can never disagree.
 *
 * Severity is judged on how long the oldest has waited, not on the count: with
 * a thousand leads never called, no count threshold means anything.
 */
export default function AttentionTile({
  href, label, hint, count, oldestDays, severity, pending,
}: {
  href: string;
  label: string;
  hint: string;
  count: number;
  oldestDays: number | null;
  severity: "clear" | "watch" | "act";
  /** From the preset: why this is expected to be empty for now. */
  pending?: string;
}) {
  const s = ATTENTION_STATES[severity];
  // A bucket that cannot have anything in it yet is not "clear" — nothing has
  // been tested. Saying so is more honest than a tick.
  const expectedEmpty = count === 0 && !!pending;

  return (
    <Link
      href={href}
      title={hint}
      className="flex min-h-[5.5rem] flex-col justify-between rounded-lg border border-border bg-paper px-3 py-2.5 transition-colors hover:border-navy-700 hover:bg-navy-50"
    >
      <div className="flex items-baseline gap-1.5">
        <span className={`tabular text-2xl font-semibold ${expectedEmpty ? "text-ink-muted" : "text-ink"}`}>
          {count.toLocaleString("en-IN")}
        </span>
        {!expectedEmpty && (
          <span className={`text-sm font-semibold ${s.text}`} aria-hidden="true">{s.mark}</span>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-ink">{label}</p>
        {expectedEmpty ? (
          <p className="mt-0.5 text-xs text-ink-muted">Nothing here until {pending}.</p>
        ) : oldestDays !== null ? (
          <p className={`mt-0.5 text-xs ${s.text}`}>
            {s.word} · oldest waited {oldestDays} {oldestDays === 1 ? "day" : "days"}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-muted">{s.word}</p>
        )}
      </div>
    </Link>
  );
}
