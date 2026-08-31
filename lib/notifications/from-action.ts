import "server-only";

import { createAdminClient } from "@/lib/db/admin";
import { notify, type NotifyInput } from "./dispatch";

/**
 * Firing a notification from a server action.
 *
 * The engine itself (dispatch.ts) takes a client as an argument and carries no
 * `server-only`, because lib/ingest.ts shares it with scripts that run under
 * plain Node. This module is the server-action side of it, where reaching for
 * the service-role client is safe — and it is the only place that pairing
 * lives, so no action has to think about which client notifications need.
 *
 * notifications_log grants INSERT to nobody but service_role: a user must not
 * be able to forge a notification to another user.
 */

type Db = ReturnType<typeof createAdminClient>;

/**
 * Tell someone, without ever putting the work at risk.
 *
 * notify() already swallows its own failures; this also catches
 * createAdminClient() throwing on a server with no service-role key. A visit
 * that was completed must not report failure because a message did not go out
 * — the work is the record, the notification is a courtesy.
 */
export async function fireNotification(input: NotifyInput): Promise<void> {
  try {
    await notify(createAdminClient(), input);
  } catch {
    // Deliberately silent. Whatever caused this is already saved.
  }
}

/**
 * A type alias, not an interface, on purpose: only an alias gets the implicit
 * index signature that lets this be passed straight to notify()'s `vars`.
 */
export type DealNotificationVars = {
  customer_name: string;
  city: string | null;
  source: string | null;
  rep_name: string | null;
};

/**
 * The names the templates need, which a deal row alone does not carry.
 *
 * One extra read, on the notifying path only — never on the hot path of
 * logging a call. Uses the caller's own client so it stays inside whatever
 * the acting user is allowed to see.
 */
export async function dealNotificationVars(
  supabase: { from: Db["from"] },
  deal: Record<string, unknown>,
): Promise<DealNotificationVars> {
  const [customer, source, rep] = await Promise.all([
    supabase.from("customers").select("name").eq("id", String(deal.customer_id)).maybeSingle(),
    deal.source_id
      ? supabase.from("list_values").select("label").eq("id", Number(deal.source_id)).maybeSingle()
      : Promise.resolve({ data: null }),
    deal.rep_owner_id
      ? supabase.from("users").select("name").eq("id", String(deal.rep_owner_id)).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    customer_name: (customer.data as { name: string | null } | null)?.name ?? "Unnamed lead",
    city: (deal.city as string | null) ?? null,
    source: (source.data as { label: string } | null)?.label ?? null,
    rep_name: (rep.data as { name: string } | null)?.name ?? null,
  };
}
