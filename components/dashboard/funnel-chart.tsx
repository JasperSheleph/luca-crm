import { STAGE_LABELS, STAGE_STYLES } from "@/lib/config/design-tokens";
import type { Bucket } from "@/lib/domain/metrics";
import type { DealStage } from "@/lib/domain/stages";

/**
 * The pipeline, stage by stage.
 *
 * Only the six funnel steps. Lost, Not Pursued and Nurture are parallel exits,
 * not stages a deal passes through, and drawing them as bars here would invent
 * a funnel that narrows for reasons it does not actually narrow for. They are
 * counted separately on the page.
 *
 * Bars carry each stage's own colour — the same one its badge wears on every
 * other screen, so Won is gold here exactly as it is in the list. That is
 * identity, not rank: every row is labelled, and the colour only reinforces a
 * mapping the reader already knows.
 */
export default function FunnelChart({ rows }: { rows: Bucket[] }) {
  const ceiling = Math.max(...rows.map((r) => r.count), 1);
  const top = rows[0]?.count ?? 0;

  return (
    <ol className="space-y-2">
      {rows.map((r) => {
        const stage = r.key as DealStage;
        // Share of the widest stage — how much of the intake reaches here.
        const share = top > 0 ? r.count / top : 0;
        return (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-ink">{STAGE_LABELS[stage] ?? r.label}</span>
              <span className="tabular shrink-0 text-sm">
                <span className="font-medium text-ink">{r.count.toLocaleString("en-IN")}</span>
                {top > 0 && r.key !== "qualifying" && (
                  <span className="ml-1.5 text-xs text-ink-muted">{Math.round(share * 100)}%</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-navy-100">
              <div
                className={`h-1.5 rounded-full ${STAGE_STYLES[stage]?.dot ?? "bg-navy-700"}`}
                style={{
                  width: `${(r.count / ceiling) * 100}%`,
                  // Same reason as bar-list: a stage holding one deal must look
                  // different from a stage holding none. Zero stays zero.
                  minWidth: r.count > 0 ? "0.375rem" : undefined,
                }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
