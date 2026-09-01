import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getDashboard } from "@/lib/queries/dashboard";
import { presetByKey, presetHref } from "@/lib/domain/presets";
import { RESPONSE_TARGET_DAYS, CLOSED_FOR_WIN_RATE } from "@/lib/domain/metrics";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import Stat from "@/components/ui/stat";
import BarList from "@/components/dashboard/bar-list";
import FunnelChart from "@/components/dashboard/funnel-chart";
import Meter from "@/components/dashboard/meter";
import AttentionTile from "@/components/dashboard/attention-tile";
import TrendBars from "@/components/dashboard/trend-bars";
import RateRows from "@/components/dashboard/rate-rows";
import OutcomeStrip from "@/components/dashboard/outcome-strip";

/**
 * The owners' screen. Stacked cards, mobile-first — Vishal and Vaishali read
 * this on a phone, so nothing here is a wide table.
 *
 * Two halves, and the order is the point. **Needs attention** is what to do
 * today, and every tile in it opens the list it counted. **Performance** is
 * how the business is going, which is a different question asked at a
 * different moment; putting it second stops it drowning the first.
 *
 * Every number is computed in lib/domain/metrics.ts, which is where to go to
 * argue about what one means.
 */

function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mt-6 mb-3 first:mt-0">
      <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
      <p className="text-xs text-ink-muted">{hint}</p>
    </div>
  );
}

