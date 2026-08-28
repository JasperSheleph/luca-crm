/** Marks a screen that is scaffolded but not yet built, and says what lands here. */
export default function Placeholder({ step, children }: { step: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-paper p-6">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-muted">{step}</p>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}
