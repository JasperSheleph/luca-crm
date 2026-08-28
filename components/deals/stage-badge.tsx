import { STAGE_STYLES, STAGE_LABELS } from "@/lib/config/design-tokens";
import type { DealStage } from "@/lib/domain/stages";

export default function StageBadge({ stage, size = "md" }: { stage: DealStage; size?: "sm" | "md" }) {
  const s = STAGE_STYLES[stage];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border font-medium ${s.badge} ${
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"
      }`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {STAGE_LABELS[stage]}
    </span>
  );
}
