/**
 * Importer B — matching and committing.
 *
 * No `server-only`: this module holds no secret, takes a SupabaseClient as an
 * argument, and scripts/import-tracker.ts runs it under plain Node where
 * `server-only` throws. The guard belongs on lib/db/admin.ts, where the
 * service-role key actually lives.
 *
 * `plan()` decides what every row would do and writes nothing. `commit()` does
 * exactly what the plan said. Same function, one boolean apart — a preview that
 * runs different logic from the commit is a preview of nothing, and this import
 * writes append-only rows that cannot be cleanly undone.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRep, type TrackerLead } from "@/lib/importers/tracker";
import type { DealStage } from "@/lib/domain/stages";

const BATCH = 500;

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** What one tracker lead would do. Every field is decided before anything writes. */
export interface PlannedRow {
  phoneKey: string;
  phoneNormalized: string;
  name: string | null;
  rowNumbers: number[];
  /** matched = attach to an existing deal. created = a deal Meta never saw. */
  path: "matched" | "created";
  dealId: string | null;
  /** Only set on a matched row where the tracker knows more than the CRM. */
  stageFrom: DealStage | null;
  stageTo: DealStage | null;
  /** Set only where the deal has no rep today — never overwrites one. */
  repToSet: string | null;
  repUnresolved: string | null;
  activityCount: number;
  placeholderPhone: boolean;
  invalidPhone: boolean;
}

export interface TrackerPlan {
  rows: PlannedRow[];
  matched: number;
  created: number;
  stageChanges: number;
  /** Deals the tracker says are already Won, Not Pursued or in Negotiation. */
  stageBreakdown: Record<string, number>;
  repsResolved: number;
  repsUnresolved: string[];
  activitiesToWrite: number;
  /** Already imported on an earlier run — a re-run would skip these. */
  alreadyImported: number;
}

export interface TrackerCommitResult extends TrackerPlan {
  dealsCreated: number;
  customersCreated: number;
  activitiesWritten: number;
  stagesAdvanced: number;
  errors: string[];
}

/** Where a stage sits on the linear ladder; terminal states sit off it. */
const LADDER: DealStage[] = [
  "qualifying", "appointment_scheduled", "site_visit_done", "quote_sent", "negotiation",
];
const TERMINAL: DealStage[] = ["won", "lost", "not_pursued"];

/**
 * Should the tracker's stage replace the one the CRM holds?
 *
 * Only ever forwards. The 1,073 Meta deals all sit in `qualifying` because that
 * is where the import left them, not because that is where they are — so the
 * tracker is the better information. But it is a months-old spreadsheet, and
 * anything a person has since moved in the CRM must win.
 */
export function shouldAdvance(current: DealStage, fromTracker: DealStage): boolean {
  if (current === fromTracker) return false;
  // Never reopen a deal someone has already closed in the CRM.
  if (TERMINAL.includes(current)) return false;
  // A terminal tracker outcome is real news about an open deal.
  if (TERMINAL.includes(fromTracker)) return true;
  // Nurture is a deliberate park; a stale spreadsheet must not wake it.
  if (current === "nurture") return false;
  return LADDER.indexOf(fromTracker) > LADDER.indexOf(current);
}

interface ExistingDeal {
  id: string;
  stage: DealStage;
  rep_owner_id: string | null;
  customer_id: string;
}

/**
 * Work out what every row would do, without writing anything.
 *
 * The matching is on normalised phone against `customers`, then the newest deal
 * for that customer. 974 of the 1,063 Meta phones also appear in the tracker;
 * getting this wrong is what produces ~974 phantom deals.
 */
