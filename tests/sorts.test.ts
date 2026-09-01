import { describe, it, expect } from "vitest";
import { DEAL_SORTS, DEFAULT_SORT, dealSort } from "@/lib/domain/sorts";

describe("dealSort", () => {
  it("falls back to the default rather than throwing", () => {
    // ?sort=whatever is a bookmark someone kept after a rename, not a reason
    // to fail a page.
    expect(dealSort("nonsense").key).toBe(DEFAULT_SORT);
    expect(dealSort(undefined).key).toBe(DEFAULT_SORT);
    expect(dealSort(null).key).toBe(DEFAULT_SORT);
  });

  it("keeps the two keys every existing URL and preset depends on", () => {
    // Every work preset and the dashboard's stalled link write sort=oldest.
    expect(dealSort("oldest")).toMatchObject({ column: "created_at", ascending: true });
    expect(dealSort("newest")).toMatchObject({ column: "created_at", ascending: false });
  });

  it("puts empty budgets last whichever way it is read", () => {
    // Budget is recorded on a handful of leads. Letting the blanks lead
    // "low to high" would bury every real figure behind a thousand unknowns.
    expect(dealSort("budget_high")).toMatchObject({ ascending: false, nullsFirst: false });
    expect(dealSort("budget_low")).toMatchObject({ ascending: true, nullsFirst: false });
  });

  it("keeps never-touched leads out of the way of the ones that went cold", () => {
    // "Never touched" is literally coldest, but there are over a thousand of
    // them and "To call" already lists them properly. Sorting them to the top
    // here would hide the handful of deals that were worked and then dropped,
    // which is the set nothing else surfaces.
    expect(dealSort("coldest")).toMatchObject({ ascending: true, nullsFirst: false });
    expect(dealSort("recent")).toMatchObject({ ascending: false, nullsFirst: false });
  });

  it("has unique keys and a resolvable default", () => {
    const keys = DEAL_SORTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(DEFAULT_SORT);
  });
});
