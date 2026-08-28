import { describe, it, expect } from "vitest";
import { normalizeCity, isOutstation, isOutsideServiceArea } from "@/lib/domain/city";

const ALIASES = {
  trichy: "tiruchirappalli", madras: "chennai", cbe: "coimbatore",
  pondy: "puducherry", pondicherry: "puducherry", kovai: "coimbatore",
};
const SERVICE_AREA = ["chennai", "coimbatore", "madurai", "tiruchirappalli", "puducherry", "salem"];

describe("normalizeCity", () => {
  it("collapses the case and whitespace variants in their data", () => {
    expect(normalizeCity("Chennai", ALIASES)).toBe("chennai");
    expect(normalizeCity("  CHENNAI  ", ALIASES)).toBe("chennai");
    expect(normalizeCity("chennai", ALIASES)).toBe("chennai");
  });

  it("resolves the aliases that actually appear (trichy / tiruchirappalli)", () => {
    expect(normalizeCity("Trichy", ALIASES)).toBe("tiruchirappalli");
    expect(normalizeCity("CBE", ALIASES)).toBe("coimbatore");
    expect(normalizeCity("Pondy", ALIASES)).toBe("puducherry");
  });

  it("strips punctuation", () => {
    expect(normalizeCity("Chennai.", ALIASES)).toBe("chennai");
    expect(normalizeCity("Chennai,", ALIASES)).toBe("chennai");
  });

  it("returns null for the 42 rows with an empty city", () => {
    expect(normalizeCity("", ALIASES)).toBeNull();
    expect(normalizeCity(null, ALIASES)).toBeNull();
    expect(normalizeCity("   ", ALIASES)).toBeNull();
  });

  it("passes through an unknown city rather than discarding it", () => {
    expect(normalizeCity("Kumbakonam", ALIASES)).toBe("kumbakonam");
  });
});

describe("service area", () => {
  it("treats outstation as normal business, not an edge case", () => {
    expect(isOutstation("madurai", SERVICE_AREA)).toBe(true);
    expect(isOutstation("chennai", SERVICE_AREA)).toBe(false);
  });

  it("flags only what is genuinely outside Tamil Nadu and Puducherry", () => {
    expect(isOutsideServiceArea("bangalore", SERVICE_AREA)).toBe(true);
    expect(isOutsideServiceArea("hyderabad", SERVICE_AREA)).toBe(true);
    expect(isOutsideServiceArea("madurai", SERVICE_AREA)).toBe(false);
  });
});
