/**
 * Importer B — their legacy sales tracker.
 *
 * Pure parsing and classification: no database, no React. The caller decides
 * what to do with the result, which is what makes this testable against the
 * real 1,763-row file.
 *
 * ⚠ The tracker is NOT a lead source. Meta is.
 *
 * 974 of the 1,063 Meta phone numbers also appear here — the two files are
 * largely the same people recorded twice. A naive "phone match sets is_repeat,
 * create a deal anyway" rule would produce ~974 phantom deals: roughly 2,800
 * deals for ~1,860 real enquiries, a meaningless repeat signal, and every
 * funnel percentage wrong from day one.
 *
 * So every row takes one of two paths, keyed on normalised phone:
 *   match    → attach to the existing deal. No new customer, no new deal
 *   no match → create one, source = Legacy Tracker
 *
 * This module does not know which is which; it produces one record per distinct
 * phone and the commit step decides. Run Importer A first — the ordering is
 * required, not incidental.
 */

import { normalizePhone, isValidIndianMobile, phoneKey } from "@/lib/domain/phone";
import { normalizeCity } from "@/lib/domain/city";
import type { DealStage } from "@/lib/domain/stages";

/** The named columns. Six unnamed trailing ones also carry stray text. */
export const TRACKER_COLUMNS = [
  "Date", "RP", "Floors", "Duration", "Name", "Mail", "Contact", "Place",
  "Remarks", "site visit done (yes/NO)", "Quotation Shared (yes/No)",
  "Status", "Status Remarks",
] as const;

/**
 * How far along the pipeline a stage sits. Only the linear ladder — the
 * terminal states are handled separately, because "dropped" is an outcome
 * rather than a rung.
 */
const LADDER: DealStage[] = [
  "qualifying", "appointment_scheduled", "site_visit_done", "quote_sent", "negotiation",
];

const rank = (s: DealStage) => LADDER.indexOf(s);

/** Reached the end one way or the other; a milestone flag cannot override it. */
const TERMINAL: DealStage[] = ["won", "lost", "not_pursued"];

export interface TrackerActivity {
  /** ISO, or null where the chunk carried no readable date. */
  occurredAt: string | null;
  notes: string;
}

export interface TrackerLead {
  /** Every source row that collapsed into this one, for the preview. */
  rowNumbers: number[];
  phoneKey: string;
  phoneNormalized: string;
  /** True where no usable phone existed and a placeholder was minted. */
  placeholderPhone: boolean;
  invalidPhone: boolean;
  name: string | null;
  email: string | null;
  city: string | null;
  cityNormalized: string | null;
  /** Earliest readable tracker date, or null. Never overwrites a Meta date. */
  date: string | null;
  /** The raw RP string, e.g. "NV/JN". Resolved to a user by the caller. */
  repInitials: string | null;
  /** Only accepted where it matched G+N. */
  floors: number | null;
  timelineMonths: string | null;
  stage: DealStage;
  /** The original Status text, kept whether or not it was recognised. */
  statusRaw: string | null;
  statusRecognised: boolean;
  siteVisitDone: boolean;
  quotationShared: boolean;
  /** The whole original text, preserved verbatim. Nothing is ever lost. */
  importedNote: string;
  /** Best-effort split of Remarks into dated calls. */
  activities: TrackerActivity[];
}

export interface TrackerParseResult {
  leads: TrackerLead[];
  totalRows: number;
  /** Rows that collapsed onto an earlier row with the same phone. */
  duplicatesInFile: number;
  noPhone: number;
  invalidPhone: number;
  unreadableDates: number;
  withRep: number;
  parsedActivities: number;
  /** Statuses that did not match any known value and fell back to Qualifying. */
  unrecognisedStatuses: string[];
}

