/**
 * No `server-only` here on purpose. This module holds no secret — it takes a
 * SupabaseClient as an argument — and scripts/import-meta.ts runs it under plain
 * Node, where `server-only` throws. The guard belongs on lib/db/admin.ts, which
 * is where the service-role key actually lives, and that is where it stays.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickCrmOwner, type AssignmentMode } from "@/lib/domain/assignment";
import { normalizePhone, phoneKey, isValidIndianMobile } from "@/lib/domain/phone";
import { normalizeCity, isOutstation } from "@/lib/domain/city";

/**
 * The one write path for a new lead, whatever the source.
 *
 * POST /api/leads/inbound (website form, future integrations) and the CSV
 * importers both come through here, so assignment, duplicate detection and
 * city handling can only be defined once.
 *
 * Uses the service-role client: there is no signed-in user on the inbound path,
 * and the importer writes at volume on an admin's behalf.
 */

export interface LeadPayload {
  source: string;
  externalId?: string | null;
  name?: string | null;
  email?: string | null;
  phone: string;
  city?: string | null;
  campaign?: string | null;
  planningToInstall?: boolean | null;
  /** The ORIGINAL timestamp. Omit only when the lead is genuinely arriving now. */
  createdAt?: string | null;
  raw?: Record<string, unknown>;
}

export interface IngestContext {
  assignmentMode: AssignmentMode;
  crmManagers: { id: string; is_active: boolean }[];
  /** Deal counts per manager, for round_robin. Mutated as a batch is assigned. */
  load: Record<string, number>;
  cityAliases: Record<string, string>;
  serviceAreaCities: string[];
  sourceIds: Record<string, number>;
}

export interface PreparedLead {
  phoneNormalized: string;
  phoneKey: string;
  invalidPhone: boolean;
  cityNormalized: string | null;
  isOutstation: boolean;
  crmOwnerId: string | null;
  sourceId: number | null;
}

/** Everything decidable without touching the database. */
export function prepareLead(payload: LeadPayload, ctx: IngestContext): PreparedLead | null {
  const phoneNormalized = normalizePhone(payload.phone);
  const key = phoneKey(payload.phone);
  if (!phoneNormalized || !key) return null;

  const cityNormalized = normalizeCity(payload.city ?? null, ctx.cityAliases);
  const crmOwnerId = pickCrmOwner({
    mode: ctx.assignmentMode,
    crmManagers: ctx.crmManagers,
    currentLoad: ctx.load,
  });
  if (crmOwnerId) ctx.load[crmOwnerId] = (ctx.load[crmOwnerId] ?? 0) + 1;

  return {
    phoneNormalized,
    phoneKey: key,
    invalidPhone: !isValidIndianMobile(phoneNormalized),
    cityNormalized,
    isOutstation: isOutstation(cityNormalized, ctx.serviceAreaCities),
    crmOwnerId,
    sourceId: ctx.sourceIds[payload.source] ?? null,
  };
}

/** Reads the settings and lookups a batch of ingests needs, once. */
export async function loadIngestContext(db: SupabaseClient): Promise<IngestContext> {
  const [{ data: settings }, { data: managers }, { data: sources }] = await Promise.all([
    db.from("app_settings").select("key, value"),
    db.from("users").select("id, is_active").eq("role", "crm_manager").order("created_at"),
    db.from("list_values").select("id, value").eq("list_type", "lead_source"),
  ]);

  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
  const active = (managers ?? []).filter((m) => m.is_active);

  // Existing open deals per manager, so round_robin balances against reality
  // rather than starting from zero on every import.
  const load: Record<string, number> = {};
  if (s.lead_assignment_mode === "round_robin" && active.length > 0) {
    const { data: counts } = await db
      .from("deals").select("crm_owner_id")
      .in("crm_owner_id", active.map((m) => m.id))
      .not("stage", "in", "(won,lost,not_pursued)");
    for (const row of counts ?? []) {
      if (row.crm_owner_id) load[row.crm_owner_id] = (load[row.crm_owner_id] ?? 0) + 1;
    }
  }

  return {
    assignmentMode: (s.lead_assignment_mode as AssignmentMode) ?? "auto_single",
    crmManagers: managers ?? [],
    load,
    cityAliases: (s.city_aliases as Record<string, string>) ?? {},
    serviceAreaCities: (s.service_area_cities as string[]) ?? [],
    sourceIds: Object.fromEntries((sources ?? []).map((r) => [r.value, r.id])),
  };
}

