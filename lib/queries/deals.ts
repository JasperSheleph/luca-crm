import { createClient } from "@/lib/db/server";
import type { DealStage } from "@/lib/domain/stages";
import type { Activity, VerificationStatus } from "@/lib/types";
import { CITY_OTHER } from "@/lib/domain/city";
// The one IST wall-clock helper in the codebase. Reused rather than
// reimplemented: a second date path is how "waking today" drifts a day.
import { istParts } from "@/lib/domain/notifications";

export interface DealListRow {
  id: string;
  stage: DealStage;
  created_at: string;
  first_contacted_at: string | null;
  next_action_at: string | null;
  next_action_note: string | null;
  nurture_wake_at: string | null;
  city: string | null;
  is_outstation: boolean;
  is_repeat: boolean;
  invalid_phone: boolean;
  campaign_name: string | null;
  budget_amount: number | null;
  budget_band: string | null;
  visit_verification_status: VerificationStatus;
  crm_owner_id: string | null;
  rep_owner_id: string | null;
  source_id: number | null;
  customer_id: string;
  customer_name: string | null;
  customer_phone: string;
  source_label: string | null;
  crm_owner_name: string | null;
  rep_owner_name: string | null;
  last_activity_at: string | null;
  activity_count: number;
  latest_quote_sent_at: string | null;
}

export interface DealFilters {
  q?: string;
  /** Every list filter takes several values. An empty array means no filter. */
  stage?: string[];
  owner?: string[];
  source?: string[];
  city?: string[];
  campaign?: string[];
  from?: string;
  to?: string;
  overdue?: boolean;
  uncontacted?: boolean;
  /**
   * Visit-check states to show. A list like every other list filter — it used
   * to be a boolean wearing a string's clothes: only the literal `pending` did
   * anything, so `?verification=failed` returned an unfiltered list while still
   * counting as an active filter and offering "Clear all".
   */
  verification?: string[];
  /** Parked in Nurture, wake date today or earlier — read in IST, not UTC. */
  wakingToday?: boolean;
  /** Quote sent, follow-up window exhausted, still no answer. */
  quotePastSla?: boolean;
  /** Work presets read oldest-first; the browsable list stays newest-first. */
  sort?: "oldest" | "newest";
  page?: number;
  perPage?: number;
}



/**
 * Reads filters off the URL. List filters arrive comma-separated
 * (`?stage=qualifying,negotiation`) so a filtered view stays shareable and
 * Export can reuse the exact same parameters the page was showing.
 *
 * Shared by the deals page, my-deals and the export route — three callers that
 * must agree on what a URL means or Export silently returns a different set.
 */
export function parseDealFilters(
  get: (key: string) => string | undefined | null,
): DealFilters {
  const list = (key: string): string[] | undefined => {
    const raw = get(key);
    if (!raw) return undefined;
    const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
    return values.length ? values : undefined;
  };
  const text = (key: string) => get(key) || undefined;

  return {
    q: text("q"),
    stage: list("stage"),
    owner: list("owner"),
    source: list("source"),
    city: list("city"),
    campaign: list("campaign"),
    from: text("from"),
    to: text("to"),
    overdue: get("overdue") === "1",
    uncontacted: get("uncontacted") === "1",
    verification: list("verification"),
    wakingToday: get("waking") === "1",
    quotePastSla: get("quotesla") === "1",
    // What turns a filtered view into a work queue. Newest-first is right
    // for searching and wrong for working: the lead that has waited three
    // weeks is the one costing money, and newest-first buries it.
    sort: get("sort") === "oldest" ? "oldest" : "newest",
  };
}

export const DEALS_PER_PAGE = 50;

/**
 * The last nudge in `quote_followup_days` is the SLA: once that day has passed
 * the automated follow-ups are spent and it needs a person. A settings row, so
 * LUCA can change the window without a deploy.
 */
async function getQuoteSlaDays(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", "quote_followup_days").maybeSingle();
  const days = (data?.value as number[] | null) ?? [];
  return days.length ? Math.max(...days) : 14;
}

