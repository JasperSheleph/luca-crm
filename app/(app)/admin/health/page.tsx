import { requireRole } from "@/lib/auth";
import { getHealth, type CheckState } from "@/lib/queries/health";
import { getSettings } from "@/lib/queries/settings";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import Meter from "@/components/dashboard/meter";
import { ATTENTION_STATES } from "@/lib/config/design-tokens";
import AllowanceEditor from "@/components/health/allowance-editor";

/**
 * Is anything wrong? Written for someone who does not code.
 *
 * Every row carries a word and a symbol as well as a colour. That is not
 * decoration: the app's `warning` and `danger` tokens are both dark red-orange
 * and measure ΔE 8.6 apart in normal vision — well below the threshold where a
 * reader can tell two marks apart by hue. The label is what actually
 * distinguishes them, and it works in greyscale, in print, and for a colourblind
 * reader too.
 */

const STATE: Record<CheckState, { text: string; word: string; mark: string }> =
  ATTENTION_STATES;

export default async function Page() {
  await requireRole("admin");
  const [checks, settings] = await Promise.all([getHealth(), getSettings()]);

  return (
    <>
      <PageHeader
        title="Health"
        subtitle="A plain check that nothing is quietly broken. Nothing here needs acting on unless a row says so."
      />

      <Card>
        <ul className="divide-y divide-border">
          {checks.map((c) => {
            const s = STATE[c.state];
            return (
              <li key={c.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                <span className={`tabular w-5 shrink-0 text-sm font-semibold ${s.text}`} aria-hidden="true">
                  {s.mark}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{c.label}</p>
                  {c.detail && <p className="mt-0.5 text-xs text-ink-muted">{c.detail}</p>}
                </div>

                <div className="text-right">
                  <p className="tabular text-sm font-medium text-ink">{c.value}</p>
                  {s.word && <p className={`text-xs ${s.text}`}>{s.word}</p>}
                </div>

                {/* A share of an allowance is easier to judge as a length than
                    as a number, so the two that have one get a bar. */}
                {c.fraction !== undefined && (
                  <Meter
                    value={c.fraction} max={1}
                    fill={c.state === "serious" ? "bg-danger" : c.state === "warning" ? "bg-warning" : "bg-navy-700"}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <AllowanceEditor
        databaseBytes={Number(settings.database_limit_bytes ?? 0)}
        storageBytes={Number(settings.storage_limit_bytes ?? 0)}
      />
    </>
  );
}
