import { requireRole } from "@/lib/auth";
import { getDashboard } from "@/lib/queries/dashboard";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import Stat from "@/components/ui/stat";
import BarList from "@/components/dashboard/bar-list";
import FunnelChart from "@/components/dashboard/funnel-chart";

/**
 * The owners' screen. Stacked cards, mobile-first — Vishal and Vaishali read
 * this on a phone, so nothing here is a wide table.
 *
 * Every number is computed in lib/domain/metrics.ts, which is where to go to
 * argue about what one means.
 */
export default async function Page() {
  await requireRole("admin");
  const d = await getDashboard();

  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");
  const days = (n: number | null) =>
    n === null ? "—" : n < 1 ? "Same day" : `${n.toFixed(n < 10 ? 1 : 0)} days`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything below counts every lead in the system, not just this month."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Leads this month" value={d.thisMonth.toLocaleString("en-IN")} />
          <Stat label="Open pipeline" value={d.totalOpen.toLocaleString("en-IN")} />
          <Stat
            label="Median wait for a first call"
            value={days(d.age.medianDays)}
            tone={d.age.medianDays !== null && d.age.medianDays > 3 ? "warning" : "neutral"}
          />
          <Stat
            label="Never called"
            value={d.age.neverCalled.toLocaleString("en-IN")}
            tone={d.age.neverCalled > 0 ? "warning" : "neutral"}
            hint="Still open"
          />
        </div>

        {/* The headline of the whole project. Leads waiting weeks before anyone
            rings them was invisible in the spreadsheet, and is almost certainly
            their largest addressable loss. */}
        <Card
          title="How long a lead waits before anyone calls"
          description="Of the leads that have been called at all"
        >
          <BarList
            rows={d.age.bands.map((b) => ({
              key: b.key,
              label: b.label,
              value: b.count,
              display: b.count.toLocaleString("en-IN"),
            }))}
            empty="Nobody has logged a first call yet."
          />
        </Card>

        <Card title="Pipeline" description="Where open deals are sitting">
          <FunnelChart rows={d.funnel} />
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
            <Stat label="Nurture pool" value={d.nurture.toLocaleString("en-IN")} tone="muted" />
            <Stat
              label={`Stalled over ${d.stalledDays} days`}
              value={d.stalledCount.toLocaleString("en-IN")}
              tone={d.stalledCount > 0 ? "warning" : "neutral"}
            />
            <Stat
              label="Win rate"
              value={d.win.rate === null ? "—" : `${Math.round(d.win.rate * 100)}%`}
              hint={d.win.closed > 0 ? `${d.win.won} of ${d.win.closed} closed` : "Nothing closed yet"}
            />
          </div>

          {/* Said plainly rather than left for someone to infer from a number
              that looks authoritative. */}
          {!d.hasClosedDeals && (
            <p className="mt-3 rounded-md bg-navy-50 px-3 py-2 text-xs text-ink-muted">
              No deal has been closed in this system yet, so there is no win rate or cycle
              time to show. The old tracker records 2 Won across 1,762 leads, which means
              status was never kept up rather than that conversion is 0.1% — it is not a
              baseline to compare against.
            </p>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Where leads come from" description="Every lead, by source">
            <BarList
              rows={d.bySource.map((b) => ({
                key: b.key, label: b.label, value: b.count, muted: b.key === "__other",
              }))}
            />
          </Card>

          <Card title="Top campaigns" description="Ad names are date-stamped; the tail is folded in">
            <BarList
              rows={d.byCampaign.map((b) => ({
                key: b.key, label: b.label, value: b.count, muted: b.key === "__other",
              }))}
            />
          </Card>
        </div>

        {/* Two separate lists on one scale rather than one dual-axis chart:
            reachability and drop-off are different measures and putting them on
            a shared y-axis would invent a relationship between them. */}
        <Card
          title="Which ad spend produces reachable people"
          description="Campaigns with at least 10 leads. Contact rate is who answered at all; drop rate is who ended Lost or Not Pursued."
        >
          {d.campaignRates.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              No campaign has 10 leads yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium text-ink">Contact rate</p>
                <BarList
                  max={100}
                  rows={d.campaignRates.map((r) => ({
                    key: r.key,
                    label: r.label,
                    value: r.total > 0 ? (r.contacted / r.total) * 100 : 0,
                    display: pct(r.contacted, r.total),
                  }))}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-ink">Drop rate</p>
                <BarList
                  max={100}
                  rows={d.campaignRates.map((r) => ({
                    key: r.key,
                    label: r.label,
                    value: r.total > 0 ? (r.dropped / r.total) * 100 : 0,
                    display: pct(r.dropped, r.total),
                  }))}
                />
              </div>
            </div>
          )}
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
          <div className="mt-4 border-t border-border pt-3">
            <Stat
              label="Median time from enquiry to Won"
              value={days(d.cycleDays)}
              hint={d.win.won > 0 ? `Across ${d.win.won} won deal${d.win.won === 1 ? "" : "s"}` : "No deals won yet"}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
