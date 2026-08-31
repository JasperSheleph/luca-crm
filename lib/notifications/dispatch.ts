/**
 * The one path by which anybody is told anything.
 *
 * Every notification in the system — event-driven or scheduled, in-app or
 * WhatsApp — goes through notify(). There is no second path, for the same
 * reason there is no second path through stages.ts: the moment two exist, one
 * of them stops honouring the admin's on/off switch and nobody finds out.
 *
 * No `server-only` here, deliberately, and for the same reason as lib/ingest.ts
 * — this module holds no secret, it takes a SupabaseClient as an argument. The
 * caller supplies the service-role client, because notifications_log grants
 * INSERT to nobody but service_role: a user must not be able to forge a
 * notification to another user.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dedupeKey, renderTemplate, resolveRecipients,
  type NotificationRule, type TriggerKey,
} from "@/lib/domain/notifications";
import { sendWhatsApp, whatsAppConfigured } from "./whatsapp";

interface TemplateRow {
  body_preview: string;
  meta_template_name: string | null;
  variables: string[] | null;
  is_approved: boolean;
}

interface RuleRow extends NotificationRule {
  id: number;
  notification_templates: TemplateRow | TemplateRow[] | null;
}

interface RecipientRow {
  id: string;
  name: string;
  phone: string | null;
  role: string;
}

/**
 * Everything the engine reads that does not change between notifications.
 * Loaded once per job run rather than once per message — the overdue digest
 * sends to every owner in the company and would otherwise re-read the rules
 * table for each of them. Same shape and reasoning as loadIngestContext().
 */
export interface EngineContext {
  whatsappEnabled: boolean;
  rules: Map<string, RuleRow>;
  usersByRole: Record<string, string[]>;
  users: Map<string, RecipientRow>;
}

export async function loadEngineContext(db: SupabaseClient): Promise<EngineContext> {
  const [{ data: setting }, { data: rules }, { data: users }] = await Promise.all([
    db.from("app_settings").select("value").eq("key", "whatsapp_enabled").maybeSingle(),
    db.from("notification_rules").select(
      "*, notification_templates(body_preview, meta_template_name, variables, is_approved)",
    ),
    db.from("users").select("id, name, phone, role").eq("is_active", true),
  ]);

  const usersByRole: Record<string, string[]> = {};
  const byId = new Map<string, RecipientRow>();
  for (const u of (users ?? []) as RecipientRow[]) {
    byId.set(u.id, u);
    (usersByRole[u.role] ??= []).push(u.id);
  }

  return {
    whatsappEnabled: setting?.value === true,
    rules: new Map(((rules ?? []) as RuleRow[]).map((r) => [r.trigger_key, r])),
    usersByRole,
    users: byId,
  };
}

export interface NotifyInput {
  triggerKey: TriggerKey;
  /** Values for the template's `{{placeholders}}`. */
  vars?: Record<string, string | number | null | undefined>;
  dealId?: string | null;
  /** Recipients, when the rule addresses "whoever owns the deal". */
  dealOwnerIds?: string[];
  /**
   * What makes this notification unique, for the idempotency key: the IST date
   * for a daily digest, the appointment id for a per-appointment reminder.
   * Omit for a genuine one-off event — assigning the same lead twice is two
   * events and should read as two.
   */
  scope?: string | null;
  /** Where the notification takes you in the app. */
  href?: string | null;
}

export interface NotifyResult {
  trigger: string;
  created: number;
  /** Why nothing was sent, when nothing was. Not an error — usually a choice. */
  skipped: string | null;
}

/**
 * Writes one notification to its recipients and, if WhatsApp is on, sends it.
 *
 * Never throws. A notification that fails must not roll back the assignment or
 * the stage change that caused it — the work is what matters, the message is a
 * courtesy. Anything that goes wrong lands in notifications_log.error or comes
 * back as `skipped`.
 */
export async function notify(
  db: SupabaseClient,
  input: NotifyInput,
  context?: EngineContext,
): Promise<NotifyResult> {
  const result = (created: number, skipped: string | null = null): NotifyResult => ({
    trigger: input.triggerKey, created, skipped,
  });

  try {
    const ctx = context ?? (await loadEngineContext(db));
    const rule = ctx.rules.get(input.triggerKey);

    if (!rule) return result(0, "no rule configured");
    // The admin's switch in Settings. Checked here and nowhere else.
    if (!rule.is_enabled) return result(0, "rule disabled");

    const template = Array.isArray(rule.notification_templates)
      ? rule.notification_templates[0]
      : rule.notification_templates;
    if (!template) return result(0, "no template");

    const recipientIds = resolveRecipients(rule, {
      dealOwnerIds: input.dealOwnerIds,
      usersByRole: ctx.usersByRole,
    // A deal with no owner, or a role nobody holds, resolves to nobody. That is
    // a real situation (leads arrive before anyone is assigned), not an error.
    }).filter((id, i, all) => id && all.indexOf(id) === i);

    if (recipientIds.length === 0) return result(0, "no recipients");

    const vars = input.vars ?? {};
    const body = renderTemplate(template.body_preview, vars);

    const rows = recipientIds.map((userId) => ({
      deal_id: input.dealId ?? null,
      user_id: userId,
      channel: "in_app",
      template_key: rule.template_key,
      payload: { body, href: input.href ?? null, vars },
      status: "in_app",
      dedupe_key: input.scope ? dedupeKey(input.triggerKey, userId, input.scope) : null,
    }));

    // ignoreDuplicates turns a repeated cron tick into a no-op, and RETURNING
    // then gives back only the rows that were genuinely new — which is exactly
    // the set that should get a WhatsApp message.
    const { data: inserted, error } = await db
      .from("notifications_log")
      .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id, user_id");

    if (error) return result(0, error.message);
    if (!inserted?.length) return result(0, "already sent");

    await deliverWhatsApp(db, ctx, template, vars, inserted as { id: number; user_id: string }[]);

    return result(inserted.length);
  } catch (error) {
    return result(0, (error as Error).message);
  }
}

/**
 * The external channel, attempted only for rows that were actually created.
 *
 * Three independent switches have to be on: the admin's setting, the env vars,
 * and Meta's approval of this specific template. The setting is the one LUCA
 * controls; the other two are facts about the outside world. Any of them being
 * off leaves the row exactly as it is — status 'in_app', which is honest.
 */
async function deliverWhatsApp(
  db: SupabaseClient,
  ctx: EngineContext,
  template: TemplateRow,
  vars: Record<string, string | number | null | undefined>,
  inserted: { id: number; user_id: string }[],
): Promise<void> {
  if (!ctx.whatsappEnabled || !whatsAppConfigured()) return;
  if (!template.is_approved || !template.meta_template_name) return;

  // Meta positions body parameters by order, not by name, so the template's
  // own `variables` array is the only correct source for that order.
  const params = (template.variables ?? []).map((name) => {
    const value = vars[name];
    return value === null || value === undefined ? "" : String(value);
  });

  for (const row of inserted) {
    const user = ctx.users.get(row.user_id);
    const outcome = await sendWhatsApp(user?.phone ?? "", template.meta_template_name, params);
    if (outcome.status === "skipped") continue;

    await db
      .from("notifications_log")
      .update({ channel: "whatsapp", status: outcome.status, error: outcome.error })
      .eq("id", row.id);
  }
}
