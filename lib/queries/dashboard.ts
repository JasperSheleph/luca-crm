import { createClient } from "@/lib/db/server";
import { istParts } from "@/lib/domain/notifications";
import {
  funnel, topBuckets, ratesBy, ratesByCampaign, winRate, cycleTimeDays,
  leadAgeAtFirstContact, stalled, byRep, outcomes, attention, monthlyLeads,
  activityPace, daysToClear, type MetricDeal,
} from "@/lib/domain/metrics";

/**
 * One read of the columns the dashboard needs, then every number computed in
 * lib/domain/metrics.ts.
 *
 * Deliberately not `deal_list_view`: that view runs three correlated subqueries
 * per row, which is right for a page of 50 and wasteful across all 1,800. This
 * asks `deals` for the columns it needs and joins the two aggregates it cannot
 * get from there.
 */

/**
 * This Supabase project caps any single response at 1,000 rows (`db-max-rows`),
 * and `.range()` cannot lift it — asking for 50,000 still returns 1,000.
 *
 * With 1,073 deals that cap was silent and wrong in the worst way: the open
 * pipeline read exactly "1,000", which looks like a healthy round number rather
 * than a truncation, and every rate on the page was computed over a subset.
 * Anything that must count everything pages through instead.
 */
const PAGE_ROWS = 1000;

async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data } = await page(from, from + PAGE_ROWS - 1);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_ROWS) return all;
  }
}

const DEFAULT_STALLED_DAYS = 21;
const DEFAULT_QUOTE_SLA_DAYS = 14;

/** How far back the burn-down pace is measured. Long enough to survive a quiet
 *  day, short enough to still describe how the team is working now. */
const PACE_WINDOW_DAYS = 14;

/** A year of intake. Enough to show a season without becoming a wall of bars. */
const TREND_MONTHS = 12;

export interface DashboardData {
  totalOpen: number;
  thisMonth: number;
  lastMonth: number;
  bySource: ReturnType<typeof topBuckets>;
  byCampaign: ReturnType<typeof topBuckets>;
  byCity: ReturnType<typeof topBuckets>;
  outstationShare: number | null;
  campaignRates: ReturnType<typeof ratesByCampaign>;
  sourceRates: ReturnType<typeof ratesBy>;
  funnel: ReturnType<typeof funnel>;
  win: ReturnType<typeof winRate>;
  cycleDays: number | null;
  age: ReturnType<typeof leadAgeAtFirstContact>;
  /** The same measure over this month's leads only — is it getting better? */
  ageThisMonth: ReturnType<typeof leadAgeAtFirstContact>;
  stalledCount: number;
  stalledDays: number;
  reps: ReturnType<typeof byRep>;
  outcomes: ReturnType<typeof outcomes>;
  lossReasons: ReturnType<typeof topBuckets>;
  attention: ReturnType<typeof attention>;
  months: ReturnType<typeof monthlyLeads>;
  pace: ReturnType<typeof activityPace>;
  backlogDays: number | null;
  /** Of the never-called, how many arrived over a month ago. */
  backlogStale: number;
  /** Nothing has been through the funnel yet, so rates would mislead. */
  hasClosedDeals: boolean;
}

