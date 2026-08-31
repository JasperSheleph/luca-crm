import { describe, it, expect } from "vitest";
import {
  parseTrackerCsv, parseTrackerDate, parseRemarks, stageFromStatus,
  resolveStage, resolveRep,
} from "@/lib/importers/tracker";
import { shouldAdvance, trackerExternalId } from "@/lib/importers/tracker-commit";

const YEAR = 2026;

/** A tracker row with everything empty, so each test sets only what it means. */
const row = (over: Record<string, string> = {}): Record<string, string> => ({
  Date: "", RP: "", Floors: "", Duration: "", Name: "", Mail: "",
  Contact: "", Place: "", Remarks: "", "site visit done (yes/NO)": "",
  "Quotation Shared (yes/No)": "", Status: "", "Status Remarks": "", ...over,
});

describe("parseTrackerDate", () => {
  it('reads "2 May" against the supplied year', () => {
    expect(parseTrackerDate("2 May", YEAR)).toBe("2026-05-02T00:00:00.000Z");
  });

  it('reads the "06- Jul" straggler', () => {
    expect(parseTrackerDate("06- Jul", YEAR)).toBe("2026-07-06T00:00:00.000Z");
  });

  it("reads 2026/5/14 and 2026-05-14", () => {
    expect(parseTrackerDate("2026/5/14", YEAR)).toBe("2026-05-14T00:00:00.000Z");
    expect(parseTrackerDate("2026-05-14", YEAR)).toBe("2026-05-14T00:00:00.000Z");
  });

  it("reads dd/mm/yyyy day-first, not month-first", () => {
    // This is an Indian spreadsheet. Reading 05/01 as 5 January would be
    // silently wrong on every row where both halves are 12 or under.
    expect(parseTrackerDate("01/05/2026", YEAR)).toBe("2026-05-01T00:00:00.000Z");
  });

  it("reads dd/mm/yy", () => {
    expect(parseTrackerDate("14/05/26", YEAR)).toBe("2026-05-14T00:00:00.000Z");
  });

  it("returns null for a bare weekday rather than guessing", () => {
    expect(parseTrackerDate("Mon", YEAR)).toBeNull();
  });

  it("returns null for empty and for nonsense", () => {
    expect(parseTrackerDate("", YEAR)).toBeNull();
    expect(parseTrackerDate("   ", YEAR)).toBeNull();
    expect(parseTrackerDate("rnr", YEAR)).toBeNull();
  });

  it("rejects an impossible day instead of rolling into next month", () => {
    expect(parseTrackerDate("31 Feb", YEAR)).toBeNull();
  });

  it("uses the year given, not the year the import happens to run in", () => {
    expect(parseTrackerDate("2 May", 2025)).toBe("2025-05-02T00:00:00.000Z");
  });
});

describe("parseRemarks", () => {
  it("splits dated lines into separate calls", () => {
    const out = parseRemarks("12-05 rnr\n14-05 interested, wants a visit", YEAR);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ occurredAt: "2026-05-12T00:00:00.000Z", notes: "rnr" });
    expect(out[1].notes).toBe("interested, wants a visit");
  });

  it("trusts the dates, not the order they were typed", () => {
    // Some rows are newest-first. Line order is not chronology.
    const out = parseRemarks("20-05 quoted\n12-05 first call", YEAR);
    expect(out.map((a) => a.notes)).toEqual(["first call", "quoted"]);
  });

  it("keeps an undated chunk rather than dropping it", () => {
    const out = parseRemarks("customer asked for a brochure", YEAR);
    expect(out).toEqual([{ occurredAt: null, notes: "customer asked for a brochure" }]);
  });

  it("puts undated chunks after the dated ones", () => {
    const out = parseRemarks("no incoming\n12-05 rnr", YEAR);
    expect(out[0].notes).toBe("rnr");
    expect(out[1].notes).toBe("no incoming");
  });

  it("records a bare date as a call with no detail", () => {
    expect(parseRemarks("12-05", YEAR)[0]).toMatchObject({
      occurredAt: "2026-05-12T00:00:00.000Z", notes: "Called",
    });
  });

  it("returns nothing for an empty column", () => {
    expect(parseRemarks("", YEAR)).toEqual([]);
    expect(parseRemarks(null, YEAR)).toEqual([]);
  });
});

