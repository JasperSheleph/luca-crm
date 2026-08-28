/**
 * Importer A — Meta Lead Ads CSV.
 *
 * Pure parsing and classification: no database, no React. The caller decides
 * what to do with the result, which is what makes this testable against the
 * real 1,074-row export.
 *
 * Every rule here comes from something actually present in their data.
 */

import { normalizePhone, isValidIndianMobile, phoneKey } from "@/lib/domain/phone";
import { normalizeCity } from "@/lib/domain/city";

/** The 18 columns Meta exports. */
export const META_COLUMNS = [
  "id", "created_time", "ad_id", "ad_name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "form_id", "form_name", "is_organic",
  "platform", "are_you_planning_to_install_the_lift?", "full_name", "email",
  "phone_number", "city", "lead_status",
] as const;

/**
 * Nine rows carry this instead of a campaign name. Stored verbatim it becomes a
 * fake campaign inside the per-campaign reporting the dashboard is built on.
 */
function isPermissionError(v: string | null): boolean {
  return !!v && v.toLowerCase().includes("don't have enough permission");
}

export interface ParsedLead {
  externalId: string;
  /** The ORIGINAL Meta timestamp. Never the import time — lead age depends on it. */
  createdAt: string;
  name: string | null;
  email: string | null;
  phoneRaw: string;
  phoneNormalized: string;
  phoneKey: string;
  invalidPhone: boolean;
  city: string | null;
  cityNormalized: string | null;
  campaignName: string | null;
  platform: string | null;
  planningToInstall: boolean | null;
  raw: Record<string, string>;
}

export interface SkippedRow {
  rowNumber: number;
  externalId: string | null;
  reason: string;
}

export interface MetaParseResult {
  leads: ParsedLead[];
  skipped: SkippedRow[];
  /** Duplicate phone numbers WITHIN the file — later rows lose to earlier ones. */
  duplicatesInFile: number;
  invalidPhoneCount: number;
  campaignErrorsCleared: number;
  missingCity: number;
  dateRange: { from: string; to: string } | null;
  totalRows: number;
}

export interface ParseOptions {
  cityAliases?: Record<string, string>;
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function parseMetaCsv(
  rows: Record<string, string>[],
  opts: ParseOptions = {},
): MetaParseResult {
  const aliases = opts.cityAliases ?? {};
  const leads: ParsedLead[] = [];
  const skipped: SkippedRow[] = [];
  const seenPhones = new Set<string>();
  const seenIds = new Set<string>();

  let duplicatesInFile = 0;
  let invalidPhoneCount = 0;
  let campaignErrorsCleared = 0;
  let missingCity = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // 1-indexed, and row 1 is the header
    const externalId = clean(row.id);

    // At least one row has created_time = "~". Skip gracefully and report the
    // count; never fail the whole import over it.
    const createdRaw = clean(row.created_time);
    const created = createdRaw ? new Date(createdRaw) : null;
    if (!createdRaw || !created || Number.isNaN(created.getTime())) {
      skipped.push({ rowNumber, externalId, reason: `Unreadable created_time: ${createdRaw ?? "(empty)"}` });
      return;
    }

    if (!externalId) {
      skipped.push({ rowNumber, externalId: null, reason: "Missing Meta lead id" });
      return;
    }
    if (seenIds.has(externalId)) {
      skipped.push({ rowNumber, externalId, reason: "Repeated lead id within the file" });
      return;
    }
    seenIds.add(externalId);

    const phoneRaw = clean(row.phone_number);
    if (!phoneRaw) {
      skipped.push({ rowNumber, externalId, reason: "No phone number" });
      return;
    }
    const phoneNormalized = normalizePhone(phoneRaw);
    const key = phoneKey(phoneRaw);
    if (!phoneNormalized || !key) {
      skipped.push({ rowNumber, externalId, reason: `Unusable phone: ${phoneRaw}` });
      return;
    }

    // ~2% are international or malformed. Import, flag, surface — never drop.
    const invalidPhone = !isValidIndianMobile(phoneNormalized);
    if (invalidPhone) invalidPhoneCount++;

    const isDuplicate = seenPhones.has(key);
    if (isDuplicate) duplicatesInFile++;
    seenPhones.add(key);

    const iso = created.toISOString();
    if (!minDate || iso < minDate) minDate = iso;
    if (!maxDate || iso > maxDate) maxDate = iso;

    let campaignName = clean(row.campaign_name);
    if (isPermissionError(campaignName)) {
      campaignName = null;
      campaignErrorsCleared++;
    }

    const city = clean(row.city);
    if (!city) missingCity++;

    const planning = clean(row["are_you_planning_to_install_the_lift?"])?.toLowerCase();

    leads.push({
      externalId,
      createdAt: iso,
      name: clean(row.full_name),
      email: clean(row.email),
      phoneRaw,
      phoneNormalized,
      phoneKey: key,
      invalidPhone,
      city,
      cityNormalized: normalizeCity(city, aliases),
      campaignName,
      platform: clean(row.platform),
      // Unlike lead_status and is_organic, this one genuinely varies.
      planningToInstall: planning === "yes" ? true : planning === "no" ? false : null,
      raw: row,
    });
  });

  return {
    leads,
    skipped,
    duplicatesInFile,
    invalidPhoneCount,
    campaignErrorsCleared,
    missingCity,
    dateRange: minDate && maxDate ? { from: minDate, to: maxDate } : null,
    totalRows: rows.length,
  };
}