export interface TrackerParseOptions {
  cityAliases?: Record<string, string>;
  /**
   * The year for dates that carry none — "2 May" is 1,537 of the rows. The file
   * on hand runs May–Aug 2026. Guessing the current year would silently
   * mis-date the whole import the moment it is re-run in January.
   */
  defaultYear?: number;
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * At least six formats live in this column: "2 May" (1,537), ISO timestamps
 * (176), a bare weekday like "Mon" (29), empty (16), plus "06- Jul",
 * "2026/5/14", "01/05/2026" and dd/mm/yy.
 *
 * On failure this returns null and the row still imports — a tracker row with
 * an unreadable date is worth far more than no row at all.
 */
export function parseTrackerDate(raw: string | null, defaultYear: number): string | null {
  const s = clean(raw);
  if (!s) return null;

  // "2 May", "06- Jul", "2 May 2026"
  const dayMonth = s.match(/^(\d{1,2})\s*[-/. ]?\s*([A-Za-z]{3,})\.?\s*(\d{4})?$/);
  if (dayMonth) {
    const month = MONTHS[dayMonth[2].slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      const year = dayMonth[3] ? Number(dayMonth[3]) : defaultYear;
      return iso(year, month, Number(dayMonth[1]));
    }
  }

  // "2026/5/14" and "2026-05-14"
  const ymd = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymd) return iso(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

  // "01/05/2026" and dd/mm/yy. Day-first: this is an Indian spreadsheet, and
  // reading 05/01 as 5 January rather than 1 May would be silently wrong on
  // every row where both halves are 12 or under.
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/);
  if (dmy) {
    const year = Number(dmy[3]) < 100 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    return iso(year, Number(dmy[2]) - 1, Number(dmy[1]));
  }

  // A full ISO timestamp.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime()) && /\d{4}/.test(s)) return parsed.toISOString();

  // A bare weekday name, or anything else. Unusable as a date.
  return null;
}

function iso(year: number, monthIndex: number, day: number): string | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, monthIndex, day));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== day) return null;
  return d.toISOString();
}

/**
 * Remarks is the important column — 1,728 rows carry one, 88% contain date
 * patterns and 196 hold three or more entries. It is the direct replacement
 * for the timeline, and the core value of the whole project.
 *
 * Split on newlines; a chunk beginning DD-MM or DD/MM becomes a dated call.
 * Ordering in the source is inconsistent — sometimes newest first — so the
 * parsed dates are trusted and the line order is not.
 */
export function parseRemarks(
  raw: string | null, defaultYear: number,
): TrackerActivity[] {
  const s = clean(raw);
  if (!s) return [];

  const out: TrackerActivity[] = [];
  for (const line of s.split(/\r?\n/)) {
    const chunk = line.trim();
    if (!chunk) continue;

    const m = chunk.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2}|\d{4}))?\s*[-–:.]?\s*(.*)$/);
    if (m) {
      const year = m[3] ? (Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3])) : defaultYear;
      const at = iso(year, Number(m[2]) - 1, Number(m[1]));
      const text = m[4].trim();
      // A date with nothing after it says only that someone touched the row.
      if (at) { out.push({ occurredAt: at, notes: text || "Called" }); continue; }
    }
    out.push({ occurredAt: null, notes: chunk });
  }

  // Trust the dates, not the order they were typed in. Undated chunks keep
  // their relative position at the end.
  const dated = out.filter((a) => a.occurredAt).sort((a, b) => a.occurredAt!.localeCompare(b.occurredAt!));
  return [...dated, ...out.filter((a) => !a.occurredAt)];
}

/**
 * Map the Status column onto a stage.
 *
 * Roughly 37 of the 137 distinct statuses are free-text sentences such as
 * "site visit - fixed | can go anytime, have to inform the client before the
 * visit". Anything unrecognised becomes Qualifying with the original kept —
 * inventing a stage from a sentence would put fiction in the funnel.
 */
