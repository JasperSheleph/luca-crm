"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentUser } from "@/lib/queries/users";
import { can } from "@/lib/domain/permissions";
import { parseMetaCsv, type MetaParseResult } from "@/lib/importers/meta";
import { commitMetaLeads, type CommitResult } from "@/lib/importers/meta-commit";
import { parseTrackerCsv, type TrackerParseResult } from "@/lib/importers/tracker";
import {
  planTrackerImport, commitTrackerImport,
  type TrackerPlan, type TrackerCommitResult,
} from "@/lib/importers/tracker-commit";

export interface PreviewState {
  ok: boolean;
  error?: string;
  preview?: {
    totalRows: number;
    willImport: number;
    skipped: { rowNumber: number; reason: string }[];
    duplicatesInFile: number;
    invalidPhoneCount: number;
    campaignErrorsCleared: number;
    missingCity: number;
    dateRange: { from: string; to: string } | null;
    alreadyImported: number;
  };
}

export interface CommitState {
  ok: boolean;
  error?: string;
  result?: CommitResult;
}

async function readCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file first." as const };
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (!parsed.data.length) return { error: "That file has no rows." as const };
  if (!("phone_number" in parsed.data[0]) || !("created_time" in parsed.data[0])) {
    return { error: "That does not look like a Meta Lead Ads export — no created_time or phone_number column." as const };
  }
  return { rows: parsed.data };
}

async function settingsFor(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("app_settings").select("key, value").eq("key", "city_aliases").maybeSingle();
  return { cityAliases: (data?.value as Record<string, string>) ?? {} };
}

/** Parses and reports. Writes nothing. */
export async function previewMetaImport(_prev: PreviewState, formData: FormData): Promise<PreviewState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "run_import")) return { ok: false, error: "Only an admin can run an import." };

  const read = await readCsv(formData);
  if ("error" in read) return { ok: false, error: read.error };

  const db = createAdminClient();
  const { cityAliases } = await settingsFor(db);
  const parsed: MetaParseResult = parseMetaCsv(read.rows!, { cityAliases });

  // How many of these are already in the system, so the preview is honest
  // about what a second run would actually do.
  let alreadyImported = 0;
  const ids = parsed.leads.map((l) => l.externalId);
  for (let i = 0; i < ids.length; i += 500) {
    const { count } = await db
      .from("deals").select("external_id", { count: "exact", head: true })
      .in("external_id", ids.slice(i, i + 500));
    alreadyImported += count ?? 0;
  }

  return {
    ok: true,
    preview: {
      totalRows: parsed.totalRows,
      willImport: parsed.leads.length - alreadyImported,
      skipped: parsed.skipped.map((s) => ({ rowNumber: s.rowNumber, reason: s.reason })),
      duplicatesInFile: parsed.duplicatesInFile,
      invalidPhoneCount: parsed.invalidPhoneCount,
      campaignErrorsCleared: parsed.campaignErrorsCleared,
      missingCity: parsed.missingCity,
      dateRange: parsed.dateRange,
      alreadyImported,
    },
  };
}

export async function commitMetaImport(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "run_import")) return { ok: false, error: "Only an admin can run an import." };

  const read = await readCsv(formData);
  if ("error" in read) return { ok: false, error: read.error };

  const db = createAdminClient();
  const { cityAliases } = await settingsFor(db);
  const parsed = parseMetaCsv(read.rows!, { cityAliases });

  try {
    const result = await commitMetaLeads(db, parsed.leads);
    revalidatePath("/admin/import");
    revalidatePath("/deals");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}

/* ------------------------------------------------- Importer B — the tracker */

export interface TrackerPreviewState {
  ok: boolean;
  error?: string;
  preview?: {
    parse: Omit<TrackerParseResult, "leads">;
    plan: Omit<TrackerPlan, "rows">;
    /** A readable handful, so the numbers above can be spot-checked. */
    sample: TrackerPlan["rows"];
  };
}

export interface TrackerCommitState {
  ok: boolean;
  error?: string;
  result?: Omit<TrackerCommitResult, "rows">;
}

async function readTrackerCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the tracker CSV first." as const };
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (!parsed.data.length) return { error: "That file has no rows." as const };
  if (!("Contact" in parsed.data[0]) || !("Remarks" in parsed.data[0])) {
    return { error: "That does not look like the sales tracker — no Contact or Remarks column." as const };
  }
  return { rows: parsed.data };
}

async function trackerContext(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("app_settings").select("key, value")
    .in("key", ["city_aliases", "rep_initials_map"]);
  const by = new Map((data ?? []).map((r) => [r.key, r.value]));
  return {
    cityAliases: (by.get("city_aliases") as Record<string, string>) ?? {},
    repMap: (by.get("rep_initials_map") as Record<string, string>) ?? {},
  };
}

/**
 * Reads the file, matches every row against what is already in the database,
 * and reports exactly what a commit would do. **Writes nothing.**
 *
 * This import creates ~700 deals and thousands of activities, and `activities`
 * is append-only with no delete grant — so a preview that guesses is worse than
 * no preview. It calls the same planner the commit calls.
 */
export async function previewTrackerImport(
  _prev: TrackerPreviewState, formData: FormData,
): Promise<TrackerPreviewState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "run_import")) return { ok: false, error: "Only an admin can run an import." };

  const read = await readTrackerCsv(formData);
  if ("error" in read) return { ok: false, error: read.error };

  const db = createAdminClient();
  const { cityAliases, repMap } = await trackerContext(db);
  const defaultYear = Number(formData.get("default_year")) || new Date().getFullYear();

  const { leads, ...parse } = parseTrackerCsv(read.rows!, { cityAliases, defaultYear });

  try {
    const { rows, ...plan } = await planTrackerImport(db, leads, repMap);
    return {
      ok: true,
      preview: {
        parse,
        plan,
        // Enough to spot-check the numbers without rendering 1,700 rows.
        sample: [
          ...rows.filter((r) => r.path === "matched" && r.stageTo).slice(0, 8),
          ...rows.filter((r) => r.path === "created").slice(0, 8),
        ],
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the database." };
  }
}

export async function commitTrackerImportAction(
  _prev: TrackerCommitState, formData: FormData,
): Promise<TrackerCommitState> {
  const user = await getCurrentUser();
  if (!user || !can(user, "run_import")) return { ok: false, error: "Only an admin can run an import." };

  // Deliberate friction. This writes append-only rows that cannot be cleanly
  // undone, so it takes a typed confirmation rather than a second click.
  if (String(formData.get("confirm") ?? "").trim().toUpperCase() !== "IMPORT") {
    return { ok: false, error: 'Type IMPORT to confirm. Nothing has been written.' };
  }

  const read = await readTrackerCsv(formData);
  if ("error" in read) return { ok: false, error: read.error };

  const db = createAdminClient();
  const { cityAliases, repMap } = await trackerContext(db);
  const defaultYear = Number(formData.get("default_year")) || new Date().getFullYear();
  const { leads } = parseTrackerCsv(read.rows!, { cityAliases, defaultYear });

  try {
    const { rows, ...result } = await commitTrackerImport(db, leads, repMap);
    void rows;
    revalidatePath("/admin/import");
    revalidatePath("/deals");
    revalidatePath("/admin/dashboard");
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Import failed." };
  }
}
