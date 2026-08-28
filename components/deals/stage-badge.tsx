import { STAGE_STYLES, STAGE_LABELS } from "@/lib/config/design-tokens";
import type { DealStage } from "@/lib/domain/stages";

/**
 * A qualifying deal nobody has rung yet reads "Not called yet" rather than
 * "Qualifying" — same stage underneath, described by what needs doing.
 *
 * Deliberately derived here and NOT a database stage. Adding one would put a
 * step in the funnel that no transition leads out of, and every conversion
 * figure on the dashboard counts stages.
 */
export default function StageBadge({
  stage, firstContactedAt, size = "md",
}: {
  stage: DealStage;
  /** Pass the deal's first_contacted_at to get the sharper label. */
  firstContactedAt?: string | null;
  size?: "sm" | "md";
}) {
  const uncontacted = stage === "qualifying" && !firstContactedAt;
  const s = STAGE_STYLES[stage];
  const label = uncontacted ? "Not called yet" : STAGE_LABELS[stage];

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border font-medium ${
        uncontacted ? "border-warning/25 bg-warning/10 text-warning" : s.badge
      } ${size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"}`}
    >
      <span
        className={`size-1.5 rounded-full ${uncontacted ? "bg-warning" : s.dot}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
