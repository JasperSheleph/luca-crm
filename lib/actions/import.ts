"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/db/admin";
import { getCurrentUser } from "@/lib/queries/users";
import { can } from "@/lib/domain/permissions";
import { parseMetaCsv, type MetaParseResult } from "@/lib/importers/meta";
import { commitMetaLeads, type CommitResult } from "@/lib/importers/meta-commit";

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
