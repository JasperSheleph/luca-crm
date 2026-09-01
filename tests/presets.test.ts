import { describe, it, expect } from "vitest";
import {
  WORK_PRESETS, TO_CALL, presetQuery, presetHref, activePreset,
} from "@/lib/domain/presets";

/** Reads a preset's params the way useSearchParams would. */
const urlOf = (params: Record<string, string>) => (k: string) => params[k];

describe("work presets", () => {
  it("covers the five buckets the queue was specified as", () => {
    expect(WORK_PRESETS).toHaveLength(5);
    expect(WORK_PRESETS.map((p) => p.key)).toEqual([
      "to-call", "awaiting-verification", "overdue", "waking", "quote-sla",
    ]);
  });

  it("sorts every preset oldest-first", () => {
    // The whole point. A newest-first queue buries the three-week-old lead,
    // which is the one costing money.
    for (const p of WORK_PRESETS) expect(p.params.sort).toBe("oldest");
  });

  it("starts with To Call, which is where the CRM Manager lands", () => {
    expect(TO_CALL.key).toBe("to-call");
    expect(TO_CALL.params.uncontacted).toBe("1");
  });

  it("builds a query string and an href", () => {
    expect(presetQuery(TO_CALL)).toBe("uncontacted=1&sort=oldest");
    expect(presetHref(TO_CALL)).toBe("/deals?uncontacted=1&sort=oldest");
  });

  it("marks only the buckets that cannot have rows yet", () => {
    const pending = WORK_PRESETS.filter((p) => p.emptyUntil).map((p) => p.key);
    expect(pending).toEqual(["awaiting-verification", "quote-sla"]);
  });
});

describe("activePreset", () => {
  it("finds the preset a URL is showing", () => {
    expect(activePreset(urlOf({ uncontacted: "1", sort: "oldest" }))?.key).toBe("to-call");
    expect(activePreset(urlOf({ verification: "pending", sort: "oldest" }))?.key)
      .toBe("awaiting-verification");
  });

  it("stays matched when the view is narrowed further", () => {
    // Working the To Call queue for one city is still working To Call.
    const withCity = urlOf({ uncontacted: "1", sort: "oldest", city: "coimbatore" });
    expect(activePreset(withCity)?.key).toBe("to-call");
  });

  it("does not match the plain list", () => {
    expect(activePreset(urlOf({}))).toBeUndefined();
  });

  it("does not match the same filter without the queue ordering", () => {
    // ?uncontacted=1 alone is the Never-called filter chip, newest-first —
    // deliberately a different thing from the To Call queue.
    expect(activePreset(urlOf({ uncontacted: "1" }))).toBeUndefined();
  });

  it("does not match a preset whose value differs", () => {
    expect(activePreset(urlOf({ verification: "failed", sort: "oldest" }))).toBeUndefined();
  });

  it("stays matched when the queue is re-sorted", () => {
    // Re-ordering a queue is looking at the same bucket differently, not
    // leaving it. If the chip un-lit here, clicking it to get back would
    // re-apply the whole preset and wipe any filter layered on top.
    expect(activePreset(urlOf({ uncontacted: "1", sort: "budget_high" }))?.key).toBe("to-call");
    expect(activePreset(urlOf({ uncontacted: "1", sort: "newest" }))?.key).toBe("to-call");
  });

  it("keeps a preset matched with an extra filter layered on", () => {
    expect(
      activePreset(urlOf({ uncontacted: "1", sort: "coldest", city: "coimbatore" }))?.key,
    ).toBe("to-call");
  });
});
