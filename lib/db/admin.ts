import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES RLS ENTIRELY.
 *
 * Only four things legitimately need it:
 *   - POST /api/leads/inbound  (no signed-in user)
 *   - the CSV importers        (write on behalf of an admin, at volume)
 *   - the pg_cron job route    (no signed-in user)
 *   - the notification engine  (notifications_log grants INSERT to nobody
 *                               else: a user must not be able to forge a
 *                               notification to another user)
 *
 * Never import this into a component or a user-facing action. `server-only`
 * makes a client-side import a build error rather than a data breach.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
