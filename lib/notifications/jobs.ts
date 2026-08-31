/**
 * The timed half of the notification engine.
 *
 * pg_cron POSTs /api/cron every 15 minutes; this decides what, if anything, is
 * due on that tick and hands it to notify(). Which rules exist, when they fire
 * and who they go to are all rows in notification_rules — nothing here decides
 * policy, it only executes it. Adding a *new kind* of notification means a new
 * job function here and a new row; changing an existing one means editing the
 * row from Admin -> Settings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isRuleDue, istDayRange, istParts, offsetWindow,
  type NotificationRule, type TriggerKey,
} from "@/lib/domain/notifications";
import { TIMEZONE } from "@/lib/config/design-tokens";
import { loadEngineContext, notify, type EngineContext, type NotifyResult } from "./dispatch";

/** Stages a deal is no longer being worked in. Mirrors the deals list filters. */
const CLOSED_STAGES = "(won,lost,not_pursued)";

/** "10:30 am" in India, for the appointment reminders. */
function istTime(at: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit", minute: "2-digit", hour12: true, timeZone: TIMEZONE,
  }).format(new Date(at));
}

/** Where a person should land when the notification is about their own workload. */
function workQueueFor(role: string | undefined): string {
  return role === "sales_rep" ? "/my-deals" : "/queue";
}

export interface JobReport {
  now: string;
  /** Trigger keys that were due on this tick. */
  ran: string[];
  results: NotifyResult[];
}

/**
 * Runs every rule that is due, and returns what happened.
 *
 * `windowMinutes` must match the cron interval: it defines the tick this call
 * is responsible for, which is what stops an appointment reminder falling
 * through the gap between two runs. Overlap is harmless — every scheduled
 * notification carries an idempotency key.
 */
export async function runDueJobs(
  db: SupabaseClient,
  now: Date = new Date(),
  windowMinutes = 15,
): Promise<JobReport> {
  const ctx = await loadEngineContext(db);
  const report: JobReport = { now: now.toISOString(), ran: [], results: [] };

  const tickStart = new Date(now.getTime() - windowMinutes * 60_000);

  for (const rule of ctx.rules.values()) {
    if (!rule.is_enabled) continue;

    // Offset rules are anchored to a row's own timestamp, not to a wall clock,
    // so they run on every tick and select against a moving window instead of
    // being asked "is 09:00 now?".
    if (rule.timing_type !== "offset" && !isRuleDue(rule, now)) continue;

    // 'immediate' rules have no job here — they fire from the server action
    // that causes them — so this lookup is also what filters them out.
    const job = JOBS[rule.trigger_key as TriggerKey];
    if (!job) continue;

    report.ran.push(rule.trigger_key);
    report.results.push(...(await job({ db, ctx, rule, now, tickStart })));
  }

  return report;
}

interface JobArgs {
  db: SupabaseClient;
  ctx: EngineContext;
  rule: NotificationRule;
  now: Date;
  tickStart: Date;
}

type Job = (args: JobArgs) => Promise<NotifyResult[]>;

/* ------------------------------------------------------------ the jobs */

/**
 * "N deals have an overdue next action" — one message per owner, not one per
 * deal. A rep with eleven overdue calls needs to know that; being told eleven
 * separate times is how a notification system gets muted.
 */
const nextActionOverdue: Job = async ({ db, ctx, now }) => {
  const { data } = await db
    .from("deals")
    .select("id, rep_owner_id, crm_owner_id")
    .lt("next_action_at", now.toISOString())
    .not("stage", "in", CLOSED_STAGES);

  const counts = new Map<string, number>();
  for (const deal of data ?? []) {
    // Whoever is actually working it: the rep once handed over, the CRM
    // Manager before that.
    const owner = (deal.rep_owner_id ?? deal.crm_owner_id) as string | null;
    if (owner) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }

  const { ymd } = istParts(now);
  const out: NotifyResult[] = [];
  for (const [ownerId, count] of counts) {
    out.push(await notify(db, {
      triggerKey: "next_action_overdue",
      vars: { count },
      dealOwnerIds: [ownerId],
      scope: ymd,
      href: workQueueFor(ctx.users.get(ownerId)?.role),
    }, ctx));
  }
  return out;
};

/** Leads nobody has called yet, past the threshold the admin set. */
const uncontactedLeads: Job = async ({ db, ctx, rule, now }) => {
  const days = Number(rule.threshold_value ?? 7);
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();

  const { count } = await db
    .from("deals")
    .select("id", { count: "exact", head: true })
    .is("first_contacted_at", null)
    .lt("created_at", cutoff)
    .not("stage", "in", CLOSED_STAGES);

  // Nothing overdue is not news. Sending "0 leads are uncontacted" every week
  // is exactly how people learn to ignore the sender.
  if (!count) return [];

  const { ymd } = istParts(now);
  return [await notify(db, {
    triggerKey: "uncontacted_leads",
    vars: { count, days },
    scope: ymd,
    href: "/deals?uncontacted=1",
  }, ctx)];
};

