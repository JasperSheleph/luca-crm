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