async function getServiceAreaCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings").select("value").eq("key", "service_area_cities").maybeSingle();
  return ((data?.value as string[]) ?? []).filter(Boolean);
}

/**
 * The deals list. RLS scopes it — a rep gets only their own rows, and this
 * needs no extra filtering to make that true.
 */
export async function listDeals(f: DealFilters = {}): Promise<{ rows: DealListRow[]; total: number }> {
  const supabase = await createClient();
  const perPage = f.perPage ?? DEALS_PER_PAGE;
  const page = Math.max(1, f.page ?? 1);

  let q = supabase.from("deal_list_view").select("*", { count: "exact" });

  // One box for phone or name. People ring in and say either.
  if (f.q?.trim()) {
    const term = f.q.trim().toLowerCase();
    const digits = term.replace(/[^0-9]/g, "");
    q = q.ilike("search_text", `%${digits.length >= 4 ? digits : term}%`);
  }

  if (f.stage?.length) q = q.in("stage", f.stage);
  if (f.source?.length) q = q.in("source_id", f.source.map(Number));
  if (f.campaign?.length) q = q.in("campaign_name", f.campaign);

  // A deal matches if EITHER owner is one of the chosen people.
  if (f.owner?.length) {
    const ids = f.owner.join(",");
    q = q.or(`crm_owner_id.in.(${ids}),rep_owner_id.in.(${ids})`);
  }

  if (f.city?.length) {
    const towns = f.city.filter((c) => c !== CITY_OTHER);
    const wantsOther = f.city.includes(CITY_OTHER);
    const serviceArea = await getServiceAreaCities();

    if (wantsOther && towns.length === 0) {
      // Everything the alias map does not yet recognise.
      q = q.not("city_normalized", "in", `(${serviceArea.join(",")})`);
    } else if (wantsOther) {
      q = q.or(
        `city_normalized.in.(${towns.join(",")}),city_normalized.not.in.(${serviceArea.join(",")})`,
      );
    } else {
      q = q.in("city_normalized", towns);
    }
  }
  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59`);

  if (f.overdue) {
    q = q.lt("next_action_at", new Date().toISOString())
         .not("stage", "in", "(won,lost,not_pursued)");
  }
  // Never called: the largest addressable loss in their pipeline today.
  if (f.uncontacted) {
    q = q.is("first_contacted_at", null)
         .not("stage", "in", "(won,lost,not_pursued)");
  }

  // The visit check. `pending` is a visit the rep marked done that the customer
  // has not confirmed; `failed` freezes the deal until an admin resolves it
  // (lib/domain/stages.ts). Deliberately does NOT exclude closed deals — a
  // frozen deal is exactly what someone filtering for `failed` is looking for.
  if (f.verification) q = q.in("visit_verification_status", f.verification);

  // Nurture deals due back. The comparison is against today in IST: the server
  // may well be on UTC, and at 05:00 IST a UTC "today" is still yesterday, so a
  // deal would wake a day late.
  if (f.wakingToday) {
    const endOfDayIst = `${istParts(new Date()).ymd}T23:59:59+05:30`;
    q = q.not("nurture_wake_at", "is", null).lte("nurture_wake_at", endOfDayIst)
         // Every other work-queue filter excludes closed deals; this one did
         // not, so a won deal still carrying an old wake date turned up in a
         // queue of things to do.
         .not("stage", "in", "(won,lost,not_pursued)");
  }

  // Quote sent, nobody replied, and the follow-up window has run out.
  if (f.quotePastSla) {
    const cutoff = new Date(Date.now() - (await getQuoteSlaDays()) * 86_400_000).toISOString();
    q = q.not("latest_quote_sent_at", "is", null)
         .lt("latest_quote_sent_at", cutoff)
         .not("stage", "in", "(won,lost,not_pursued)");
  }

  const { data, count } = await q
    .order("created_at", { ascending: f.sort === "oldest" })
    .range((page - 1) * perPage, page * perPage - 1);

  return { rows: (data ?? []) as DealListRow[], total: count ?? 0 };
}

/** Everything the list needs for its filter dropdowns, in one round trip. */
export async function getDealFilterOptions() {
  const supabase = await createClient();
  // No campaign options: the campaign filter came off the screen, and reading
  // 2,000 rows on every page load to populate a dropdown nobody opens is not
  // worth it. `parseDealFilters` still understands ?campaign=, so putting the
  // control back is a UI-only change.
  const [{ data: sources }, { data: users }, { data: cities }, serviceArea] =
    await Promise.all([
      supabase.from("list_values").select("id, label").eq("list_type", "lead_source").eq("is_active", true).order("sort_order"),
      supabase.from("users").select("id, name, role").eq("is_active", true).order("name"),
      supabase.from("deal_list_view").select("city_normalized").not("city_normalized", "is", null).limit(2000),
      getServiceAreaCities(),
    ]);

  // Only towns the alias map recognises AND that actually have leads — an
  // option matching nothing is noise. Everything else collapses into Other.
  const area = new Set(serviceArea);
  const present = new Set((cities ?? []).map((c) => c.city_normalized as string));
  const known = [...present].filter((c) => area.has(c)).sort();
  const hasUnrecognised = [...present].some((c) => !area.has(c));

  return {
    sources: sources ?? [],
    users: users ?? [],
    cities: known,
    hasUnrecognisedCities: hasUnrecognised,
  };
}

export interface DealDetail extends DealListRow {
  customer_email: string | null;
  site_address: string | null;
  floors: number | null;
  property_type_id: number | null;
  building_subtype_id: number | null;
  lift_mechanism_id: number | null;
  construction_status_id: number | null;
  space_available_id: number | null;
  minimum_space: string | null;
  timeline_months: string | null;
  num_lifts: number | null;
  planning_to_install: boolean | null;
  advance_amount: number | null;
  lost_reason_id: number | null;
  lost_notes: string | null;
  not_pursued_reason_id: number | null;
  not_pursued_notes: string | null;
  won_at: string | null;
  lost_at: string | null;
}

export async function getDeal(id: string): Promise<DealDetail | null> {
  const supabase = await createClient();

  const { data: deal } = await supabase
    .from("deals")
    .select("*, customers(name, phone_normalized, email)")
    .eq("id", id)
    .maybeSingle();
  if (!deal) return null;

  const { data: view } = await supabase
    .from("deal_list_view").select("*").eq("id", id).maybeSingle();

  const customer = deal.customers as { name: string | null; phone_normalized: string; email: string | null };
  return {
    ...(view ?? {}),
    ...deal,
    customer_name: customer?.name ?? null,
    customer_phone: customer?.phone_normalized ?? "",
    customer_email: customer?.email ?? null,
  } as DealDetail;
}

export interface TimelineEntry extends Activity {
  user_name: string | null;
  disposition_label: string | null;
}

/**
 * The timeline. This is the centrepiece of the deal screen and the thing that
 * replaces their spreadsheet's Remarks column — the core value of the project.
 * Append-only: nothing here is ever edited or removed.
 */
export async function getTimeline(dealId: string): Promise<TimelineEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, users(name), list_values(label)")
    .eq("deal_id", dealId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });

  return (data ?? []).map((a) => ({
    ...a,
    user_name: (a.users as { name: string } | null)?.name ?? null,
    disposition_label: (a.list_values as { label: string } | null)?.label ?? null,
  })) as TimelineEntry[];
}

export async function getStageHistory(dealId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deal_stage_history")
    .select("*, users(name)")
    .eq("deal_id", dealId)
    .order("changed_at", { ascending: false });
  return data ?? [];
}

/** Prior deals for the same customer — what makes a repeat enquiry useful. */
export async function getCustomerHistory(customerId: string, excludeDealId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deal_list_view")
    .select("id, stage, created_at, budget_amount")
    .eq("customer_id", customerId)
    .neq("id", excludeDealId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
