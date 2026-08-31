/**
 * Which notification rule fires, and when.
 *
 * Pure: takes rules and a clock, returns what is due. No database, no sending.
 *
 * ⚠ Every time comparison happens in Asia/Kolkata. notification_rules
 * .daily_at_time is a bare `time` with no zone, and the server may run UTC —
 * so "9am daily" silently becomes 2:30pm IST unless this is explicit.
 */

import { TIMEZONE } from "@/lib/config/design-tokens";

export type TimingType = "immediate" | "offset" | "daily_at" | "weekly_at";
export type RecipientType = "role" | "specific_user" | "deal_owner";

export interface NotificationRule {
  trigger_key: string;
  template_key: string | null;
  is_enabled: boolean;
  timing_type: TimingType;
  offset_minutes: number | null;
  daily_at_time: string | null;   // "HH:MM" or "HH:MM:SS", always IST
  weekly_day: number | null;      // 1 = Monday
  recipient_type: RecipientType;
  recipient_role: string | null;
  recipient_user_id: string | null;
  threshold_value: number | null;
}

/** Wall-clock parts of an instant, in India. */
export function istParts(now: Date): { hour: number; minute: number; weekday: number; ymd: string } {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit",
    weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const days: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: days[parts.weekday as string] ?? 0,
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * Is a scheduled rule due in the tick covering `now`?
 * `toleranceMinutes` absorbs cron jitter — the daily job is not second-accurate.
 */
export function isRuleDue(rule: NotificationRule, now: Date, toleranceMinutes = 10): boolean {
  if (!rule.is_enabled) return false;
  if (rule.timing_type === "immediate" || rule.timing_type === "offset") return false;
  if (!rule.daily_at_time) return false;

  const { hour, minute, weekday } = istParts(now);
  const [h, m] = rule.daily_at_time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;

  if (rule.timing_type === "weekly_at") {
    if (rule.weekly_day === null || rule.weekly_day !== weekday) return false;
  }

  const nowMins = hour * 60 + minute;
  const dueMins = h * 60 + m;
  const delta = nowMins - dueMins;
  return delta >= 0 && delta < toleranceMinutes;
}

/** When an offset rule (e.g. "2h before the appointment") should fire. */
export function offsetFireTime(anchor: Date, offsetMinutes: number): Date {
  return new Date(anchor.getTime() + offsetMinutes * 60_000);
}

/**
 * Who receives it. Individual pings stay personal; admins get digests.
 * A firehose gets muted, and a muted system is decorative.
 */
export function resolveRecipients(
  rule: NotificationRule,
  ctx: { dealOwnerIds?: string[]; usersByRole?: Record<string, string[]> },
): string[] {
  switch (rule.recipient_type) {
    case "deal_owner":
      return ctx.dealOwnerIds ?? [];
    case "specific_user":
      return rule.recipient_user_id ? [rule.recipient_user_id] : [];
    case "role":
      return rule.recipient_role ? (ctx.usersByRole?.[rule.recipient_role] ?? []) : [];
    default:
      return [];
  }
}

/**
 * Every trigger the engine knows about. These are the `trigger_key` values
 * seeded into notification_rules — the two lists must not drift, so the cron
 * route asserts against this one and reports anything it cannot place.
 */
export const TRIGGER_KEYS = [
  "lead_assigned",
  "appointment_tomorrow",
  "appointment_approaching",
  "next_action_overdue",
  "visit_awaiting_verification",
  "verification_failed",
  "deal_won",
  "daily_summary",
  "uncontacted_leads",
] as const;

export type TriggerKey = (typeof TRIGGER_KEYS)[number];

/**
 * Fills `{{name}}` placeholders in an approved template body.
 *
 * The wording is fixed — Meta approves each body — so this substitutes and
 * nothing else. A missing variable renders as an em dash rather than leaving
 * `{{count}}` on screen, because a half-rendered message reads as a bug to the
 * person receiving it and there is no way for them to report it.
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = vars[name];
    return value === null || value === undefined || value === "" ? "—" : String(value);
  });
}

/**
 * The key that stops a job sending the same thing twice.
 *
 * pg_cron fires every 15 minutes and isRuleDue() deliberately tolerates 10
 * minutes of jitter, so one rule can be "due" on two consecutive ticks. A
 * unique index on this key turns the second tick into a no-op instead of a
 * second message. `scope` is whatever makes the notification unique: the IST
 * date for a daily digest, the appointment id for a per-appointment reminder.
 *
 * Event-driven notifications pass no key at all — if a lead really was
 * assigned twice, that is two events and the timeline should say so.
 */
export function dedupeKey(triggerKey: string, userId: string, scope: string): string {
  return `${triggerKey}:${userId}:${scope}`;
}

/**
 * The UTC instants bounding one day in India, and that day's date.
 *
 * `dayOffset` 0 is today, 1 tomorrow, -1 yesterday. Needed because "how many
 * leads arrived today" and "which visits are tomorrow" are questions about
 * India's calendar, asked by a server that is almost certainly on UTC. India
 * has no daylight saving, so a day is always exactly 24 hours.
 */
export function istDayRange(now: Date, dayOffset = 0): { start: Date; end: Date; ymd: string } {
  const start = new Date(
    new Date(`${istParts(now).ymd}T00:00:00+05:30`).getTime() + dayOffset * 86_400_000,
  );
  return {
    start,
    end: new Date(start.getTime() + 86_400_000),
    ymd: istParts(start).ymd,
  };
}

/**
 * Which appointment times have their "N minutes before" moment inside this tick.
 *
 * Inverts offsetFireTime: the reminder for an appointment fires at
 * `scheduled_at + offsetMinutes`, so asking which appointments to warn about
 * now means shifting the tick window the other way and querying scheduled_at
 * against it. Doing this in the query rather than in JavaScript is what keeps
 * the job from reading every future appointment on every tick.
 */
export function offsetWindow(
  tickStart: Date,
  tickEnd: Date,
  offsetMinutes: number,
): { from: Date; to: Date } {
  return {
    from: new Date(tickStart.getTime() - offsetMinutes * 60_000),
    to: new Date(tickEnd.getTime() - offsetMinutes * 60_000),
  };
}
