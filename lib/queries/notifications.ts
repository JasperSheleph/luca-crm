import { createClient } from "@/lib/db/server";

/**
 * The in-app notification centre's two reads.
 *
 * Both run as the signed-in user, so the `notifications_read_own` policy is
 * what scopes them — there is no user_id filter here on purpose, exactly as
 * there is none on the deals queries. RLS is the guard; a filter in the query
 * would be a second, weaker copy of it.
 */

export interface AppNotification {
  id: number;
  deal_id: string | null;
  template_key: string | null;
  /** The rendered message, stored at send time. */
  body: string;
  href: string | null;
  status: string;
  read_at: string | null;
  sent_at: string;
}

interface Row {
  id: number;
  deal_id: string | null;
  template_key: string | null;
  payload: { body?: string; href?: string | null } | null;
  status: string;
  read_at: string | null;
  sent_at: string;
}

function toNotification(row: Row): AppNotification {
  return {
    id: row.id,
    deal_id: row.deal_id,
    template_key: row.template_key,
    // Rendered once at send time rather than re-rendered here: the template
    // wording can change (Meta re-approval) and an old notification should
    // still say what it said.
    body: row.payload?.body ?? "You have a new notification.",
    href: row.payload?.href ?? null,
    status: row.status,
    read_at: row.read_at,
    sent_at: row.sent_at,
  };
}

/** Drives the badge in the sidebar. Head-only — the count is all it needs. */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications_log")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(limit = 50): Promise<AppNotification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications_log")
    .select("id, deal_id, template_key, payload, status, read_at, sent_at")
    .order("sent_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Row[]).map(toNotification);
}