export async function planTrackerImport(
  db: SupabaseClient,
  leads: TrackerLead[],
  repMap: Record<string, string>,
): Promise<TrackerPlan> {
  const phones = leads.map((l) => l.phoneNormalized);

  // ---- which phones already have a customer, and their newest deal
  const customerByPhone = new Map<string, string>();
  for (const part of chunk([...new Set(phones)], BATCH)) {
    const { data } = await db.from("customers").select("id, phone_normalized").in("phone_normalized", part);
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }

  const dealByCustomer = new Map<string, ExistingDeal>();
  const customerIds = [...customerByPhone.values()];
  for (const part of chunk(customerIds, BATCH)) {
    const { data } = await db
      .from("deals").select("id, stage, rep_owner_id, customer_id, created_at")
      .in("customer_id", part).order("created_at", { ascending: false });
    // Newest first, so the first sighting of a customer is their current deal.
    for (const d of (data ?? []) as (ExistingDeal & { created_at: string })[]) {
      if (!dealByCustomer.has(d.customer_id)) dealByCustomer.set(d.customer_id, d);
    }
  }

  // ---- rows already imported by an earlier run of THIS importer
  const externalIds = leads.map((l) => trackerExternalId(l));
  const already = new Set<string>();
  for (const part of chunk(externalIds, BATCH)) {
    const { data } = await db.from("deals").select("external_id").in("external_id", part);
    for (const r of data ?? []) if (r.external_id) already.add(r.external_id);
  }

  const unresolved = new Set<string>();
  const stageBreakdown: Record<string, number> = {};
  let matched = 0, created = 0, stageChanges = 0, repsResolved = 0;
  let activitiesToWrite = 0, alreadyImported = 0;

  const rows: PlannedRow[] = [];
  for (const lead of leads) {
    if (already.has(trackerExternalId(lead))) { alreadyImported += 1; continue; }

    const customerId = customerByPhone.get(lead.phoneNormalized) ?? null;
    const deal = customerId ? dealByCustomer.get(customerId) ?? null : null;

    const rep = resolveRep(lead.repInitials, repMap);
    if (lead.repInitials && !rep) unresolved.add(lead.repInitials.split("/")[0].trim());
    if (rep) repsResolved += 1;

    // The full original note is always written; the parsed calls are extra.
    const activityCount = 1 + lead.activities.length;
    activitiesToWrite += activityCount;

    stageBreakdown[lead.stage] = (stageBreakdown[lead.stage] ?? 0) + 1;

    if (deal) {
      matched += 1;
      const advance = shouldAdvance(deal.stage, lead.stage);
      if (advance) stageChanges += 1;
      rows.push({
        phoneKey: lead.phoneKey,
        phoneNormalized: lead.phoneNormalized,
        name: lead.name,
        rowNumbers: lead.rowNumbers,
        path: "matched",
        dealId: deal.id,
        stageFrom: advance ? deal.stage : null,
        stageTo: advance ? lead.stage : null,
        // Only where the deal has none. The only historical rep data there is.
        repToSet: !deal.rep_owner_id && rep ? rep : null,
        repUnresolved: lead.repInitials && !rep ? lead.repInitials : null,
        activityCount,
        placeholderPhone: lead.placeholderPhone,
        invalidPhone: lead.invalidPhone,
      });
    } else {
      created += 1;
      if (lead.stage !== "qualifying") stageChanges += 1;
      rows.push({
        phoneKey: lead.phoneKey,
        phoneNormalized: lead.phoneNormalized,
        name: lead.name,
        rowNumbers: lead.rowNumbers,
        path: "created",
        dealId: null,
        stageFrom: null,
        stageTo: lead.stage,
        repToSet: rep,
        repUnresolved: lead.repInitials && !rep ? lead.repInitials : null,
        activityCount,
        placeholderPhone: lead.placeholderPhone,
        invalidPhone: lead.invalidPhone,
      });
    }
  }

  return {
    rows, matched, created, stageChanges, stageBreakdown, repsResolved,
    repsUnresolved: [...unresolved].sort(),
    activitiesToWrite, alreadyImported,
  };
}

/**
 * Namespaced so a tracker row can never collide with a Meta lead id in the
 * `deals_external_id_key` unique index, and so re-running this import is safe.
 */
export function trackerExternalId(lead: TrackerLead): string {
  return `tracker:${lead.phoneKey}`;
}

