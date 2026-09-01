/**
 * Every number on the dashboard.
 *
 * Pure: takes plain rows and a clock, returns counts. No database, no React —
 * so it is fully testable, and a disagreement about what "win rate" means is
 * settled in one file rather than in a SQL string nobody can read.
 *
 * Aggregating ~1,800 rows in JavaScript rather than in SQL is deliberate. It
 * keeps the definitions here instead of split between a view and a component,
 * and at this size the difference is unmeasurable. Revisit at ten thousand.
 *
 * ⚠ Read the note on `winRate` before quoting a conversion number to anyone.
 */

import type { DealStage, VerificationStatus } from "@/lib/domain/stages";
import { WORK_PRESETS } from "@/lib/domain/presets";
import { istParts } from "@/lib/domain/notifications";

/** The columns the dashboard needs. A subset of `deals`, nothing derived. */
export interface MetricDeal {
  stage: DealStage;
  created_at: string;
  first_contacted_at: string | null;
  won_at: string | null;
  last_activity_at: string | null;
  source_id: number | null;
  campaign_name: string | null;
  rep_owner_id: string | null;
  next_action_at: string | null;
  visit_verification_status: VerificationStatus;
  nurture_wake_at: string | null;
  latest_quote_sent_at: string | null;
  city_normalized: string | null;
  is_outstation: boolean | null;
}

/** Ended one way or another — no longer in the working pipeline. */
export const CLOSED_STAGES: DealStage[] = ["won", "lost", "not_pursued"];

/** The funnel proper. Parallel exits are not steps and must not be drawn as one. */
export const FUNNEL_STAGES: DealStage[] = [
  "qualifying", "appointment_scheduled", "site_visit_done",
  "quote_sent", "negotiation", "won",
];

const DAY_MS = 86_400_000;

/**
 * The wait a first call is expected to happen inside. Named once, because the
 * attention band's severity and the median-wait warning are the same number.
 */
export const RESPONSE_TARGET_DAYS = 3;

/**
 * What counts as someone working a lead. Matches the daily summary job in
 * lib/notifications/jobs.ts — two definitions of "a call" is how two screens
 * quietly come to disagree.
 */
export const WORK_ACTIVITY_TYPES = ["call"];

/** Below this, a pace is one person's afternoon, not a rate. */
export const MIN_PACE_SAMPLE = 5;

/** A rule of thumb for when a win rate stops being noise. Not a target. */
export const CLOSED_FOR_WIN_RATE = 30;

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

export interface RateRow {
  key: string;
  label: string;
  total: number;
  /** Of `total`, how many someone actually reached. */
  contacted: number;
  /** Of `total`, how many ended Lost or Not Pursued. */
  dropped: number;
}

function days(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / DAY_MS;
}

/**
 * The middle value, not the mean.
 *
 * Lead age has a long tail — a handful of leads called after four months would
 * drag an average somewhere no actual lead lives. The median says what happens
 * to a typical lead, which is the question being asked.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Counts per stage, in funnel order. Stages with no deals still appear. */
export function funnel(deals: MetricDeal[]): Bucket[] {
  return FUNNEL_STAGES.map((stage) => ({
    key: stage,
    label: stage,
    count: deals.filter((d) => d.stage === stage).length,
  }));
}

/**
 * Group into labelled buckets, largest first, with a tail folded into "Other".
 *
 * The tail matters here: campaign names are date-stamped ad names that grow
 * with every ad LUCA run. Two already cover most of the leads, and a chart with
 * forty bars answers nothing.
 */