export function stageFromStatus(raw: string | null): { stage: DealStage; recognised: boolean } {
  const s = clean(raw)?.toLowerCase();
  if (!s) return { stage: "qualifying", recognised: false };

  if (s === "won") return { stage: "won", recognised: true };
  if (s === "drop" || s === "dropped" || s === "no") return { stage: "not_pursued", recognised: true };
  if (s === "negotiation") return { stage: "negotiation", recognised: true };
  if (s === "site visit pending" || s === "demo visit pending") {
    return { stage: "appointment_scheduled", recognised: true };
  }
  return { stage: "qualifying", recognised: false };
}

/**
 * The final stage, combining the Status outcome with the two milestone flags.
 *
 * `site visit done = yes` (81 rows) and `Quotation Shared = yes` (60) push a
 * deal forward where they imply more progress than Status does. A terminal
 * status always wins: a dropped deal that was quoted is still dropped, and
 * showing it as Quote Sent would put a dead deal in the live pipeline.
 */
export function resolveStage(
  fromStatus: DealStage, siteVisitDone: boolean, quotationShared: boolean,
): DealStage {
  if (TERMINAL.includes(fromStatus)) return fromStatus;

  let best = fromStatus;
  if (siteVisitDone && rank("site_visit_done") > rank(best)) best = "site_visit_done";
  if (quotationShared && rank("quote_sent") > rank(best)) best = "quote_sent";
  return best;
}

const yes = (v: unknown) => clean(v)?.toLowerCase() === "yes";

/** Floors is polluted with "rnr", "repeated lead", "no incoming", "w". */
function parseFloors(raw: string | null): number | null {
  const s = clean(raw);
  if (!s) return null;
  const m = s.match(/^g\s*\+\s*(\d{1,2})$/i);
  return m ? Number(m[1]) : null;
}

export function parseTrackerCsv(
  rows: Record<string, string>[],
  opts: TrackerParseOptions = {},
): TrackerParseResult {
  const aliases = opts.cityAliases ?? {};
  const defaultYear = opts.defaultYear ?? 2026;

  const byPhone = new Map<string, TrackerLead>();
  const unrecognised = new Set<string>();
  let duplicatesInFile = 0;
  let noPhone = 0;
  let invalidPhone = 0;
  let unreadableDates = 0;
  let placeholderSeq = 0;

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // 1-indexed, and row 1 is the header

    // ---- phone: the key for everything
    const contactRaw = clean(row.Contact);
    let key = contactRaw ? phoneKey(contactRaw) : null;
    let normalized = contactRaw ? normalizePhone(contactRaw) : null;
    let placeholderPhone = false;

    if (!key || !normalized) {
      // Four rows have no usable phone. They still hold remarks and a name, so
      // they import against a placeholder and are flagged, never discarded.
      placeholderSeq += 1;
      key = `no-phone-${placeholderSeq}`;
      normalized = `no-phone-${placeholderSeq}`;
      placeholderPhone = true;
      noPhone += 1;
    }

    const date = parseTrackerDate(clean(row.Date), defaultYear);
    if (clean(row.Date) && !date) unreadableDates += 1;

    // ---- the note that loses nothing
    const floorsRaw = clean(row.Floors);
    const floors = parseFloors(floorsRaw);
    const parts: string[] = [];
    if (clean(row.Remarks)) parts.push(String(row.Remarks).trim());
    if (clean(row["Status Remarks"])) parts.push(`Status remarks: ${String(row["Status Remarks"]).trim()}`);
    if (clean(row.RP)) parts.push(`Rep in tracker: ${String(row.RP).trim()}`);
    if (floorsRaw && floors === null) parts.push(`Floors column said: ${floorsRaw}`);
    // The six unnamed trailing columns, 13 rows of which carry stray text.
    for (const [k, v] of Object.entries(row)) {
      if ((TRACKER_COLUMNS as readonly string[]).includes(k)) continue;
      if (clean(v)) parts.push(`${k || "Extra column"}: ${String(v).trim()}`);
    }

    const status = stageFromStatus(clean(row.Status));
    if (!status.recognised && clean(row.Status)) unrecognised.add(String(row.Status).trim());

    const siteVisitDone = yes(row["site visit done (yes/NO)"]);
    const quotationShared = yes(row["Quotation Shared (yes/No)"]);

    const lead: TrackerLead = {
      rowNumbers: [rowNumber],
      phoneKey: key,
      phoneNormalized: normalized,
      placeholderPhone,
      invalidPhone: !placeholderPhone && !isValidIndianMobile(normalized),
      name: clean(row.Name),
      email: clean(row.Mail),
      city: clean(row.Place),
      cityNormalized: normalizeCity(clean(row.Place), aliases),
      date,
      repInitials: clean(row.RP),
      floors,
      timelineMonths: clean(row.Duration),
      stage: resolveStage(status.stage, siteVisitDone, quotationShared),
      statusRaw: clean(row.Status),
      statusRecognised: status.recognised,
      siteVisitDone,
      quotationShared,
      importedNote: parts.join("\n\n"),
      activities: parseRemarks(clean(row.Remarks), defaultYear),
    };

    if (lead.invalidPhone) invalidPhone += 1;

    // ---- 82 rows (4.65%) repeat a phone. Collapse rather than duplicate.
    const existing = byPhone.get(key);
    if (!existing) { byPhone.set(key, lead); return; }

    duplicatesInFile += 1;
    merge(existing, lead);
  });

  const leads = [...byPhone.values()];
  return {
    leads,
    totalRows: rows.length,
    duplicatesInFile,
    noPhone,
    invalidPhone,
    unreadableDates,
    withRep: leads.filter((l) => l.repInitials).length,
    parsedActivities: leads.reduce((n, l) => n + l.activities.length, 0),
    unrecognisedStatuses: [...unrecognised].sort(),
  };
}

