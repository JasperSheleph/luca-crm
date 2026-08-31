/**
 * Import the legacy sales tracker from the command line.
 *
 *   npm run import:tracker -- "data/tracker.csv"           # dry run, writes nothing
 *   npm run import:tracker -- "data/tracker.csv" --commit  # actually writes
 *
 * Same parser and same planner as Admin → Import. This exists because ~1,700
 * rows producing thousands of activities is more reliable from a terminal than
 * a browser upload, and because the dry-run output is easier to read and keep.
 *
 * ⚠ Run Importer A first. The tracker matches against deals Meta has already
 * created; running it first would create ~974 phantom deals.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { parseTrackerCsv } from "../lib/importers/tracker";
import { planTrackerImport, commitTrackerImport } from "../lib/importers/tracker-commit";

config({ path: ".env.local" });

const file = process.argv[2];
const doCommit = process.argv.includes("--commit");
const yearArg = process.argv.find((a) => a.startsWith("--year="));
// 1,537 rows are dates like "2 May" with no year. Defaulting to the current
// year would silently mis-date the whole import if this is re-run in January.
const defaultYear = yearArg ? Number(yearArg.split("=")[1]) : 2026;

if (!file) {
  console.error("Usage: npm run import:tracker -- <file.csv> [--year=2026] [--commit]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase env in .env.local"); process.exit(1); }

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: settings } = await db.from("app_settings").select("key, value")
    .in("key", ["city_aliases", "rep_initials_map"]);
  const by = new Map((settings ?? []).map((r) => [r.key, r.value]));
  const cityAliases = (by.get("city_aliases") as Record<string, string>) ?? {};
  const repMap = (by.get("rep_initials_map") as Record<string, string>) ?? {};

  const rows = Papa.parse<Record<string, string>>(readFileSync(file, "utf8"), {
    header: true, skipEmptyLines: true,
  }).data;

  const { leads, ...parse } = parseTrackerCsv(rows, { cityAliases, defaultYear });

  console.log(`\n  Parsed ${parse.totalRows} rows into ${leads.length} distinct customers`);
  console.log(`    ${parse.duplicatesInFile} repeated phones collapsed`);
  console.log(`    ${parse.noPhone} with no usable phone (placeholder, flagged)`);
  console.log(`    ${parse.invalidPhone} flagged invalid phone`);
  console.log(`    ${parse.unreadableDates} unreadable dates (imported with no date)`);
  console.log(`    ${parse.parsedActivities} calls parsed out of Remarks`);
  console.log(`    ${parse.withRep} carry a rep in the RP column`);
  if (parse.unrecognisedStatuses.length) {
    console.log(`    ${parse.unrecognisedStatuses.length} unrecognised statuses -> Qualifying, text kept`);
  }

  const plan = await planTrackerImport(db, leads, repMap);
  console.log(`\n  Plan`);
  console.log(`    ${plan.matched} attach to an existing deal (no new deal)`);
  console.log(`    ${plan.created} new deals Meta never saw`);
  console.log(`    ${plan.stageChanges} stage changes`);
  console.log(`    ${plan.activitiesToWrite} activities to write`);
  if (plan.alreadyImported) console.log(`    ${plan.alreadyImported} already imported, will be skipped`);
  console.log(`    stages: ${Object.entries(plan.stageBreakdown).map(([s, n]) => `${s}=${n}`).join(" ")}`);
  if (plan.repsUnresolved.length) {
    console.log(`\n  ⚠ Not in rep_initials_map: ${plan.repsUnresolved.join(", ")}`);
    console.log(`    Their deals import with nobody attached. This is the only`);
    console.log(`    historical rep data there is — fill the map in Settings first.`);
  }

  if (!doCommit) {
    console.log(`\n  Dry run. Nothing written. Add --commit to write.\n`);
    return;
  }

  console.log(`\n  Writing…`);
  const result = await commitTrackerImport(db, leads, repMap);
  console.log(`    ${result.dealsCreated} deals created`);
  console.log(`    ${result.customersCreated} customers created`);
  console.log(`    ${result.stagesAdvanced} stages advanced`);
  console.log(`    ${result.activitiesWritten} activities written`);
  for (const e of result.errors) console.log(`    ! ${e}`);
  console.log("");
}

main().catch((e) => { console.error(e); process.exit(1); });