export function topBuckets(
  deals: MetricDeal[],
  keyOf: (d: MetricDeal) => string | null,
  labelOf: (key: string) => string,
  limit = 6,
): Bucket[] {
  const counts = new Map<string, number>();
  let unknown = 0;

  for (const d of deals) {
    const key = keyOf(d);
    if (key === null) { unknown += 1; continue; }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .map(([key, count]) => ({ key, label: labelOf(key), count }))
    .sort((a, b) => b.count - a.count);

  const head = sorted.slice(0, limit);
  const tailCount = sorted.slice(limit).reduce((n, b) => n + b.count, 0) + unknown;

  return tailCount > 0
    ? [...head, { key: "__other", label: "Other", count: tailCount }]
    : head;
}

/**
 * Contact rate and drop rate per campaign — which ad spend produces people
 * worth talking to, rather than merely people.
 *
 * Campaigns below `minimum` are folded away: a campaign with three leads and
 * one contact reads as 33%, which is noise presented as a finding.
 */
export function ratesBy(
  deals: MetricDeal[],
  keyOf: (d: MetricDeal) => string,
  labelOf: (key: string) => string,
  minimum = 10,
  limit = 6,
): RateRow[] {
  const groups = new Map<string, MetricDeal[]>();
  for (const d of deals) {
    const key = keyOf(d);
    const list = groups.get(key);
    if (list) list.push(d); else groups.set(key, [d]);
  }

  return [...groups.entries()]
    .filter(([, rows]) => rows.length >= minimum)
    .map(([key, rows]) => ({
      key,
      label: labelOf(key),
      total: rows.length,
      contacted: rows.filter((d) => d.first_contacted_at !== null).length,
      dropped: rows.filter((d) => d.stage === "lost" || d.stage === "not_pursued").length,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** The campaign case, kept named because it is the one with a rationale. */
export function ratesByCampaign(deals: MetricDeal[], minimum = 10, limit = 6): RateRow[] {
  return ratesBy(deals, (d) => d.campaign_name ?? "Unattributed", (k) => k, minimum, limit);
}

/**
 * Won as a share of everything that actually finished.
 *
 * ⚠ Deals still open are excluded, so early on this reads far higher than the
 * real conversion — a pipeline with one Won and one Lost shows 50%. It only
 * becomes meaningful once a cohort has mostly closed.
 *
 * Their existing tracker shows 2 Won across 1,762 leads, which means status was
 * never maintained rather than that conversion is 0.1%. There is no reliable
 * historical baseline to compare this against, and presenting one would be
 * inventing it.
 */
export function winRate(deals: MetricDeal[]): { won: number; closed: number; rate: number | null } {
  const won = deals.filter((d) => d.stage === "won").length;
  const closed = deals.filter((d) => CLOSED_STAGES.includes(d.stage)).length;
  return { won, closed, rate: closed > 0 ? won / closed : null };
}

/** Days from enquiry to Won, for deals that got there. */
export function cycleTimeDays(deals: MetricDeal[]): number | null {
  return median(
    deals
      .filter((d) => d.stage === "won" && d.won_at)
      .map((d) => days(d.created_at, d.won_at!)),
  );
}

/**
 * How long a lead waits before anyone rings it.
 *
 * The headline number of the whole project: leads waiting weeks before a first
 * call is almost certainly LUCA's largest addressable loss, and it was
 * invisible in the spreadsheet.
 */
export function leadAgeAtFirstContact(deals: MetricDeal[]): {
  medianDays: number | null;
  bands: Bucket[];
  neverCalled: number;
} {
  const contacted = deals.filter((d) => d.first_contacted_at);
  const ages = contacted.map((d) => days(d.created_at, d.first_contacted_at!));

  // Ordered bands, so this is a scale rather than a set of categories.
  const bands: Bucket[] = [
    { key: "same_day", label: "Same day",   count: ages.filter((a) => a < 1).length },
    { key: "1_3",      label: "1–3 days",   count: ages.filter((a) => a >= 1 && a < 4).length },
    { key: "4_7",      label: "4–7 days",   count: ages.filter((a) => a >= 4 && a < 8).length },
    { key: "over_7",   label: "Over a week", count: ages.filter((a) => a >= 8).length },
  ];

  return {
    medianDays: median(ages),
    bands,
    neverCalled: deals.filter((d) => !d.first_contacted_at && !CLOSED_STAGES.includes(d.stage)).length,
  };
}

/**
 * Open deals nobody has touched in a while.
 *
 * `last_activity_at` is null for a lead never worked at all, so the enquiry
 * date stands in — otherwise the 1,073 imported leads, the ones most at risk,
 * would be the only ones that never count as stalled.
 */
export function stalled(deals: MetricDeal[], afterDays: number, now: Date): number {
  const cutoff = now.getTime() - afterDays * DAY_MS;
  return deals.filter((d) => {
    if (CLOSED_STAGES.includes(d.stage)) return false;
    const last = new Date(d.last_activity_at ?? d.created_at).getTime();
    return last < cutoff;
  }).length;
}

export interface RepRow {
  key: string;
  label: string;
  total: number;
  won: number;
  failedVerifications: number;
}

/**
 * Per rep: deals held, deals won, and verification calls where the customer
 * said no visit took place.
 *
 * The last column is the one to read carefully. It catches false reporting, not
 * lead theft, and a single failure is far more often a confused customer than a
 * dishonest rep — it is a prompt to ask, not a verdict.
 */
export function byRep(
  deals: MetricDeal[],
  names: Map<string, string>,
  failedByRep: Map<string, number>,
): RepRow[] {
  const groups = new Map<string, MetricDeal[]>();
  for (const d of deals) {
    if (!d.rep_owner_id) continue;
    const list = groups.get(d.rep_owner_id);
    if (list) list.push(d); else groups.set(d.rep_owner_id, [d]);
  }

  // Every rep with a failure appears, even one holding no deals today.
  for (const repId of failedByRep.keys()) if (!groups.has(repId)) groups.set(repId, []);

  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      label: names.get(key) ?? "Unknown",
      total: rows.length,
      won: rows.filter((d) => d.stage === "won").length,
      failedVerifications: failedByRep.get(key) ?? 0,
    }))
    .sort((a, b) => b.won - a.won || b.total - a.total);
}

/* ------------------------------------------------------------- outcomes */

export interface Outcomes {
  total: number;
  open: number;
  nurture: number;
  won: number;
  lost: number;
  notPursued: number;
}

/**
 * Where every lead ended up, in five numbers that sum to the total.
 *
 * `open` includes Nurture — a parked lead is still in play, it just has a date
 * on it. `funnel()` deliberately excludes Nurture because parking is not a step
 * towards Won, and that disagreement is exactly why both live in this file
 * rather than being re-derived in a component: the funnel bars and the open
 * count could not otherwise be reconciled by anyone reading the page.
 */
export function outcomes(deals: MetricDeal[]): Outcomes {
  const count = (stage: DealStage) => deals.filter((d) => d.stage === stage).length;
  const won = count("won");
  const lost = count("lost");
  const notPursued = count("not_pursued");
  const nurture = count("nurture");
  return {
    total: deals.length,
    open: deals.length - won - lost - notPursued,
    nurture,
    won,
    lost,
    notPursued,
  };
}

/* ------------------------------------------------------- attention band */

export interface AttentionBucket {
  /** Matches WorkPreset.key, so a tile links to the list it counted. */
  key: string;
  count: number;
  /** How long the oldest lead in the bucket has waited. Null when empty. */
  oldestDays: number | null;
  severity: "clear" | "watch" | "act";
}

interface PredicateContext {
  now: Date;
  quoteSlaDays: number;
  wakeCutoff: string;
}

const OPEN = (d: MetricDeal) => !CLOSED_STAGES.includes(d.stage);

/**
 * One predicate per work preset, mirroring `listDeals` in lib/queries/deals.ts.
 *
 * These must agree with the SQL line for line, including where the SQL is
 * inconsistent: the visit check deliberately does NOT exclude closed deals, and
 * the waking filter keys off `nurture_wake_at` rather than the stage. A tile
 * that counts differently from the list it opens is worse than no tile.
 */
const PREDICATES: Record<string, (d: MetricDeal, c: PredicateContext) => boolean> = {
  "to-call": (d) => OPEN(d) && d.first_contacted_at === null,

  // No OPEN() guard, matching the query: a frozen deal is exactly what someone
  // looking at the visit check needs to see.
  "awaiting-verification": (d) => d.visit_verification_status === "pending",

  "overdue": (d, c) =>
    OPEN(d) && d.next_action_at !== null && new Date(d.next_action_at) < c.now,

  "waking": (d, c) =>
    OPEN(d) && d.nurture_wake_at !== null && d.nurture_wake_at <= c.wakeCutoff,

  "quote-sla": (d, c) =>
    OPEN(d) && d.latest_quote_sent_at !== null &&
    new Date(d.latest_quote_sent_at).getTime() < c.now.getTime() - c.quoteSlaDays * DAY_MS,
};

// Fail the build, not the page: a sixth preset without a predicate would
// otherwise render a permanent, silent zero.
for (const p of WORK_PRESETS) {
  if (!PREDICATES[p.key]) throw new Error(`Work preset "${p.key}" has no attention predicate.`);
}

/**
 * What needs doing right now, one bucket per work preset and in the same order
 * as the chips on /deals — two screens must not teach different vocabularies.
 *
 * Severity is judged on age, not count. With a thousand leads never called, no
 * count threshold means anything; how long the oldest has waited is the part
 * that actually moves.
 */
export function attention(
  deals: MetricDeal[],
  now: Date,
  opts: { quoteSlaDays: number },
): AttentionBucket[] {
  // End of today in India, matching the query. A UTC "today" wakes a deal a
  // day late at 05:00 IST, which is the whole reason this is not `new Date()`.
  const ctx: PredicateContext = {
    now,
    quoteSlaDays: opts.quoteSlaDays,
    wakeCutoff: `${istParts(now).ymd}T23:59:59+05:30`,
  };

  return WORK_PRESETS.map((preset) => {
    const rows = deals.filter((d) => PREDICATES[preset.key](d, ctx));
    if (rows.length === 0) {
      return { key: preset.key, count: 0, oldestDays: null, severity: "clear" as const };
    }
    const oldest = Math.min(...rows.map((d) => new Date(d.created_at).getTime()));
    const oldestDays = Math.floor((now.getTime() - oldest) / DAY_MS);
    return {
      key: preset.key,
      count: rows.length,
      oldestDays,
      severity: oldestDays > RESPONSE_TARGET_DAYS ? ("act" as const) : ("watch" as const),
    };
  });
}

/* ---------------------------------------------------------- lead intake */

export interface MonthPoint {
  /** "2026-08", bucketed in IST. */
  key: string;
  total: number;
  /** Of that month's leads, how many have since been called at all. */
  contacted: number;
}

/**
 * Leads per month, oldest first, zero-filled.
 *
 * Zero-filled because a quiet month is a fact worth seeing — dropping it would
 * silently close the gap and make intake look steadier than it was.
 */
export function monthlyLeads(deals: MetricDeal[], months: number, now: Date): MonthPoint[] {
  const keys: string[] = [];
  const [y, m] = istParts(now).ymd.split("-").map(Number);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  const points = new Map(keys.map((k) => [k, { key: k, total: 0, contacted: 0 }]));
  for (const d of deals) {
    // IST, not UTC: a lead created 31 Aug 20:00 UTC is 1 Sept in Chennai.
    const bucket = points.get(istParts(new Date(d.created_at)).ymd.slice(0, 7));
    if (!bucket) continue;
    bucket.total++;
    if (d.first_contacted_at) bucket.contacted++;
  }
  return keys.map((k) => points.get(k)!);
}

/* ------------------------------------------------------- clearing pace */

/**
 * How fast the team is actually working, from logged calls.
 *
 * Type filtering happens here rather than in SQL because "what counts as
 * working a lead" is a business rule, and a stage change or an assignment is
 * not someone picking up a phone.
 */
export function activityPace(
  rows: { occurred_at: string; type: string }[],
  windowDays: number,
  now: Date,
): { total: number; perDay: number | null; windowDays: number } {
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const total = rows.filter(
    (r) => WORK_ACTIVITY_TYPES.includes(r.type) && new Date(r.occurred_at).getTime() >= cutoff,
  ).length;

  // Never project from a handful. Three calls in a fortnight is somebody
  // trying the app, not a rate anyone should plan against.
  return { total, perDay: total >= MIN_PACE_SAMPLE ? total / windowDays : null, windowDays };
}

/** How long the backlog takes to clear at that pace. Null when unknowable. */
export function daysToClear(backlog: number, perDay: number | null): number | null {
  if (perDay === null || perDay <= 0) return null;
  return Math.ceil(backlog / perDay);
}
