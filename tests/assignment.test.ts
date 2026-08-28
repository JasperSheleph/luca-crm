import { describe, it, expect } from "vitest";
import { pickCrmOwner } from "@/lib/domain/assignment";

const A = { id: "a", is_active: true };
const B = { id: "b", is_active: true };
const inactive = { id: "z", is_active: false };

describe("auto_single", () => {
  it("sends every lead to the one active manager", () => {
    expect(pickCrmOwner({ mode: "auto_single", crmManagers: [A] })).toBe("a");
  });

  it("skips inactive managers", () => {
    expect(pickCrmOwner({ mode: "auto_single", crmManagers: [inactive, B] })).toBe("b");
  });
});

describe("round_robin", () => {
  it("goes to whoever holds the fewest", () => {
    expect(pickCrmOwner({ mode: "round_robin", crmManagers: [A, B], currentLoad: { a: 10, b: 3 } })).toBe("b");
  });

  it("is deterministic on a tie", () => {
    expect(pickCrmOwner({ mode: "round_robin", crmManagers: [A, B], currentLoad: { a: 5, b: 5 } })).toBe("a");
  });

  it("treats an absent count as zero", () => {
    expect(pickCrmOwner({ mode: "round_robin", crmManagers: [A, B], currentLoad: { a: 4 } })).toBe("b");
  });

  it("never picks an inactive manager, however light their load", () => {
    expect(pickCrmOwner({ mode: "round_robin", crmManagers: [inactive, A], currentLoad: { z: 0, a: 99 } })).toBe("a");
  });
});

describe("manual", () => {
  it("leaves the lead unassigned for an admin to pick up", () => {
    expect(pickCrmOwner({ mode: "manual", crmManagers: [A, B] })).toBeNull();
  });
});

describe("no active manager", () => {
  it("returns null rather than dropping the lead on the floor", () => {
    // The lead is still created — it just lands unassigned in Admin -> Leads.
    expect(pickCrmOwner({ mode: "auto_single", crmManagers: [] })).toBeNull();
    expect(pickCrmOwner({ mode: "round_robin", crmManagers: [inactive] })).toBeNull();
  });
});
