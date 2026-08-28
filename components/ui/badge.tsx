export default function Badge({
  children, tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "muted";
}) {
  const tones = {
    neutral: "bg-navy-100 text-navy-700 border-navy-700/20",
    success: "bg-success/10 text-success border-success/25",
    warning: "bg-warning/10 text-warning border-warning/25",
    danger:  "bg-danger/10 text-danger border-danger/25",
    muted:   "bg-parked/10 text-parked border-parked/25",
  } as const;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