export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const now = new Date();

  const [dealRows, activityRows, listRes, usersRes, failedRes, settingsRes, quoteRows] =
    await Promise.all([
      fetchAll<MetricDeal & { id: string; lost_reason_id: number | null }>((from, to) =>
        supabase.from("deals").select(
          "id, stage, created_at, first_contacted_at, won_at, source_id, campaign_name, " +
          "rep_owner_id, next_action_at, visit_verification_status, nurture_wake_at, " +
          "city_normalized, is_outstation, lost_reason_id",
        ).order("created_at").range(from, to) as never,
      ),
      // The newest activity per deal, folded in below. Read flat and reduced
      // here rather than as a per-row subquery — and paged, because a pace
      // derived from a truncated set understates how hard the team is working.
      fetchAll<{ deal_id: string; occurred_at: string; type: string }>((from, to) =>
        supabase.from("activities").select("deal_id, occurred_at, type")
          .order("occurred_at", { ascending: false }).range(from, to) as never,
      ),
      supabase.from("list_values").select("id, label, list_type")
        .in("list_type", ["lead_source", "loss_reason"]),
      supabase.from("users").select("id, name"),
      supabase.from("visit_verifications").select("deal_id, outcome").eq("outcome", "failed"),
      supabase.from("app_settings").select("key, value")
        .in("key", ["stalled_deal_days", "quote_followup_days"]),
      // `latest_quote_sent_at` is a subquery on deal_list_view, not a column on
      // `deals`, so there is no free way to get it. Returns nothing until
      // quotes start going out — but a tile reading zero for a reason nobody
      // checked is exactly how a number quietly stays wrong.
      fetchAll<{ deal_id: string; sent_at: string }>((from, to) =>
        supabase.from("quotes").select("deal_id, sent_at")
          .not("sent_at", "is", null).order("sent_at", { ascending: false })
          .range(from, to) as never,
      ),
    ]);

  const lastActivity = new Map<string, string>();
  for (const a of activityRows) {
    // Ordered newest-first, so the first sighting of a deal is its latest.
    if (!lastActivity.has(a.deal_id)) lastActivity.set(a.deal_id, a.occurred_at);
  }

  const latestQuote = new Map<string, string>();
  for (const q of quoteRows) {
    if (!latestQuote.has(q.deal_id)) latestQuote.set(q.deal_id, q.sent_at);
  }

  const rows = dealRows;
  const deals: MetricDeal[] = rows.map((d) => ({
    ...d,
    last_activity_at: lastActivity.get(d.id) ?? null,
    latest_quote_sent_at: latestQuote.get(d.id) ?? null,
  }));

  const listValues = listRes.data ?? [];
  const sourceNames = new Map(
    listValues.filter((v) => v.list_type === "lead_source").map((s) => [String(s.id), s.label]),
  );
  const reasonNames = new Map(
    listValues.filter((v) => v.list_type === "loss_reason").map((s) => [String(s.id), s.label]),
  );
  const userNames = new Map((usersRes.data ?? []).map((u) => [u.id, u.name]));

  // A failed verification belongs to the rep who reported the visit, so it is
  // attributed through the deal's rep rather than through who made the call.
  const repOf = new Map(rows.map((d) => [d.id, d.rep_owner_id]));
  const failedByRep = new Map<string, number>();
  for (const v of failedRes.data ?? []) {
    const rep = repOf.get(v.deal_id);
    if (rep) failedByRep.set(rep, (failedByRep.get(rep) ?? 0) + 1);
  }

  // "This month" means the calendar month in India, not wherever the server is.
  const { ymd } = istParts(now);
  const monthStart = `${ymd.slice(0, 7)}-01T00:00:00+05:30`;
  const [yy, mm] = ymd.split("-").map(Number);
  const prev = new Date(Date.UTC(yy, mm - 2, 1));
  const prevKey = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
  const prevStart = `${prevKey}-01T00:00:00+05:30`;

  const settings = new Map((settingsRes.data ?? []).map((r) => [r.key, r.value]));
  const stalledDays = (settings.get("stalled_deal_days") as number | null) ?? DEFAULT_STALLED_DAYS;
  // Matches getQuoteSlaDays() in lib/queries/deals.ts: the last reminder is the
  // point past which silence counts as no answer.
  const followUps = settings.get("quote_followup_days") as number[] | null;
  const quoteSlaDays = followUps?.length ? Math.max(...followUps) : DEFAULT_QUOTE_SLA_DAYS;

  const win = winRate(deals);
  const thisMonthDeals = deals.filter((d) => d.created_at >= monthStart);
  const withCity = deals.filter((d) => d.is_outstation !== null);
  const pace = activityPace(activityRows, PACE_WINDOW_DAYS, now);
  const neverCalled = deals.filter(
    (d) => d.first_contacted_at === null && !["won", "lost", "not_pursued"].includes(d.stage),
  );
  const monthAgo = now.getTime() - 30 * 86_400_000;

  return {
    totalOpen: deals.filter((d) => !["won", "lost", "not_pursued"].includes(d.stage)).length,
    thisMonth: thisMonthDeals.length,
    lastMonth: deals.filter((d) => d.created_at >= prevStart && d.created_at < monthStart).length,
    bySource: topBuckets(
      deals,
      (d) => (d.source_id === null ? null : String(d.source_id)),
      (k) => sourceNames.get(k) ?? "Unknown",
    ),
    byCampaign: topBuckets(deals, (d) => d.campaign_name, (k) => k),
    byCity: topBuckets(deals, (d) => d.city_normalized, (k) => k),
    outstationShare: withCity.length
      ? withCity.filter((d) => d.is_outstation).length / withCity.length
      : null,
    campaignRates: ratesByCampaign(deals),
    sourceRates: ratesBy(
      deals,
      (d) => (d.source_id === null ? "Unknown" : String(d.source_id)),
      (k) => sourceNames.get(k) ?? "Unknown",
    ),
    funnel: funnel(deals),
    win,
    cycleDays: cycleTimeDays(deals),
    age: leadAgeAtFirstContact(deals),
    ageThisMonth: leadAgeAtFirstContact(thisMonthDeals),
    stalledCount: stalled(deals, stalledDays, now),
    stalledDays,
    reps: byRep(deals, userNames, failedByRep),
    outcomes: outcomes(deals),
    lossReasons: topBuckets(
      rows.filter((d) => d.stage === "lost") as unknown as MetricDeal[],
      (d) => {
        const id = (d as unknown as { lost_reason_id: number | null }).lost_reason_id;
        return id === null ? null : String(id);
      },
      (k) => reasonNames.get(k) ?? "Not recorded",
    ),
    attention: attention(deals, now, { quoteSlaDays }),
    months: monthlyLeads(deals, TREND_MONTHS, now),
    pace,
    backlogDays: daysToClear(neverCalled.length, pace.perDay),
    backlogStale: neverCalled.filter((d) => new Date(d.created_at).getTime() < monthAgo).length,
    hasClosedDeals: win.closed > 0,
  };
}
