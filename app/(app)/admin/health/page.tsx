import { requireRole } from "@/lib/auth";
import { getHealth, type CheckState } from "@/lib/queries/health";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";

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

const STATE: Record<CheckState, { text: string; word: string; mark: string }> = {
  good:    { text: "text-success",   word: "Fine",            mark: "✓" },
  warning: { text: "text-warning",   word: "Worth a look",    mark: "!" },
  serious: { text: "text-danger",    word: "Needs attention", mark: "!!" },
  neutral: { text: "text-ink-muted", word: "",                mark: "·" },
};

export default async function Page() {
  await requireRole("admin");
  const checks = await getHealth();

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
                  <div className="h-1.5 w-full rounded-full bg-navy-100">
                    <div
                      className={`h-1.5 rounded-full ${
                        c.state === "serious" ? "bg-danger" : c.state === "warning" ? "bg-warning" : "bg-navy-700"
                      }`}
                      style={{ width: `${Math.min(100, Math.round(c.fraction * 100))}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="mt-4 text-xs text-ink-muted">
        Storage and database percentages are measured against the allowance for your
        Supabase plan, which is set in Admin → Settings. Change it there when the plan
        changes — the numbers are meaningless against the wrong allowance.
      </p>
    </>
  );
}
