/**
 * Import a Meta Lead Ads CSV from the command line.
 *
 *   npm run import:meta -- "data/Luca Elevators - ... .csv"
 *
 * Same parser and same commit path as Admin -> Import; this exists because the
 * initial bulk load of a thousand-plus leads is more reliable from a terminal
 * than a browser upload, and because it makes the counts easy to check.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { parseMetaCsv } from "../lib/importers/meta";
import { commitMetaLeads } from "../lib/importers/meta-commit";

config({ path: ".env.local" });

const file = process.argv[2];
if (!file) { console.error("Usage: npm run import:meta -- <file.csv>"); process.exit(1); }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase env in .env.local"); process.exit(1); }

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: setting } = await db.from("app_settings").select("value").eq("key", "city_aliases").maybeSingle();
  const cityAliases = (setting?.value as Record<string, string>) ?? {};

  const rows = Papa.parse<Record<string, string>>(readFileSync(file, "utf8"), {
    header: true, skipEmptyLines: true,
  }).data;

  const parsed = parseMetaCsv(rows, { cityAliases });
  console.log(`\n  Parsed ${parsed.totalRows} rows`);
  console.log(`    ${parsed.leads.length} importable, ${parsed.skipped.length} skipped`);
  for (const s of parsed.skipped) console.log(`      row ${s.rowNumber}: ${s.reason}`);
  console.log(`    ${parsed.invalidPhoneCount} invalid phone, ${parsed.duplicatesInFile} repeat phone in file`);
  console.log(`    ${parsed.campaignErrorsCleared} bad campaign names cleared, ${parsed.missingCity} without a city`);
  if (parsed.dateRange) console.log(`    dated ${parsed.dateRange.from.slice(0, 10)} to ${parsed.dateRange.to.slice(0, 10)}`);

  console.log("\n  Importing…");
  const r = await commitMetaLeads(db, parsed.leads);
  console.log(`    imported          ${r.imported}`);
  console.log(`    new customers     ${r.newCustomers}`);
  console.log(`    repeat enquiries  ${r.repeatCustomers}`);
  console.log(`    invalid phone     ${r.invalidPhone}`);
  console.log(`    already present   ${r.alreadyImported}`);
  if (r.errors.length) { console.log("    errors:"); for (const e of r.errors.slice(0, 10)) console.log(`      ${e}`); }
  console.log();
}

main().catch((e) => { console.error(e); process.exit(1); });
