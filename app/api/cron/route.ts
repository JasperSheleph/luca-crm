import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { runDueJobs } from "@/lib/notifications/jobs";

/**
 * The clock's way in.
 *
 * pg_cron POSTs here every 15 minutes (see the notifications migration and
 * docs/NOTIFICATIONS.md). Hostinger has no scheduler and a Node timer dies
 * with the process, so the database keeps time and the app only decides what
 * is due.
 *
 * Public in proxy.ts because there is no signed-in user on this path — the
 * shared secret is the whole of the authentication, which is why it is
 * compared in constant time and why a missing CRON_SECRET refuses outright
 * rather than defaulting to open.
 */

// Must not be cached or statically evaluated: it does work and returns a report.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Must match the cron interval, or reminders fall between ticks. */
const WINDOW_MINUTES = 15;

function authorized(request: NextRequest, secret: string): boolean {
  const provided = request.headers.get("x-cron-secret");
  if (!provided) return false;

  // Hashing first gives both sides a fixed 32 bytes, so timingSafeEqual cannot
  // throw on a length mismatch — and the length itself stops leaking.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set on this server" }, { status: 503 });
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }

  // Service role: there is no user here, and notifications_log grants INSERT
  // to nobody else.
  const report = await runDueJobs(createAdminClient(), new Date(), WINDOW_MINUTES);

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