describe("stageFromStatus", () => {
  it("maps the four recognised families", () => {
    expect(stageFromStatus("won")).toEqual({ stage: "won", recognised: true });
    expect(stageFromStatus("dropped")).toEqual({ stage: "not_pursued", recognised: true });
    expect(stageFromStatus("no")).toEqual({ stage: "not_pursued", recognised: true });
    expect(stageFromStatus("negotiation")).toEqual({ stage: "negotiation", recognised: true });
    expect(stageFromStatus("demo visit pending")).toEqual({
      stage: "appointment_scheduled", recognised: true,
    });
  });

  it("is case-insensitive", () => {
    expect(stageFromStatus("WON").stage).toBe("won");
  });

  it("falls back to Qualifying for a free-text sentence", () => {
    // ~37 of 137 statuses are sentences. Inventing a stage from prose would
    // put fiction in the funnel.
    const s = "site visit - fixed | can go anytime, have to inform the client before the visit";
    expect(stageFromStatus(s)).toEqual({ stage: "qualifying", recognised: false });
  });
});

describe("resolveStage", () => {
  it("pushes forward on the milestone flags", () => {
    expect(resolveStage("qualifying", true, false)).toBe("site_visit_done");
    expect(resolveStage("qualifying", false, true)).toBe("quote_sent");
    expect(resolveStage("qualifying", true, true)).toBe("quote_sent");
  });

  it("never pulls a deal backwards", () => {
    expect(resolveStage("negotiation", true, true)).toBe("negotiation");
  });

  it("lets a terminal status win over a milestone", () => {
    // A dropped deal that was quoted is still dropped. Showing it as Quote Sent
    // would put a dead deal in the live pipeline.
    expect(resolveStage("not_pursued", true, true)).toBe("not_pursued");
    expect(resolveStage("won", false, false)).toBe("won");
  });

  it("leaves a plain qualifying row alone", () => {
    expect(resolveStage("qualifying", false, false)).toBe("qualifying");
  });
});

describe("resolveRep", () => {
  const map = { JN: "user-jn", NV: "user-nv", Jacil: "user-jacil" };

  it("resolves a single initial", () => {
    expect(resolveRep("JN", map)).toBe("user-jn");
  });

  it("takes the first of a combined value", () => {
    expect(resolveRep("NV/JN", map)).toBe("user-nv");
    expect(resolveRep("JACIL/JN", map)).toBe("user-jacil");
  });

  it("matches regardless of case", () => {
    expect(resolveRep("jn", map)).toBe("user-jn");
  });

  it("returns null for an initial nobody has mapped yet", () => {
    expect(resolveRep("JF", map)).toBeNull();
    expect(resolveRep(null, map)).toBeNull();
  });
});

