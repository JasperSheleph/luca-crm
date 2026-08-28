/**
 * Re-apply city normalisation to every existing deal.
 *
 *   npm run cities:renormalize          # report only
 *   npm run cities:renormalize -- --fix # write the changes
 *
 * Run this after adding city aliases or service-area towns in Settings.
 * Normalisation happens at import time, so leads already in the system keep
 * whatever the alias map said on the day they arrived until this is run.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { normalizeCity, isOutstation } from "../lib/domain/city";

config({ path: ".env.local" });

const fix = process.argv.includes("--fix");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing Supabase env in .env.local"); process.exit(1); }

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const { data: settings } = await db.from("app_settings").select("key, value")
    .in("key", ["city_aliases", "service_area_cities"]);
  const s = Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]));
  const aliases = (s.city_aliases ?? {}) as Record<string, string>;
  const area = (s.service_area_cities ?? []) as string[];

  const deals: { id: string; city: string | null; city_normalized: string | null; is_outstation: boolean }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("deals")
      .select("id, city, city_normalized, is_outstation")
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    deals.push(...data);
    if (data.length < 1000) break;
  }

  const changes: { id: string; city_normalized: string | null; is_outstation: boolean }[] = [];
  let recognised = 0, unrecognised = 0, noCity = 0;

  for (const d of deals) {
    const normalized = normalizeCity(d.city, aliases);
    const outstation = isOutstation(normalized, area);

    if (!normalized) noCity++;
    else if (area.includes(normalized)) recognised++;
    else unrecognised++;

    if (normalized !== d.city_normalized || outstation !== d.is_outstation) {
      changes.push({ id: d.id, city_normalized: normalized, is_outstation: outstation });
    }
  }

  console.log(`\n  ${deals.length} deals`);
  console.log(`    recognised town   ${recognised}  (${pct(recognised, deals.length)})`);
  console.log(`    not recognised    ${unrecognised}  (${pct(unrecognised, deals.length)})`);
  console.log(`    no city given     ${noCity}  (${pct(noCity, deals.length)})`);
  console.log(`\n  ${changes.length} deals would change.`);

  if (!fix) {
    console.log("  Re-run with --fix to apply.\n");
    return;
  }

  for (let i = 0; i < changes.length; i += 200) {
    const batch = changes.slice(i, i + 200);
    await Promise.all(batch.map((c) =>
      db.from("deals")
        .update({ city_normalized: c.city_normalized, is_outstation: c.is_outstation })
        .eq("id", c.id),
    ));
  }
  console.log(`  Updated ${changes.length} deals.\n`);
}

const pct = (n: number, total: number) => `${Math.round((100 * n) / total)}%`;

main().catch((e) => { console.error(e); process.exit(1); });
