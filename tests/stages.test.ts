import { describe, it, expect } from "vitest";
import { canTransition, allowedTransitions, type TransitionContext } from "@/lib/domain/stages";

const REQUIRED = ["floors", "property_type_id", "construction_status_id", "space_available_id"];

type CtxOver = Omit<Partial<TransitionContext>, "deal"> & { deal?: Record<string, unknown> };

function ctx(over: CtxOver = {}): TransitionContext {
  const { deal: dealOver, ...rest } = over;
  return {
    role: "crm_manager",
    requiredFieldsForAppointment: REQUIRED,
    ...rest,
    deal: {
      stage: "qualifying",
      visit_verification_status: "not_required",
      floors: 2, property_type_id: 1, construction_status_id: 1, space_available_id: 1,
      ...(dealOver ?? {}),
    },
  } as TransitionContext;
}

describe("transitions", () => {
  it("allows the happy path forward", () => {
    expect(canTransition("appointment_scheduled", ctx()).ok).toBe(true);
    expect(canTransition("site_visit_done", ctx({ deal: { stage: "appointment_scheduled" } })).ok).toBe(true);
  });

  it("lets a visit be recorded on a deal that was never booked in", () => {
    // A rep turns up at a site arranged on the phone and checks in. Without
    // this edge, checking out left the deal on Qualifying holding a completed
    // visit and a pending verification — permanently stuck, because Quote Sent
    // is unreachable from Qualifying and the pending check blocks it anyway.
    expect(canTransition("site_visit_done", ctx()).ok).toBe(true);
  });

  it("refuses moves that are not on the map", () => {
    const r = canTransition("won", ctx());
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/Cannot move/);
  });

  it("refuses a no-op", () => {
    expect(canTransition("qualifying", ctx()).ok).toBe(false);
  });

  it("treats Won as terminal", () => {
    expect(allowedTransitions(ctx({ deal: { stage: "won" } }))).toEqual([]);
  });
});

describe("the one qualification gate", () => {
  it("blocks booking an appointment until the required fields are filled", () => {
    const r = canTransition("appointment_scheduled", ctx({ deal: { floors: null } }));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("Floors");
  });

  it("names every missing field, not just the first", () => {
    const r = canTransition("appointment_scheduled", ctx({ deal: { floors: null, space_available_id: null } }));
    expect(r.reason).toContain("Floors");
    expect(r.reason).toContain("Space available");
  });

  it("never gates anything else — qualification fields stay optional", () => {
    // A wholly unqualified lead can still be dropped, parked or lost.
    const bare = ctx({ deal: { floors: null, property_type_id: null, construction_status_id: null, space_available_id: null } });
    expect(canTransition("nurture", bare).ok).toBe(true);
    expect(canTransition("not_pursued", { ...bare, reasonId: 1 }).ok).toBe(true);
  });
});

describe("the verification gate", () => {
  it("blocks Quote Sent while verification is pending", () => {
    const r = canTransition("quote_sent", ctx({ deal: { stage: "site_visit_done", visit_verification_status: "pending" } }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not been verified/);
  });

  it("blocks Quote Sent while the customer is unreachable", () => {
    expect(canTransition("quote_sent", ctx({ deal: { stage: "site_visit_done", visit_verification_status: "unreachable" } })).ok).toBe(false);
  });

  it("allows Quote Sent once confirmed", () => {
    expect(canTransition("quote_sent", ctx({ deal: { stage: "site_visit_done", visit_verification_status: "confirmed" } })).ok).toBe(true);
  });

  it("freezes a failed deal completely — it cannot advance", () => {
    const frozen = ctx({ deal: { stage: "site_visit_done", visit_verification_status: "failed" } });
    const r = canTransition("quote_sent", frozen);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/frozen/);
  });

  it("still lets a frozen deal be closed out", () => {
    // Freezing must not trap a deal forever with no way to record reality.
    const frozen = ctx({ deal: { stage: "site_visit_done", visit_verification_status: "failed" }, reasonId: 3 });
    expect(canTransition("lost", frozen).ok).toBe(true);
  });
});

describe("mandatory reasons and the advance", () => {
  it("requires a reason for Lost", () => {
    const c = ctx({ deal: { stage: "negotiation" } });
    expect(canTransition("lost", c).ok).toBe(false);
    expect(canTransition("lost", { ...c, reasonId: 2 }).ok).toBe(true);
  });

  it("requires a reason for Not Pursued", () => {
    expect(canTransition("not_pursued", ctx()).ok).toBe(false);
    expect(canTransition("not_pursued", { ...ctx(), reasonId: 5 }).ok).toBe(true);
  });

  it("requires the advance before Won — that is what Won means", () => {
    const c = ctx({ deal: { stage: "negotiation" } });
    expect(canTransition("won", c).ok).toBe(false);
    expect(canTransition("won", { ...c, advanceAmount: 50000 }).ok).toBe(true);
  });
});

describe("reviving a closed deal", () => {
  it("is refused for a CRM Manager", () => {
    const r = canTransition("qualifying", ctx({ role: "crm_manager", deal: { stage: "lost" } }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/admin/i);
  });

  it("is allowed for an admin, from both Lost and Not Pursued", () => {
    expect(canTransition("qualifying", ctx({ role: "admin", deal: { stage: "lost" } })).ok).toBe(true);
    expect(canTransition("qualifying", ctx({ role: "admin", deal: { stage: "not_pursued" } })).ok).toBe(true);
  });
});

describe("nurture", () => {
  it("can be entered from every active stage", () => {
    for (const stage of ["qualifying", "appointment_scheduled", "site_visit_done", "quote_sent", "negotiation"] as const) {
      expect(canTransition("nurture", ctx({ deal: { stage } })).ok, stage).toBe(true);
    }
  });

  it("wakes back into Qualifying", () => {
    expect(canTransition("qualifying", ctx({ deal: { stage: "nurture" } })).ok).toBe(true);
  });
});