export async function commitTrackerImport(
  db: SupabaseClient,
  leads: TrackerLead[],
  repMap: Record<string, string>,
  sourceValue = "legacy_tracker",
): Promise<TrackerCommitResult> {
  const errors: string[] = [];
  const plan = await planTrackerImport(db, leads, repMap);
  const byKey = new Map(leads.map((l) => [l.phoneKey, l]));

  // ---- source id, once
  const { data: source } = await db
    .from("list_values").select("id").eq("list_type", "lead_source").eq("value", sourceValue).maybeSingle();
  const sourceId = source?.id ?? null;
  if (!sourceId) errors.push(`No lead_source called "${sourceValue}" — deals will have no source.`);

  const creating = plan.rows.filter((r) => r.path === "created");

  // ---- customers for the created path
  const customerByPhone = new Map<string, string>();
  for (const part of chunk(creating.map((r) => r.phoneNormalized), BATCH)) {
    const { data } = await db.from("customers").select("id, phone_normalized").in("phone_normalized", part);
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }

  const newCustomers = creating.filter((r) => !customerByPhone.has(r.phoneNormalized));
  for (const part of chunk(newCustomers, BATCH)) {
    const { data, error } = await db.from("customers")
      .upsert(
        part.map((r) => {
          const l = byKey.get(r.phoneKey)!;
          return { phone_normalized: l.phoneNormalized, name: l.name, email: l.email, city: l.city };
        }),
        { onConflict: "phone_normalized", ignoreDuplicates: true },
      )
      .select("id, phone_normalized");
    if (error) { errors.push(`customers: ${error.message}`); continue; }
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }
  // ignoreDuplicates returns nothing for a racing insert; re-read those.
  const missing = creating.map((r) => r.phoneNormalized).filter((p) => !customerByPhone.has(p));
  for (const part of chunk([...new Set(missing)], BATCH)) {
    const { data } = await db.from("customers").select("id, phone_normalized").in("phone_normalized", part);
    for (const c of data ?? []) customerByPhone.set(c.phone_normalized, c.id);
  }

  // ---- create the deals Meta never saw
  const dealIdByKey = new Map<string, string>();
  let dealsCreated = 0;

  const dealRows = creating.flatMap((r) => {
    const l = byKey.get(r.phoneKey)!;
    const customerId = customerByPhone.get(l.phoneNormalized);
    if (!customerId) { errors.push(`No customer for ${l.phoneNormalized}`); return []; }
    return [{
      customer_id: customerId,
      source_id: sourceId,
      external_id: trackerExternalId(l),
      stage: l.stage,
      invalid_phone: l.invalidPhone,
      rep_owner_id: r.repToSet,
      floors: l.floors,
      timeline_months: l.timelineMonths,
      city: l.city,
      city_normalized: l.cityNormalized,
      // The tracker date where there is one. Falling back to now() would make
      // every legacy lead look like it arrived today and wreck lead age.
      ...(l.date ? { created_at: l.date } : {}),
      _key: l.phoneKey,
    }];
  });

  for (const part of chunk(dealRows, BATCH)) {
    const payload = part.map(({ _key, ...row }) => { void _key; return row; });
    const { data, error } = await db.from("deals").insert(payload).select("id, external_id");
    if (error) { errors.push(`deals: ${error.message}`); continue; }
    dealsCreated += data?.length ?? 0;
    for (const d of data ?? []) {
      const key = String(d.external_id ?? "").replace(/^tracker:/, "");
      if (key) dealIdByKey.set(key, d.id);
    }
  }

  // ---- matched path: advance the stage and fill an empty rep, never overwrite
  let stagesAdvanced = 0;
  for (const r of plan.rows) {
    if (r.path !== "matched" || !r.dealId) continue;

    const patch: Record<string, unknown> = {};
    if (r.stageTo) patch.stage = r.stageTo;
    if (r.repToSet) patch.rep_owner_id = r.repToSet;
    if (Object.keys(patch).length === 0) continue;

    const { error } = await db.from("deals").update(patch).eq("id", r.dealId);
    if (error) { errors.push(`deal ${r.dealId}: ${error.message}`); continue; }

    if (r.stageTo && r.stageFrom) {
      stagesAdvanced += 1;
      await db.from("deal_stage_history").insert({
        deal_id: r.dealId,
        from_stage: r.stageFrom,
        to_stage: r.stageTo,
        reason: "Imported from the legacy sales tracker",
      });
    }
  }

  // ---- activities. Append-only and ungrantable to delete, so this runs last:
  // a failure here leaves deals without history rather than history orphaned.
  const activityRows: Record<string, unknown>[] = [];
  for (const r of plan.rows) {
    const l = byKey.get(r.phoneKey)!;
    const dealId = r.path === "matched" ? r.dealId : dealIdByKey.get(r.phoneKey) ?? null;
    if (!dealId) continue;

    // 1. the whole original text, verbatim. Nothing is ever lost.
    if (l.importedNote) {
      activityRows.push({
        deal_id: dealId,
        type: "imported_note",
        notes: l.importedNote,
        metadata: {
          source: "legacy_tracker",
          rows: l.rowNumbers,
          status: l.statusRaw,
          status_recognised: l.statusRecognised,
        },
        ...(l.date ? { occurred_at: l.date } : {}),
      });
    }

    // 2. the best-effort split into individual calls
    for (const a of l.activities) {
      activityRows.push({
        deal_id: dealId,
        type: "call",
        notes: a.notes,
        metadata: { source: "legacy_tracker", parsed: true },
        ...(a.occurredAt ? { occurred_at: a.occurredAt } : l.date ? { occurred_at: l.date } : {}),
      });
    }
  }

  let activitiesWritten = 0;
  for (const part of chunk(activityRows, BATCH)) {
    const { data, error } = await db.from("activities").insert(part).select("id");
    if (error) { errors.push(`activities: ${error.message}`); continue; }
    activitiesWritten += data?.length ?? 0;
  }

  return {
    ...plan,
    dealsCreated,
    customersCreated: newCustomers.length,
    activitiesWritten,
    stagesAdvanced,
    errors,
  };
}
