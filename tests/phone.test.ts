import { describe, it, expect } from "vitest";
import { normalizePhone, isValidIndianMobile, phoneKey } from "@/lib/domain/phone";
import fixtures from "./fixtures.phone.json";

describe("normalizePhone", () => {
  it("strips the p: prefix their exports use", () => {
    expect(normalizePhone("p:+919566114558")).toBe("+919566114558");
  });

  it("handles the 64 tracker rows with no p: prefix", () => {
    expect(normalizePhone("9566114558")).toBe("+919566114558");
    expect(normalizePhone("+91 95661 14558")).toBe("+919566114558");
    expect(normalizePhone("095661-14558")).toBe("+919566114558");
  });

  it("returns null for empty input rather than a bare +", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("p:")).toBeNull();
  });

  it("keeps international and malformed numbers instead of dropping them", () => {
    // ~2% of their Meta leads. Import, flag, never silently discard.
    expect(normalizePhone("p:+18015511772")).toBe("+18015511772");
    expect(normalizePhone("p:98416494649")).toBe("+98416494649");
  });

  // The rule exists twice: here and in normalize_phone() in the migration.
  // These fixtures are every non-standard number in the real Meta export,
  // paired with what the SQL produces for it.
  it("agrees with the SQL implementation on all 23 real bad numbers from the export", () => {
    for (const [raw, expected] of fixtures.invalid as [string, string][]) {
      expect(normalizePhone(raw), `mismatch on ${raw}`).toBe(expected);
    }
  });

  it("agrees with the SQL implementation on valid numbers", () => {
    for (const [raw, expected] of fixtures.valid as [string, string][]) {
      expect(normalizePhone(raw)).toBe(expected);
    }
  });
});

describe("isValidIndianMobile", () => {
  it("accepts a real mobile and rejects the international ones", () => {
    expect(isValidIndianMobile("+919566114558")).toBe(true);
    expect(isValidIndianMobile("+18015511772")).toBe(false);
    expect(isValidIndianMobile("+98416494649")).toBe(false);
    expect(isValidIndianMobile(null)).toBe(false);
  });
});

describe("phoneKey", () => {
  it("matches duplicates across both files on the last 10 digits", () => {
    expect(phoneKey("p:+919566114558")).toBe("9566114558");
    expect(phoneKey("9566114558")).toBe("9566114558");
    expect(phoneKey("p:+919566114558")).toBe(phoneKey("0 9566 114558"));
  });
});