/**
 * Fold a repeated row into the one already held for that phone.
 *
 * Additive only: the extra row contributes its remarks and can push the stage
 * forward, but never blanks a field the first row filled. Two rows for the same
 * customer are two entries about one deal, not two deals.
 */
function merge(into: TrackerLead, extra: TrackerLead): void {
  into.rowNumbers.push(...extra.rowNumbers);
  into.name ??= extra.name;
  into.email ??= extra.email;
  into.city ??= extra.city;
  into.cityNormalized ??= extra.cityNormalized;
  into.repInitials ??= extra.repInitials;
  into.floors ??= extra.floors;
  into.timelineMonths ??= extra.timelineMonths;

  // The earliest date is the enquiry; a later row is a follow-up.
  if (extra.date && (!into.date || extra.date < into.date)) into.date = extra.date;

  into.siteVisitDone ||= extra.siteVisitDone;
  into.quotationShared ||= extra.quotationShared;

  // A terminal outcome on either row settles it; otherwise take the furthest.
  if (TERMINAL.includes(extra.stage)) into.stage = extra.stage;
  else if (!TERMINAL.includes(into.stage) && rank(extra.stage) > rank(into.stage)) {
    into.stage = extra.stage;
  }
  if (!into.statusRaw) { into.statusRaw = extra.statusRaw; into.statusRecognised = extra.statusRecognised; }

  if (extra.importedNote) {
    into.importedNote = into.importedNote
      ? `${into.importedNote}\n\n--- another tracker row for this number ---\n\n${extra.importedNote}`
      : extra.importedNote;
  }
  into.activities.push(...extra.activities);
}

/**
 * Resolve the RP column to a user.
 *
 * 127 rows carry initials — JN (63), NV (29), NV/JN (26), plus Jacil, JF,
 * NV/Jacil, JACIL/JN, NV/Jaleel. This is the only historical rep data in the
 * entire dataset, so it must not be dropped.
 *
 * Combined values take the first initial; the full original string is already
 * in the imported note, so nothing is lost by simplifying here. The map is an
 * admin-editable app_settings row — initials are never hardcoded.
 */
export function resolveRep(
  initials: string | null, map: Record<string, string>,
): string | null {
  if (!initials) return null;
  const first = initials.split("/")[0].trim();
  if (!first) return null;

  const lower = first.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.trim().toLowerCase() === lower) return v;
  }
  return null;
}
