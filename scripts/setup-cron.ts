/**
 * Tells the database how to reach the app, once per deployment.
 *
 * The pg_cron job POSTs to /api/cron with a shared secret. Neither value can
 * live in a migration — one is a secret and the other is not known until the
 * app is deployed somewhere — so they go into `job_config`, a table no
 * authenticated user can read, and this script is what puts them there.
 *
 * Safe to re-run: it overwrites both rows and re-tests the path. Run it again
 * after changing CRON_SECRET or moving the app to a new domain.
 *
 *   npm run cron:setup
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL;
const cronSecret = process.env.CRON_SECRET;

const missing = [
  !url && "NEXT_PUBLIC_SUPABASE_URL",
  !key && "SUPABASE_SERVICE_ROLE_KEY",
  !appUrl && "APP_URL",
  !cronSecret && "CRON_SECRET",
].filter(Boolean);

if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  console.error("APP_URL is where the app is reachable from the internet, e.g. https://crm.lucaelevators.com");
  console.error("CRON_SECRET: generate one with `openssl rand -hex 32`.");
  process.exit(1);
}

const supabase = createClient(url!, key!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { error } = await supabase.from("job_config").upsert(
    [
      { key: "app_url", value: appUrl!, updated_at: new Date().toISOString() },
      { key: "cron_secret", value: cronSecret!, updated_at: new Date().toISOString() },
    ],
    { onConflict: "key" },
  );

  if (error) {
    console.error("Could not write job_config:", error.message);
    console.error("Has the notifications migration been applied? Run `npm run db:push`.");
    process.exit(1);
  }
  console.log(`Stored app_url = ${appUrl}`);
  console.log("Stored cron_secret (not printed).");

  // Same request pg_cron will make, so a failure here is a failure there —
  // found now rather than at 9am tomorrow when nobody gets their digest.
  console.log(`\nTesting POST ${appUrl}/api/cron ...`);
  try {
    const response = await fetch(`${appUrl!.replace(/\/$/, "")}/api/cron`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret! },
      body: "{}",
    });
    const text = await response.text();

    if (!response.ok) {
      console.error(`  ${response.status} — ${text.slice(0, 300)}`);
      console.error("  401 means the app is running with a different CRON_SECRET than this one.");
      process.exit(1);
    }
    console.log(`  ${response.status} — ${text.slice(0, 300)}`);
    console.log("\nDone. pg_cron will call this every 15 minutes.");
  } catch (error) {
    console.error(`  Could not reach the app: ${(error as Error).message}`);
    console.error("  Config is stored; the schedule will start working once the app is reachable at APP_URL.");
    process.exit(1);
  }
}

main();
