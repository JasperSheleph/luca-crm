import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import Papa from "papaparse";
import { parseMetaCsv } from "@/lib/importers/meta";

const CSV = "data/Luca Elevators - 25_3_2026 - 08_04_2026 - Video Ad copy.csv";

const ALIASES = { trichy: "tiruchirappalli", madras: "chennai", cbe: "coimbatore", pondy: "puducherry" };

function rows(): Record<string, string>[] {
  const text = readFileSync(CSV, "utf8");
  const out = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return out.data;
}

// data/ is gitignored — it holds names, phones and emails for ~2,800 real
// people. Skip rather than fail when the file is not on this machine.
const hasFile = existsSync(CSV);
const withFile = hasFile ? describe : describe.skip;

describe("parseMetaCsv — synthetic cases", () => {
  const base = {
    id: "l:1", created_time: "2026-04-25T07:02:39+05:30", full_name: "Test",
    email: "t@example.com", phone_number: "p:+919566114558", city: "Chennai",
    campaign_name: "24/4/2026 - V", platform: "fb",
    "are_you_planning_to_install_the_lift?": "yes",
  } as Record<string, string>;

  it("keeps the original Meta timestamp, never the import time", () => {
    const r = parseMetaCsv([base]);
    expect(r.leads[0].createdAt.slice(0, 4)).toBe("2026");
    expect(r.leads[0].createdAt.slice(0, 7)).toBe("2026-04");
  });

  it("skips an unreadable created_time instead of failing the import", () => {
    const r = parseMetaCsv([base, { ...base, id: "l:2", created_time: "~" }]);
    expect(r.leads).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/created_time/);
  });

  it("nulls the Facebook permission-error string so it cannot become a campaign", () => {
    const bad = { ...base, id: "l:3", campaign_name: "You don't have enough permission. Please refer to this help: https://www.facebook.com/business/help/766393076839635" };
    const r = parseMetaCsv([bad]);
    expect(r.leads[0].campaignName).toBeNull();
    expect(r.campaignErrorsCleared).toBe(1);
  });

  it("imports an international number and flags it rather than dropping it", () => {
    const r = parseMetaCsv([{ ...base, id: "l:4", phone_number: "p:+18015511772" }]);
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0].invalidPhone).toBe(true);
    expect(r.skipped).toHaveLength(0);
  });

  it("maps the planning-to-install answer, which genuinely varies", () => {
    expect(parseMetaCsv([base]).leads[0].planningToInstall).toBe(true);
    expect(parseMetaCsv([{ ...base, "are_you_planning_to_install_the_lift?": "no" }]).leads[0].planningToInstall).toBe(false);
    expect(parseMetaCsv([{ ...base, "are_you_planning_to_install_the_lift?": "" }]).leads[0].planningToInstall).toBeNull();
  });

  it("counts a repeated phone within the file without discarding the row", () => {
    const r = parseMetaCsv([base, { ...base, id: "l:5" }]);
    expect(r.leads).toHaveLength(2);
    expect(r.duplicatesInFile).toBe(1);
  });

  it("normalises the city through the alias map", () => {
    const r = parseMetaCsv([{ ...base, city: "Trichy" }], { cityAliases: ALIASES });
    expect(r.leads[0].city).toBe("Trichy");
    expect(r.leads[0].cityNormalized).toBe("tiruchirappalli");
  });

  it("is safe to re-run: a repeated lead id is skipped", () => {
    const r = parseMetaCsv([base, base]);
    expect(r.leads).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/Repeated lead id/);
  });
});

withFile("parseMetaCsv — the real export", () => {
  it("matches the counts the build spec commits to", () => {
    const r = parseMetaCsv(rows(), { cityAliases: ALIASES });

    expect(r.totalRows).toBe(1074);
    expect(r.leads).toHaveLength(1073);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/created_time/);
    expect(r.invalidPhoneCount).toBe(23);
    expect(r.campaignErrorsCleared).toBe(9);
    expect(r.missingCity).toBe(42);
  });

  it("preserves the original April–August timestamps", () => {
    const r = parseMetaCsv(rows());
    // UTC. The export carries two offsets — +05:30 on most rows and -05:00 on
    // a handful — so the last IST day, 27 Aug 19:59 -05:00, is 28 Aug in UTC.
    // timestamptz stores the instant, so this is correct, not a bug.
    expect(r.dateRange!.from.slice(0, 10)).toBe("2026-04-24");
    expect(r.dateRange!.to.slice(0, 10)).toBe("2026-08-28");
  });

  it("spreads leads across four months rather than clustering on one day", () => {
    // The failure this guards against: an importer that writes the import time
    // into created_at. Every lead would then share a single date and every
    // lead-age metric would be silently wrong forever.
    const r = parseMetaCsv(rows());
    const days = new Set(r.leads.map((l) => l.createdAt.slice(0, 10)));
    const months = new Set(r.leads.map((l) => l.createdAt.slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(4);
    expect(days.size).toBeGreaterThan(100);

    const today = new Date().toISOString().slice(0, 10);
    const onToday = r.leads.filter((l) => l.createdAt.slice(0, 10) === today).length;
    expect(onToday).toBeLessThan(r.leads.length / 10);
  });

  it("finds the repeat customers within the file", () => {
    const r = parseMetaCsv(rows());
    expect(r.duplicatesInFile).toBe(11);
  });
});
