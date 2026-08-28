/**
 * Design tokens — semantic mapping only.
 *
 * Raw colour values live in ONE place: the `:root` block in app/globals.css.
 * This file says what each colour *means*, so that changing "the Won colour"
 * is a one-line edit here and changing "the brand navy" is a one-line edit
 * there. Nothing else in the app should name a colour.
 */

import type { DealStage } from "@/lib/domain/stages";

/** Tailwind classes per stage badge. Mirrors the stage colours in the spec. */
export const STAGE_STYLES: Record<DealStage, { badge: string; dot: string }> = {
  qualifying:            { badge: "bg-navy-100 text-navy-700 border-navy-700/20", dot: "bg-navy-700" },
  appointment_scheduled: { badge: "bg-navy-100 text-navy-800 border-navy-800/20", dot: "bg-navy-800" },
  site_visit_done:       { badge: "bg-navy-100 text-navy-900 border-navy-900/20", dot: "bg-navy-900" },
  quote_sent:            { badge: "bg-warning/10 text-warning border-warning/25",  dot: "bg-warning" },
  negotiation:           { badge: "bg-warning/10 text-warning border-warning/25",  dot: "bg-warning" },
  won:                   { badge: "bg-gold/10 text-gold border-gold/30",           dot: "bg-gold" },
  lost:                  { badge: "bg-danger/10 text-danger border-danger/25",     dot: "bg-danger" },
  not_pursued:           { badge: "bg-parked/10 text-parked border-parked/25",     dot: "bg-parked" },
  nurture:               { badge: "bg-parked/10 text-parked border-parked/25",     dot: "bg-parked" },
};

export const STAGE_LABELS: Record<DealStage, string> = {
  qualifying: "Qualifying",
  appointment_scheduled: "Appointment Scheduled",
  site_visit_done: "Site Visit Done",
  quote_sent: "Quote Sent",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
  not_pursued: "Not Pursued",
  nurture: "Nurture",
};

/** Everything runs on India time. Never render a raw UTC timestamp. */
export const TIMEZONE = "Asia/Kolkata";

export const CURRENCY = "INR";

export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", timeZone: TIMEZONE,
  }).format(new Date(d));
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    hour12: true, timeZone: TIMEZONE,
  }).format(new Date(d));
}