/** The end-of-day figure for the owners. */
const dailySummary: Job = async ({ db, ctx, now }) => {
  const { start, end, ymd } = istDayRange(now);
  const from = start.toISOString();
  const to = end.toISOString();

  // Four head-only counts rather than four page reads: the digest needs the
  // numbers, not the rows.
  const [leads, calls, visits, won] = await Promise.all([
    db.from("deals").select("id", { count: "exact", head: true })
      .gte("created_at", from).lt("created_at", to),
    db.from("activities").select("id", { count: "exact", head: true })
      .eq("type", "call").gte("occurred_at", from).lt("occurred_at", to),
    db.from("activities").select("id", { count: "exact", head: true })
      .eq("type", "visit_completed").gte("occurred_at", from).lt("occurred_at", to),
    db.from("deals").select("id", { count: "exact", head: true })
      .gte("won_at", from).lt("won_at", to),
  ]);

  return [await notify(db, {
    triggerKey: "daily_summary",
    vars: {
      new_leads: leads.count ?? 0,
      calls: calls.count ?? 0,
      visits: visits.count ?? 0,
      won: won.count ?? 0,
    },
    scope: ymd,
    href: "/admin/dashboard",
  }, ctx)];
};

interface AppointmentRow {
  id: string;
  deal_id: string;
  rep_id: string | null;
  scheduled_at: string;
  deals: { city: string | null; site_address: string | null; customers: { name: string | null } | null } | null;
}

/** Appointments still expected to happen. A cancelled visit needs no reminder. */
const LIVE_APPOINTMENTS = ["scheduled", "confirmed", "rescheduled"];

async function appointmentsBetween(
  db: SupabaseClient,
  from: Date,
  to: Date,
): Promise<AppointmentRow[]> {
  const { data } = await db
    .from("appointments")
    .select("id, deal_id, rep_id, scheduled_at, deals(city, site_address, customers(name))")
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", to.toISOString())
    .in("status", LIVE_APPOINTMENTS);
  return (data ?? []) as unknown as AppointmentRow[];
}

/** Tonight's reminder of tomorrow's visits — one per appointment. */
const appointmentTomorrow: Job = async ({ db, ctx, now }) => {
  const { start, end, ymd } = istDayRange(now, 1);
  const out: NotifyResult[] = [];

  for (const appointment of await appointmentsBetween(db, start, end)) {
    if (!appointment.rep_id) continue;
    out.push(await notify(db, {
      triggerKey: "appointment_tomorrow",
      vars: {
        time: istTime(appointment.scheduled_at),
        customer_name: appointment.deals?.customers?.name,
        city: appointment.deals?.city,
      },
      dealId: appointment.deal_id,
      dealOwnerIds: [appointment.rep_id],
      scope: `${appointment.id}:${ymd}`,
      href: `/deals/${appointment.deal_id}`,
    }, ctx));
  }
  return out;
};

/** The two-hour warning, or whatever offset the admin set. */
const appointmentApproaching: Job = async ({ db, ctx, rule, now, tickStart }) => {
  const { from, to } = offsetWindow(tickStart, now, rule.offset_minutes ?? -120);
  const out: NotifyResult[] = [];

  for (const appointment of await appointmentsBetween(db, from, to)) {
    if (!appointment.rep_id) continue;
    out.push(await notify(db, {
      triggerKey: "appointment_approaching",
      vars: {
        customer_name: appointment.deals?.customers?.name,
        address: appointment.deals?.site_address ?? appointment.deals?.city,
      },
      dealId: appointment.deal_id,
      dealOwnerIds: [appointment.rep_id],
      // Keyed on the time as well as the appointment: moving a visit is a new
      // appointment time and deserves a fresh warning.
      scope: `${appointment.id}:${appointment.scheduled_at}`,
      href: `/deals/${appointment.deal_id}`,
    }, ctx));
  }
  return out;
};

/**
 * Only the scheduled triggers live here. lead_assigned, deal_won,
 * visit_awaiting_verification and verification_failed are 'immediate' — they
 * fire from the server action that causes them, not from the clock.
 */
const JOBS: Partial<Record<TriggerKey, Job>> = {
  next_action_overdue: nextActionOverdue,
  uncontacted_leads: uncontactedLeads,
  daily_summary: dailySummary,
  appointment_tomorrow: appointmentTomorrow,
  appointment_approaching: appointmentApproaching,
};
