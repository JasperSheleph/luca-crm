import { createClient } from "@/lib/db/server";
import type { DealStage } from "@/lib/domain/stages";
import type { Activity } from "@/lib/types";

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
  visit_verification_status: string;
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
}

export interface DealFilters {
  q?: string;
  stage?: string;
  owner?: string;
  source?: string;
  city?: string;
  campaign?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  uncontacted?: boolean;
  page?: number;
  perPage?: number;
}

export const DEALS_PER_PAGE = 50;

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

  if (f.stage) q = q.eq("stage", f.stage);
  if (f.source) q = q.eq("source_id", Number(f.source));
  if (f.city) q = q.eq("city_normalized", f.city);
  if (f.campaign) q = q.eq("campaign_name", f.campaign);
  if (f.owner) q = q.or(`crm_owner_id.eq.${f.owner},rep_owner_id.eq.${f.owner}`);
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

  const { data, count } = await q
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  return { rows: (data ?? []) as DealListRow[], total: count ?? 0 };
}

/** Everything the list needs for its filter dropdowns, in one round trip. */
export async function getDealFilterOptions() {
  const supabase = await createClient();
  const [{ data: sources }, { data: users }, { data: campaigns }, { data: cities }] = await Promise.all([
    supabase.from("list_values").select("id, label").eq("list_type", "lead_source").eq("is_active", true).order("sort_order"),
    supabase.from("users").select("id, name, role").eq("is_active", true).order("name"),
    supabase.from("deal_list_view").select("campaign_name").not("campaign_name", "is", null).limit(2000),
    supabase.from("deal_list_view").select("city_normalized").not("city_normalized", "is", null).limit(2000),
  ]);

  return {
    sources: sources ?? [],
    users: users ?? [],
    campaigns: [...new Set((campaigns ?? []).map((c) => c.campaign_name as string))].sort(),
    cities: [...new Set((cities ?? []).map((c) => c.city_normalized as string))].sort(),
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
