import { STAGE_LABELS, formatAmount, formatDateTime } from "@/lib/config/design-tokens";
import type { DealStage } from "@/lib/domain/stages";
import type { TimelineEntry } from "@/lib/queries/deals";

/**
 * The timeline. This replaces a spreadsheet cell that currently holds an entire
 * call history as free text — the core value of the whole project.
 *
 * Append-only. Nothing here is editable, by anyone, including admins.
 */

const TYPE_META: Record<string, { label: string; dot: string }> = {
  call:                { label: "Call",          dot: "bg-navy-700" },
  note:                { label: "Note",          dot: "bg-ink-muted" },
  whatsapp:            { label: "WhatsApp",      dot: "bg-success" },
  stage_change:        { label: "Stage",         dot: "bg-navy-900" },
  assignment:          { label: "Assigned",      dot: "bg-navy-700" },
  appointment_set:     { label: "Appointment",   dot: "bg-navy-800" },
  appointment_changed: { label: "Rescheduled",   dot: "bg-warning" },
  visit_started:       { label: "Checked in",    dot: "bg-navy-800" },
  visit_completed:     { label: "Visit done",    dot: "bg-navy-900" },
  demo_visit:          { label: "Demo visit",    dot: "bg-navy-700" },
  commitment:          { label: "Promised",      dot: "bg-warning" },
  quote_sent:          { label: "Quote",         dot: "bg-warning" },
  verification_call:   { label: "Verification",  dot: "bg-navy-800" },
  imported_note:       { label: "From spreadsheet", dot: "bg-parked" },
};

const VERIFICATION_SAID: Record<string, string> = {
  confirmed:   "Customer confirmed the visit",
  failed:      "Customer says no visit happened",
  unreachable: "Could not reach the customer",
};

/**
 * The one-line summary. Everything here reads off `metadata`, which the server
 * actions write — the timeline never queries anything itself.
 */
function describe(entry: TimelineEntry): string | null {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;

  if (entry.type === "stage_change") {
    const to = m.to as string | undefined;
    if (to) {
      const label = STAGE_LABELS[to as DealStage] ?? to;
      const from = m.from ? STAGE_LABELS[m.from as DealStage] ?? String(m.from) : null;
      return from ? `${from} → ${label}` : `Moved to ${label}`;
    }
  }

  if (entry.type === "appointment_set" && m.scheduled_at) {
    return `Visit booked for ${formatDateTime(String(m.scheduled_at))}`;
  }

  if (entry.type === "appointment_changed") {
    if (m.status) {
      const status = String(m.status);
      return status === "confirmed" ? "Visit confirmed"
        : status === "cancelled" ? "Visit cancelled"
        : status === "no_show" ? "Customer did not show" : `Visit ${status}`;
    }
    if (m.to) return `Moved to ${formatDateTime(String(m.to))}`;
  }

  // Location is a deterrent, not proof — but its absence is worth seeing.
  if ((entry.type === "visit_started" || entry.type === "visit_completed") && m.lat === null) {
    return entry.type === "visit_started" ? "Checked in — no location" : "Visit done — no location";
  }

  if (entry.type === "verification_call") {
    if (m.resolved_to) {
      return m.resolved_to === "confirmed"
        ? "Admin resolved: the visit did happen"
        : "Admin resolved: the check does not apply";
    }
    if (m.outcome) return VERIFICATION_SAID[String(m.outcome)] ?? String(m.outcome);
  }

  if (entry.type === "quote_sent") {
    const parts = [`Quote v${m.version_no ?? "?"}`];
    if (typeof m.amount === "number") parts.push(formatAmount(m.amount));
    if (m.is_final) parts.push("final");
    return parts.join(" · ");
  }

  return null;
}

export default function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-muted">
        Nothing logged yet. The first call will appear here.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {entries.map((e, i) => {
        const meta = TYPE_META[e.type] ?? { label: e.type, dot: "bg-ink-muted" };
        const summary = describe(e);
        const commitment = e.type === "commitment" ? (e.metadata as { due_date?: string } | null) : null;

        return (
          <li key={e.id} className="relative flex gap-3 pb-4">
            {i < entries.length - 1 && (
              <span className="absolute left-[3px] top-3 h-full w-px bg-border" aria-hidden="true" />
            )}
            <span className={`relative mt-1.5 size-1.5 shrink-0 rounded-full ${meta.dot}`} aria-hidden="true" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-ink">
                  {e.disposition_label ?? summary ?? meta.label}
                </span>
                {e.disposition_label && <span className="text-xs text-ink-muted">{meta.label}</span>}
                <span className="tabular text-xs text-ink-muted">{formatDateTime(e.occurred_at)}</span>
                {e.user_name && <span className="text-xs text-ink-muted">· {e.user_name}</span>}
              </div>

              {commitment?.due_date && (
                <p className="mt-0.5 text-xs font-medium text-warning">
                  Promised by {commitment.due_date}
                </p>
              )}

              {e.notes && (
                <p
                  className={`mt-1 whitespace-pre-wrap text-sm text-ink ${
                    e.type === "imported_note"
                      ? "rounded border border-border bg-navy-50 p-2.5 font-mono text-xs leading-relaxed text-ink-muted"
                      : ""
                  }`}
                >
                  {e.notes}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
