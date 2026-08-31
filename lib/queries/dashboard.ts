import { createClient } from "@/lib/db/server";
import { istParts } from "@/lib/domain/notifications";
import {
  funnel, topBuckets, ratesByCampaign, winRate, cycleTimeDays,
  leadAgeAtFirstContact, stalled, byRep, nurturePool, type MetricDeal,
} from "@/lib/domain/metrics";

/**
 * One read of the columns the dashboard needs, then every number computed in
 * lib/domain/metrics.ts.
 *
 * Deliberately not `deal_list_view`: that view runs three correlated subqueries
 * per row, which is right for a page of 50 and wasteful across all 1,800. This
 * asks `deals` for nine columns and joins the one aggregate it actually needs.
 */

const DEFAULT_STALLED_DAYS = 21;

export interface DashboardData {
  totalOpen: number;
  thisMonth: number;
  bySource: ReturnType<typeof topBuckets>;
  byCampaign: ReturnType<typeof topBuckets>;
  campaignRates: ReturnType<typeof ratesByCampaign>;
  funnel: ReturnType<typeof funnel>;
  win: ReturnType<typeof winRate>;
  cycleDays: number | null;
  age: ReturnType<typeof leadAgeAtFirstContact>;
  stalledCount: number;
  stalledDays: number;
  reps: ReturnType<typeof byRep>;
  nurture: number;
  /** Nothing has been through the funnel yet, so rates would mislead. */
  hasClosedDeals: boolean;
}

export async function getDashboard(): Promise<DashboardData> {
  const supabase = await createClient();
  const now = new Date();

  const [dealsRes, activityRes, sourcesRes, usersRes, failedRes, settingRes] = await Promise.all([
    supabase.from("deals").select(
      "id, stage, created_at, first_contacted_at, won_at, source_id, campaign_name, rep_owner_id, crm_owner_id",
    ),
    // The newest activity per deal, folded in below. Read flat and reduced here
    // rather than as a per-row subquery.
    supabase.from("activities").select("deal_id, occurred_at").order("occurred_at", { ascending: false }),
    supabase.from("list_values").select("id, label").eq("list_type", "lead_source"),
    supabase.from("users").select("id, name"),
    supabase.from("visit_verifications").select("deal_id, outcome").eq("outcome", "failed"),
    supabase.from("app_settings").select("value").eq("key", "stalled_deal_days").maybeSingle(),
  ]);

  const lastActivity = new Map<string, string>();
  for (const a of activityRes.data ?? []) {
    // Ordered newest-first, so the first sighting of a deal is its latest.
    if (!lastActivity.has(a.deal_id)) lastActivity.set(a.deal_id, a.occurred_at);
  }

  const rows = (dealsRes.data ?? []) as (MetricDeal & { id: string })[];
  const deals: MetricDeal[] = rows.map((d) => ({
    ...d, last_activity_at: lastActivity.get(d.id) ?? null,
  }));

  const sourceNames = new Map((sourcesRes.data ?? []).map((s) => [String(s.id), s.label]));
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

  const stalledDays = (settingRes.data?.value as number | null) ?? DEFAULT_STALLED_DAYS;
  const win = winRate(deals);

  return {
    totalOpen: deals.filter((d) => !["won", "lost", "not_pursued"].includes(d.stage)).length,
    thisMonth: deals.filter((d) => d.created_at >= monthStart).length,
    bySource: topBuckets(
      deals,
      (d) => (d.source_id === null ? null : String(d.source_id)),
      (k) => sourceNames.get(k) ?? "Unknown",
    ),
    byCampaign: topBuckets(deals, (d) => d.campaign_name, (k) => k),
    campaignRates: ratesByCampaign(deals),
    funnel: funnel(deals),
    win,
    cycleDays: cycleTimeDays(deals),
    age: leadAgeAtFirstContact(deals),
    stalledCount: stalled(deals, stalledDays, now),
    stalledDays,
    reps: byRep(deals, userNames, failedByRep),
    nurture: nurturePool(deals),
    hasClosedDeals: win.closed > 0,
  };
}
