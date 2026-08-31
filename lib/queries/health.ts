import { createClient } from "@/lib/db/server";

/**
 * The health page, in plain numbers.
 *
 * Written to be read by someone who does not code: every check returns a state
 * and a sentence, never a raw error string or a status code.
 */

/** Above this share of the plan's allowance, say something. */
export const WARN_AT = 0.8;
export const SERIOUS_AT = 0.95;

/** A lead older than this without a new import is worth mentioning, not alarming. */
const IMPORT_STALE_DAYS = 7;

export type CheckState = "good" | "warning" | "serious" | "neutral";

export interface Check {
  key: string;
  label: string;
  /** The number as a person would say it. */
  value: string;
  state: CheckState;
  /** Why it is that state, or what to do. Always present when not good. */
  detail?: string;
  /** 0–1, only where a share of an allowance makes sense. */
  fraction?: number;
}

function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

function ago(iso: string, now: Date): string {
  const hours = (now.getTime() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return "less than an hour ago";
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} ago`;
  const d = Math.round(hours / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function usage(used: number, limit: number, label: string, key: string): Check {
  const fraction = limit > 0 ? used / limit : 0;
  const state: CheckState =
    fraction >= SERIOUS_AT ? "serious" : fraction >= WARN_AT ? "warning" : "good";
  return {
    key, label, fraction, state,
    value: `${Math.round(fraction * 100)}% used`,
    detail:
      state === "good"
        ? `${bytes(used)} of ${bytes(limit)}`
        : `${bytes(used)} of ${bytes(limit)}. Upgrade the Supabase plan, then change the allowance in Settings.`,
  };
}

export async function getHealth(): Promise<Check[]> {
  const supabase = await createClient();
  const now = new Date();

  const [latestLead, settingsRes, sizeRes, whatsappRes] = await Promise.all([
    supabase.from("deals").select("created_at").order("created_at", { ascending: false })
      .limit(1).maybeSingle(),
    supabase.from("app_settings").select("key, value")
      .in("key", ["database_limit_bytes", "storage_limit_bytes"]),
    // security definer, and it refuses anyone who is not an admin.
    supabase.rpc("system_health"),
    supabase.from("app_settings").select("value").eq("key", "whatsapp_enabled").maybeSingle(),
  ]);

  const limits = new Map((settingsRes.data ?? []).map((r) => [r.key, Number(r.value)]));
  const checks: Check[] = [];

  // ---- last lead
  if (latestLead.data?.created_at) {
    const days = (now.getTime() - new Date(latestLead.data.created_at).getTime()) / 86_400_000;
    checks.push({
      key: "last_lead",
      label: "Newest lead in the system",
      value: ago(latestLead.data.created_at, now),
      state: days > IMPORT_STALE_DAYS ? "warning" : "good",
      detail: days > IMPORT_STALE_DAYS
        ? "Nothing new for over a week. Has the Meta export been imported lately?"
        : undefined,
    });
  } else {
    checks.push({ key: "last_lead", label: "Newest lead in the system", value: "No leads yet", state: "warning" });
  }

  // ---- whatsapp
  const whatsappOn = whatsappRes.data?.value === true;
  checks.push({
    key: "whatsapp",
    label: "WhatsApp messages",
    value: whatsappOn ? "On" : "Off",
    // Off is the intended state for now, so it is not a warning.
    state: "neutral",
    detail: whatsappOn
      ? undefined
      : "Off by design. Everything still appears in the notification centre.",
  });

  // ---- storage and database
  const size = sizeRes.data as
    { database_bytes: number; storage_bytes: number; failed_jobs_24h: number } | null;
  if (sizeRes.error || !size) {
    checks.push({
      key: "sizes",
      label: "Storage and database",
      value: "Could not read",
      state: "warning",
      detail: "Only an admin can see these, and the database has to be reachable.",
    });
  } else {
    // Scheduled jobs only start firing in step 8; until then this is
    // truthfully zero rather than misleadingly reassuring.
    checks.push({
      key: "failed_jobs",
      label: "Failed jobs, last 24 hours",
      value: String(size.failed_jobs_24h),
      state: size.failed_jobs_24h > 0 ? "warning" : "good",
      detail: size.failed_jobs_24h > 0
        ? "Something scheduled did not send. Worth telling whoever maintains this."
        : undefined,
    });

    checks.push(usage(size.storage_bytes, limits.get("storage_limit_bytes") ?? 0, "File storage", "storage"));
    checks.push(usage(size.database_bytes, limits.get("database_limit_bytes") ?? 0, "Database", "database"));
  }

  return checks;
}