export default async function Page() {
  await requireRole("admin");
  const d = await getDashboard();

  const num = (n: number) => n.toLocaleString("en-IN");
  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
  const days = (n: number | null) =>
    n === null ? "—" : n < 1 ? "Same day" : `${n.toFixed(n < 10 ? 1 : 0)} days`;

  /** A metrics Bucket as a bar. "Other" is a folded tail, not a finding. */
  const bars = (buckets: { key: string; label: string; count: number }[]) =>
    buckets.map((b) => ({
      key: b.key, label: b.label, value: b.count, muted: b.key === "__other",
    }));

  // Month-over-month, so the headline number has something to be judged
  // against. A single count cannot tell improvement from decline.
  const delta = d.thisMonth - d.lastMonth;
  const monthHint = d.lastMonth === 0
    ? "No leads last month to compare"
    : `${delta === 0 ? "Same as" : delta > 0 ? `${num(delta)} more than` : `${num(-delta)} fewer than`} last month (${num(d.lastMonth)})`;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Where the business is, and what needs doing today." />

      {/* ================================================ needs attention */}
      <SectionHeading
        title="Needs attention"
        hint="Every tile opens that exact list, oldest first."
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {d.attention.map((b) => {
          const p = presetByKey(b.key);
          return (
            <AttentionTile
              key={b.key}
              href={presetHref(p)}
              label={p.label}
              hint={p.hint}
              count={b.count}
              oldestDays={b.oldestDays}
              severity={b.severity}
              pending={p.emptyUntil}
            />
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        {/* The headline of the whole project. Leads waiting weeks before anyone
            rings them was invisible in the spreadsheet, and is almost certainly
            their largest addressable loss. */}
        <Card
          title="How long a lead waits before anyone calls"
          description="Of the leads that have been called at all"
        >
          <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 border-b border-border pb-3">
            <span className="text-sm text-ink">
              <strong className="tabular">{days(d.age.medianDays)}</strong>
              <span className="ml-1 text-xs text-ink-muted">all time</span>
            </span>
            {d.ageThisMonth.medianDays !== null ? (
              <span className="text-sm text-ink">
                <strong className="tabular">{days(d.ageThisMonth.medianDays)}</strong>
                <span className="ml-1 text-xs text-ink-muted">for leads that arrived this month</span>
              </span>
            ) : (
              <span className="text-xs text-ink-muted">
                Nothing called yet from this month&rsquo;s leads, so there is nothing to compare.
              </span>
            )}
          </div>
          <BarList rows={bars(d.age.bands)} empty="Nobody has been called yet." />
        </Card>

        {/* A backlog of a thousand is a number you freeze in front of. A pace
            and a date is a decision — hire, or accept the tail. Built from
            activity rows the query already reads. */}
        <Card title="Clearing the backlog" description="Leads nobody has called yet, and how fast that is changing">
          <div className="space-y-3">
            <p className="text-sm text-ink">
              <strong className="tabular">{num(d.age.neverCalled)}</strong> never called
              {d.age.neverCalled > 0 && (
                <span className="text-ink-muted">
                  {" · "}{pct(d.backlogStale, d.age.neverCalled)} of them arrived over a month ago
                </span>
              )}
            </p>

            {d.pace.perDay === null ? (
              <p className="text-sm text-ink-muted">
                {d.pace.total === 0
                  ? "No calls logged in the last fortnight, so there is no pace to project from."
                  : `Only ${num(d.pace.total)} calls logged in the last fortnight — too few to project a pace from.`}
              </p>
            ) : (
              <>
                <p className="text-sm text-ink">
                  <strong className="tabular">{num(d.pace.total)}</strong> calls in the last{" "}
                  {d.pace.windowDays} days — about{" "}
                  <strong className="tabular">{d.pace.perDay.toFixed(1)}</strong> a day.
                </p>
                <Meter value={d.pace.total} max={Math.max(d.age.neverCalled, d.pace.total)} />
                {d.backlogDays !== null && (
                  <p className="text-xs text-ink-muted">
                    At that pace the backlog clears in about{" "}
                    <strong className="text-ink">{num(d.backlogDays)} days</strong>. Leads keep
                    arriving, so treat it as a direction, not a date.
                  </p>
                )}
              </>
            )}

            {d.stalledCount > 0 && (
              <p className="border-t border-border pt-3 text-xs text-ink-muted">
                <strong className="text-ink">{num(d.stalledCount)}</strong> open deals have had
                nothing logged for {d.stalledDays} days.{" "}
                <Link href="/deals?sort=oldest" className="text-navy-700 underline-offset-2 hover:underline">
                  Oldest first
                </Link>
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ==================================================== performance */}
      <SectionHeading
        title="Performance"
        hint="Every lead in the system, not just this month."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Leads this month" value={num(d.thisMonth)} hint={monthHint} />
          <Stat label="Open pipeline" value={num(d.totalOpen)} hint="Including parked" />
          <Stat
            label="Median wait for a first call"
            value={days(d.age.medianDays)}
            tone={d.age.medianDays !== null && d.age.medianDays > RESPONSE_TARGET_DAYS ? "warning" : "neutral"}
          />
          <Stat
            label="Never called"
            value={num(d.age.neverCalled)}
            tone={d.age.neverCalled > 0 ? "warning" : "neutral"}
            hint="Still open"
          />
        </div>

        <Card title="Leads over time" description="Each month, and how much of it has been called">
          <TrendBars points={d.months} />
        </Card>

        <Card title="Pipeline" description="Where open deals are sitting right now">
          <FunnelChart rows={d.funnel} />
          <div className="mt-4 border-t border-border pt-3">
            <OutcomeStrip o={d.outcomes} />
          </div>
          {d.outcomes.lost > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-ink">Why we lose</p>
              <BarList rows={bars(d.lossReasons)} empty="No reasons recorded." />
            </div>
          )}
        </Card>

        <Card title="Conversion" description="Only meaningful once deals have actually closed">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Win rate" value={d.win.rate === null ? "—" : pct(d.win.won, d.win.closed)} />
            <Stat
              label="Median time from enquiry to Won"
              value={days(d.cycleDays)}
              hint={d.win.won > 0 ? `Across ${num(d.win.won)} won deal${d.win.won === 1 ? "" : "s"}` : "No deals won yet"}
            />
          </div>

          {/* An absence made visible. A dash says "broken"; a progress bar says
              "not yet, and here is how far off it is". */}
          <div className="mt-4 border-t border-border pt-3">
            <p className="tabular text-xs text-ink-muted">
              {num(d.win.closed)} of about {CLOSED_FOR_WIN_RATE} closed deals
            </p>
            <Meter value={d.win.closed} max={CLOSED_FOR_WIN_RATE} className="mt-1" />
            <p className="mt-2 text-xs text-ink-muted">
              A win rate becomes meaningful once roughly thirty deals have closed. That is a rule
              of thumb, not a target.
            </p>
          </div>

          {!d.hasClosedDeals && (
            <p className="mt-3 rounded-md bg-navy-50 px-3 py-2 text-xs text-ink-muted">
              Nothing has closed in the CRM yet, so there is no conversion figure to give. Their
              old tracker shows 2 won across 1,762 leads, which means the status column was never
              maintained — not that conversion is 0.1%. There is no reliable baseline to compare
              against, and presenting one would be inventing it.
            </p>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Where leads come from" description="Every lead, all time">
            <BarList rows={bars(d.bySource)} empty="No sources recorded." />
          </Card>

          <Card
            title="Where they are"
            description={
              d.outstationShare === null
                ? undefined
                : `${Math.round(d.outstationShare * 100)}% outside Chennai — normal business, not a warning`
            }
          >
            <BarList rows={bars(d.byCity)} empty="No cities recognised yet." />
          </Card>
        </div>

        <Card
          title="Which ad spend produces reachable people"
          description="Contact rate is the one that matters: an ad that produces numbers nobody answers is buying leads, not customers."
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-ink">By source</p>
              <RateRows rows={d.sourceRates} empty="No source has 10 leads yet." />
            </div>
            <div className="border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-ink">By campaign</p>
              <RateRows rows={d.campaignRates} empty="No campaign has 10 leads yet." />
            </div>
          </div>
        </Card>

        <Card title="Top campaigns" description="By volume, all time">
          <BarList rows={bars(d.byCampaign)} empty="No campaigns recorded." />
        </Card>

        <Card
          title="By rep"
          description="A failed verification means a customer said no visit took place. One is usually a confused customer — it is a prompt to ask, not a verdict."
        >
          {d.reps.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              No deals are assigned to a rep yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {d.reps.map((r) => (
                <li key={r.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2 last:border-0 last:pb-0">
                  <span className="text-sm font-medium text-ink">{r.label}</span>
                  <span className="tabular flex gap-3 text-xs text-ink-muted">
                    <span>{r.total} held</span>
                    <span>{r.won} won</span>
                    {r.failedVerifications > 0 && (
                      <span className="font-medium text-warning">
                        {r.failedVerifications} failed verification{r.failedVerifications === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
