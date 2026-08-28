/**
 * No `server-only` here on purpose. This module holds no secret — it takes a
 * SupabaseClient as an argument — and scripts/import-meta.ts runs it under plain
 * Node, where `server-only` throws. The guard belongs on lib/db/admin.ts, which
 * is where the service-role key actually lives, and that is where it stays.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedLead } from "@/lib/importers/meta";
import { loadIngestContext, prepareLead } from "@/lib/ingest";

/**
 * Bulk commit for Importer A.
 *
 * Shares every decision with lib/ingest.ts but batches the database work —
 * 1,073 leads one round trip at a time takes minutes and times out.
 */

const BATCH = 500;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export interface CommitResult {
  imported: number;
  alreadyImported: number;
  repeatCustomers: number;
  invalidPhone: number;
  newCustomers: number;
  errors: string[];
}

export async function commitMetaLeads(
  db: SupabaseClient,
  leads: ParsedLead[],
  sourceValue = "meta_ads",
): Promise<CommitResult> {
  const errors: string[] = [];
  const ctx = await loadIngestContext(db);

  // ---- 1. skip anything already imported (re-running the same file is safe)
  const existingIds = new Set<string>();
  for (const part of chunk(leads.map((l) => l.externalId), BATCH)) {
    const { data } = await db.from("deals").select("external_id").in("external_id", part);
    for (const r of data ?? []) if (r.external_id) existingIds.add(r.external_id);
  }
  const fresh = leads.filter((l) => !existingIds.has(l.externalId));

  // ---- 2. raw payloads first, before any processing
  for (const part of chunk(fresh, BATCH)) {
    const { error } = await db.from("inbound_leads_raw").insert(
      part.map((l) => ({ source: sourceValue, external_id: l.externalId, payload: l.raw as never })),
    );
    if (error) errors.push(`raw payloads: ${error.message}`);
  }

  // ---- 3. which phones already have a customer
  const keys = [...new Set(fresh.map((l) => l.phoneNormalized))];
  const customerByPhone = new Map<string, string>();
  for (const part of chunk(keys, BATCH)) {
    const { data } = await db.from("customers").select("id, phone_normalized").in("phone_normalized", part);
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }
  const preexisting = new Set(customerByPhone.keys());

  // ---- 4. create the customers that do not exist yet.
  // First row wins on a repeated phone, so the earliest enquiry sets the name.
  const newOnes = new Map<string, ParsedLead>();
  for (const l of fresh) {
    if (!preexisting.has(l.phoneNormalized) && !newOnes.has(l.phoneNormalized)) {
      newOnes.set(l.phoneNormalized, l);
    }
  }
  for (const part of chunk([...newOnes.values()], BATCH)) {
    const { data, error } = await db.from("customers")
      .upsert(
        part.map((l) => ({
          phone_normalized: l.phoneNormalized,
          name: l.name, email: l.email, city: l.city,
        })),
        { onConflict: "phone_normalized", ignoreDuplicates: true },
      )
      .select("id, phone_normalized");
    if (error) { errors.push(`customers: ${error.message}`); continue; }
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }
  // ignoreDuplicates means a racing insert returns nothing; re-read those.
  const missing = [...new Set(fresh.map((l) => l.phoneNormalized))].filter((p) => !customerByPhone.has(p));
  for (const part of chunk(missing, BATCH)) {
    const { data } = await db.from("customers").select("id, phone_normalized").in("phone_normalized", part);
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }

  // ---- 5. deals. A phone we already had is a repeat enquiry: a NEW deal on an
  // OLD customer, which is what keeps conversion metrics honest.
  const seenThisRun = new Set<string>();
  const rows = fresh.flatMap((l) => {
    const customerId = customerByPhone.get(l.phoneNormalized);
    if (!customerId) { errors.push(`No customer for ${l.phoneNormalized}`); return []; }

    const prepared = prepareLead(
      { source: sourceValue, phone: l.phoneRaw, city: l.city },
      ctx,
    );
    const isRepeat = preexisting.has(l.phoneNormalized) || seenThisRun.has(l.phoneNormalized);
    seenThisRun.add(l.phoneNormalized);

    return [{
      customer_id: customerId,
      source_id: prepared?.sourceId ?? null,
      external_id: l.externalId,
      stage: "qualifying" as const,
      is_repeat: isRepeat,
      invalid_phone: l.invalidPhone,
      campaign_name: l.campaignName,
      planning_to_install: l.planningToInstall,
      crm_owner_id: prepared?.crmOwnerId ?? null,
      city: l.city,
      city_normalized: l.cityNormalized,
      is_outstation: prepared?.isOutstation ?? false,
      // The original Meta timestamp. Never the import time: every lead-age
      // metric depends on this and there is no second chance to get it right.
      created_at: l.createdAt,
    }];
  });

  let imported = 0;
  const assignments: { deal_id: string; user_id: string; role_at_assignment: "crm_manager" }[] = [];
  for (const part of chunk(rows, BATCH)) {
    const { data, error } = await db.from("deals").insert(part).select("id, crm_owner_id");
    if (error) { errors.push(`deals: ${error.message}`); continue; }
    imported += data?.length ?? 0;
    for (const d of data ?? []) {
      if (d.crm_owner_id) {
        assignments.push({ deal_id: d.id, user_id: d.crm_owner_id, role_at_assignment: "crm_manager" });
      }
    }
  }

  // ---- 6. handoff trail
  for (const part of chunk(assignments, BATCH)) {
    const { error } = await db.from("assignments").insert(part);
    if (error) errors.push(`assignments: ${error.message}`);
  }

  return {
    imported,
    alreadyImported: leads.length - fresh.length,
    repeatCustomers: rows.filter((r) => r.is_repeat).length,
    invalidPhone: rows.filter((r) => r.invalid_phone).length,
    newCustomers: newOnes.size,
    errors,
  };
}
