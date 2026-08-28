import { describe, it, expect } from "vitest";
import { can, canViewDeal, type Actor } from "@/lib/domain/permissions";

const admin: Actor = { id: "a", role: "admin" };
const manager: Actor = { id: "m", role: "crm_manager" };
const rep: Actor = { id: "r", role: "sales_rep" };
const otherRep: Actor = { id: "r2", role: "sales_rep" };

describe("the capability matrix", () => {
  it("makes admin a superset of crm_manager", () => {
    // This is what lets the owners cover when a CRM Manager is away.
    const managerActions = [
      "assign_lead_to_rep", "view_all_deals", "edit_qualification", "log_activity",
      "schedule_appointment", "run_verification_call", "upload_quote", "close_deal", "export_deals",
    ] as const;
    for (const a of managerActions) {
      expect(can(manager, a), a).toBe(true);
      expect(can(admin, a), a).toBe(true);
    }
  });

  it("reserves lead assignment to a CRM Manager for admins", () => {
    expect(can(admin, "assign_lead_to_crm_manager")).toBe(true);
    expect(can(manager, "assign_lead_to_crm_manager")).toBe(false);
  });

  it("lets an admin assign straight to a rep — a real workflow, not a bypass", () => {
    expect(can(admin, "assign_lead_to_rep")).toBe(true);
    expect(can(manager, "assign_lead_to_rep")).toBe(true);
    expect(can(rep, "assign_lead_to_rep")).toBe(false);
  });

  it("reserves resolving a failed verification to admins alone", () => {
    expect(can(admin, "resolve_failed_verification")).toBe(true);
    expect(can(manager, "resolve_failed_verification")).toBe(false);
    expect(can(rep, "resolve_failed_verification")).toBe(false);
  });

  it("makes check-in a rep-only action", () => {
    expect(can(rep, "check_in_visit", { rep_owner_id: "r" })).toBe(true);
    expect(can(manager, "check_in_visit")).toBe(false);
    expect(can(admin, "check_in_visit")).toBe(false);
  });

  it("keeps admin-only screens admin-only", () => {
    for (const a of ["manage_users", "manage_settings", "run_import", "view_dashboard"] as const) {
      expect(can(admin, a), a).toBe(true);
      expect(can(manager, a), a).toBe(false);
      expect(can(rep, a), a).toBe(false);
    }
  });
});

describe("rep scoping", () => {
  it("lets a rep act on his own deal", () => {
    expect(can(rep, "log_activity", { rep_owner_id: "r" })).toBe(true);
    expect(can(rep, "schedule_appointment", { rep_owner_id: "r" })).toBe(true);
  });

  it("refuses a rep on another rep's deal", () => {
    expect(can(rep, "log_activity", { rep_owner_id: "r2" })).toBe(false);
    expect(can(rep, "check_in_visit", { rep_owner_id: "r2" })).toBe(false);
  });

  it("does not scope staff by ownership", () => {
    expect(can(manager, "log_activity", { rep_owner_id: "r" })).toBe(true);
    expect(can(admin, "log_activity", { rep_owner_id: "r" })).toBe(true);
  });
});

describe("canViewDeal mirrors the RLS policy", () => {
  it("shows staff everything", () => {
    expect(canViewDeal(admin, { rep_owner_id: "r" })).toBe(true);
    expect(canViewDeal(manager, { rep_owner_id: "r" })).toBe(true);
  });

  it("shows a rep only his own", () => {
    expect(canViewDeal(rep, { rep_owner_id: "r" })).toBe(true);
    expect(canViewDeal(rep, { rep_owner_id: "r2" })).toBe(false);
    expect(canViewDeal(otherRep, { rep_owner_id: "r" })).toBe(false);
  });

  it("hides an unassigned deal from a rep", () => {
    expect(canViewDeal(rep, { rep_owner_id: null })).toBe(false);
  });
});