describe("parseTrackerCsv", () => {
  it("keys one lead per distinct phone", () => {
    const r = parseTrackerCsv([
      row({ Contact: "p:+919566114558", Name: "A" }),
      row({ Contact: "9876543210", Name: "B" }),
    ], { defaultYear: YEAR });
    expect(r.leads).toHaveLength(2);
    expect(r.duplicatesInFile).toBe(0);
  });

  it("collapses a repeated phone instead of creating a second deal", () => {
    const r = parseTrackerCsv([
      row({ Contact: "p:+919566114558", Name: "A", Remarks: "12-05 rnr", Date: "2 May" }),
      row({ Contact: "9566114558", Remarks: "20-05 called back", Date: "20 May" }),
    ], { defaultYear: YEAR });

    expect(r.leads).toHaveLength(1);
    expect(r.duplicatesInFile).toBe(1);
    const [lead] = r.leads;
    expect(lead.rowNumbers).toEqual([2, 3]);
    expect(lead.activities).toHaveLength(2);
    // The earliest date is the enquiry; the later row is a follow-up.
    expect(lead.date).toBe("2026-05-02T00:00:00.000Z");
    expect(lead.name).toBe("A");
  });

  it("lets a later row push the stage forward but never blank a field", () => {
    const r = parseTrackerCsv([
      row({ Contact: "9566114558", Name: "A" }),
      row({ Contact: "9566114558", Name: "", "Quotation Shared (yes/No)": "yes" }),
    ], { defaultYear: YEAR });
    expect(r.leads[0].name).toBe("A");
    expect(r.leads[0].stage).toBe("quote_sent");
  });

  it("imports a row with no phone against a flagged placeholder", () => {
    // Four rows have no usable phone. They still hold remarks and a name.
    const r = parseTrackerCsv([row({ Name: "No number", Remarks: "walked in" })], { defaultYear: YEAR });
    expect(r.noPhone).toBe(1);
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0].placeholderPhone).toBe(true);
    expect(r.leads[0].name).toBe("No number");
  });

  it("gives two phoneless rows separate placeholders rather than merging them", () => {
    const r = parseTrackerCsv([row({ Name: "A" }), row({ Name: "B" })], { defaultYear: YEAR });
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0].phoneKey).not.toBe(r.leads[1].phoneKey);
  });

  it("keeps only G+N floors and puts the junk in the note", () => {
    const r = parseTrackerCsv([
      row({ Contact: "9566114558", Floors: "G+2" }),
      row({ Contact: "9876543210", Floors: "repeated lead" }),
    ], { defaultYear: YEAR });
    expect(r.leads[0].floors).toBe(2);
    expect(r.leads[1].floors).toBeNull();
    expect(r.leads[1].importedNote).toContain("repeated lead");
  });

  it("loses nothing: remarks, status remarks, rep and stray columns all reach the note", () => {
    const r = parseTrackerCsv([
      row({
        Contact: "9566114558", RP: "NV/JN", Remarks: "12-05 rnr",
        "Status Remarks": "customer travelling", "": "stray trailing text",
      }),
    ], { defaultYear: YEAR });
    const note = r.leads[0].importedNote;
    expect(note).toContain("12-05 rnr");
    expect(note).toContain("customer travelling");
    expect(note).toContain("NV/JN");
    expect(note).toContain("stray trailing text");
  });

  it("counts unrecognised statuses so they can be reviewed", () => {
    const r = parseTrackerCsv([
      row({ Contact: "9566114558", Status: "site visit - fixed | call first" }),
      row({ Contact: "9876543210", Status: "won" }),
    ], { defaultYear: YEAR });
    expect(r.unrecognisedStatuses).toEqual(["site visit - fixed | call first"]);
    expect(r.leads[0].stage).toBe("qualifying");
    expect(r.leads[0].statusRaw).toBe("site visit - fixed | call first");
    expect(r.leads[1].stage).toBe("won");
  });

  it("counts an unreadable date without dropping the row", () => {
    const r = parseTrackerCsv([row({ Contact: "9566114558", Date: "Mon" })], { defaultYear: YEAR });
    expect(r.unreadableDates).toBe(1);
    expect(r.leads).toHaveLength(1);
    expect(r.leads[0].date).toBeNull();
  });

  it("flags an international number without dropping it", () => {
    const r = parseTrackerCsv([row({ Contact: "+18015511772" })], { defaultYear: YEAR });
    expect(r.invalidPhone).toBe(1);
    expect(r.leads).toHaveLength(1);
  });
});

describe("shouldAdvance", () => {
  it("moves a stuck Qualifying deal forward", () => {
    // All 1,073 Meta deals sit in qualifying because that is where the import
    // left them, not because that is where they are. The tracker knows better.
    expect(shouldAdvance("qualifying", "site_visit_done")).toBe(true);
    expect(shouldAdvance("qualifying", "won")).toBe(true);
  });

  it("never pulls a deal backwards", () => {
    expect(shouldAdvance("quote_sent", "appointment_scheduled")).toBe(false);
  });

  it("never reopens a deal already closed in the CRM", () => {
    // A person moved it. A months-old spreadsheet does not get to undo that.
    expect(shouldAdvance("won", "negotiation")).toBe(false);
    expect(shouldAdvance("lost", "won")).toBe(false);
    expect(shouldAdvance("not_pursued", "quote_sent")).toBe(false);
  });

  it("leaves a deliberately parked deal parked", () => {
    // Nurture is someone saying "call me in eight months". A stale sheet must
    // not wake it.
    expect(shouldAdvance("nurture", "site_visit_done")).toBe(false);
  });

  it("does nothing when the two already agree", () => {
    expect(shouldAdvance("quote_sent", "quote_sent")).toBe(false);
  });
});

describe("trackerExternalId", () => {
  it("namespaces so a tracker row cannot collide with a Meta lead id", () => {
    // deals.external_id carries a global unique index shared with Importer A.
    const [lead] = parseTrackerCsv([row({ Contact: "9566114558" })], { defaultYear: YEAR }).leads;
    expect(trackerExternalId(lead)).toBe(`tracker:${lead.phoneKey}`);
    expect(trackerExternalId(lead).startsWith("tracker:")).toBe(true);
  });
});
