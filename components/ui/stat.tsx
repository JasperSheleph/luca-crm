import { formatAmount } from "@/lib/config/design-tokens";

/** A single number with a label. Used by the import preview and the dashboard. */
export default function Stat({
  label, value, tone = "neutral", hint,
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "success" | "warning" | "danger" | "muted";
  hint?: string;
}) {
  const tones = {
    neutral: "text-ink",
    success: "text-success",
    warning: "text-warning",
    danger:  "text-danger",
    muted:   "text-ink-muted",
  } as const;
  return (
    <div className="rounded-md border border-border bg-paper px-3 py-2.5">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={`tabular mt-0.5 text-xl font-semibold ${tones[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export { formatAmount };