/**
 * Single-lead ingest, for POST /api/leads/inbound.
 * Writes the raw payload first, so a processing failure is still debuggable.
 */
export async function ingestLead(
  db: SupabaseClient,
  payload: LeadPayload,
  ctx: IngestContext,
): Promise<{ dealId: string | null; error: string | null; isRepeat: boolean }> {
  const { data: rawRow } = await db
    .from("inbound_leads_raw")
    .insert({
      source: payload.source,
      external_id: payload.externalId ?? null,
      payload: (payload.raw ?? payload) as never,
    })
    .select("id").single();

  const fail = async (error: string) => {
    if (rawRow) await db.from("inbound_leads_raw").update({ error, processed_at: new Date().toISOString() }).eq("id", rawRow.id);
    return { dealId: null, error, isRepeat: false };
  };

  const prepared = prepareLead(payload, ctx);
  if (!prepared) return fail(`Unusable phone number: ${payload.phone}`);

  // Re-posting the same external lead must not create a second deal.
  if (payload.externalId) {
    const { data: existing } = await db
      .from("deals").select("id").eq("external_id", payload.externalId).maybeSingle();
    if (existing) {
      if (rawRow) await db.from("inbound_leads_raw").update({ processed_at: new Date().toISOString(), deal_id: existing.id }).eq("id", rawRow.id);
      return { dealId: existing.id, error: null, isRepeat: false };
    }
  }

  const { data: customer, error: custErr } = await db
    .from("customers")
    .upsert(
      {
        phone_normalized: prepared.phoneNormalized,
        name: payload.name ?? null,
        email: payload.email ?? null,
        city: payload.city ?? null,
      },
      { onConflict: "phone_normalized", ignoreDuplicates: false },
    )
    .select("id, created_at").single();
  if (custErr || !customer) return fail(custErr?.message ?? "Could not create customer");

  // An existing customer means this is a repeat enquiry: a NEW deal on an OLD
  // customer, which keeps conversion metrics clean.
  const { count: priorDeals } = await db
    .from("deals").select("id", { count: "exact", head: true }).eq("customer_id", customer.id);

  const { data: deal, error: dealErr } = await db
    .from("deals")
    .insert({
      customer_id: customer.id,
      source_id: prepared.sourceId,
      external_id: payload.externalId ?? null,
      stage: "qualifying",
      is_repeat: (priorDeals ?? 0) > 0,
      invalid_phone: prepared.invalidPhone,
      campaign_name: payload.campaign ?? null,
      planning_to_install: payload.planningToInstall ?? null,
      crm_owner_id: prepared.crmOwnerId,
      city: payload.city ?? null,
      city_normalized: prepared.cityNormalized,
      is_outstation: prepared.isOutstation,
      created_at: payload.createdAt ?? new Date().toISOString(),
    })
    .select("id").single();
  if (dealErr || !deal) return fail(dealErr?.message ?? "Could not create deal");

  if (prepared.crmOwnerId) {
    await db.from("assignments").insert({
      deal_id: deal.id, user_id: prepared.crmOwnerId,
      role_at_assignment: "crm_manager", assigned_by: null,
    });
  }

  if (rawRow) {
    await db.from("inbound_leads_raw")
      .update({ processed_at: new Date().toISOString(), deal_id: deal.id })
      .eq("id", rawRow.id);
  }

  return { dealId: deal.id, error: null, isRepeat: (priorDeals ?? 0) > 0 };
}
