import { describe, it, expect } from "vitest";
import { isRuleDue, istParts, resolveRecipients, offsetFireTime, type NotificationRule } from "@/lib/domain/notifications";

function rule(over: Partial<NotificationRule> = {}): NotificationRule {
  return {
    trigger_key: "t", template_key: "t", is_enabled: true,
    timing_type: "daily_at", offset_minutes: null, daily_at_time: "09:00",
    weekly_day: null, recipient_type: "role", recipient_role: "admin",
    recipient_user_id: null, threshold_value: null,
    ...over,
  };
}

describe("IST is not optional", () => {
  it("reads wall-clock parts in Asia/Kolkata, not UTC", () => {
    // 03:30 UTC is 09:00 IST — the exact case that silently breaks a UTC server.
    const p = istParts(new Date("2026-08-28T03:30:00Z"));
    expect(p.hour).toBe(9);
    expect(p.minute).toBe(0);
  });

  it("fires the 9am rule at 03:30 UTC", () => {
    expect(isRuleDue(rule({ daily_at_time: "09:00" }), new Date("2026-08-28T03:30:00Z"))).toBe(true);
  });

  it("does NOT fire the 9am rule at 09:00 UTC", () => {
    // 09:00 UTC is 14:30 IST. A naive implementation fires here and is wrong.
    expect(isRuleDue(rule({ daily_at_time: "09:00" }), new Date("2026-08-28T09:00:00Z"))).toBe(false);
  });

  it("fires the 7pm digest at 13:30 UTC", () => {
    expect(isRuleDue(rule({ daily_at_time: "19:00" }), new Date("2026-08-28T13:30:00Z"))).toBe(true);
  });

  it("handles the IST half-hour offset correctly across a date boundary", () => {
    // 18:45 UTC on the 27th is 00:15 IST on the 28th.
    const p = istParts(new Date("2026-08-27T18:45:00Z"));
    expect(p.hour).toBe(0);
    expect(p.ymd).toBe("2026-08-28");
  });
});

describe("scheduling window", () => {
  it("tolerates cron jitter after the due time", () => {
    expect(isRuleDue(rule({ daily_at_time: "09:00" }), new Date("2026-08-28T03:38:00Z"))).toBe(true);
  });

  it("does not fire before the due time", () => {
    expect(isRuleDue(rule({ daily_at_time: "09:00" }), new Date("2026-08-28T03:20:00Z"))).toBe(false);
  });

  it("does not fire long after, so a late job does not double-send", () => {
    expect(isRuleDue(rule({ daily_at_time: "09:00" }), new Date("2026-08-28T04:30:00Z"))).toBe(false);
  });

  it("never fires a disabled rule", () => {
    expect(isRuleDue(rule({ is_enabled: false }), new Date("2026-08-28T03:30:00Z"))).toBe(false);
  });

  it("ignores immediate and offset rules — they are event-driven", () => {
    expect(isRuleDue(rule({ timing_type: "immediate" }), new Date("2026-08-28T03:30:00Z"))).toBe(false);
    expect(isRuleDue(rule({ timing_type: "offset", offset_minutes: -120 }), new Date("2026-08-28T03:30:00Z"))).toBe(false);
  });
});

describe("weekly rules", () => {
  it("fires only on the configured weekday", () => {
    // 2026-08-31 is a Monday. 03:30 UTC = 09:00 IST.
    const r = rule({ timing_type: "weekly_at", weekly_day: 1, daily_at_time: "09:00" });
    expect(isRuleDue(r, new Date("2026-08-31T03:30:00Z"))).toBe(true);
    expect(isRuleDue(r, new Date("2026-09-01T03:30:00Z"))).toBe(false);
  });
});

describe("offset rules", () => {
  it("fires 2 hours before an appointment", () => {
    const appt = new Date("2026-08-28T10:00:00Z");
    expect(offsetFireTime(appt, -120).toISOString()).toBe("2026-08-28T08:00:00.000Z");
  });
});

describe("recipients", () => {
  it("routes deal_owner to the deal's owners", () => {
    expect(resolveRecipients(rule({ recipient_type: "deal_owner" }), { dealOwnerIds: ["u1", "u2"] })).toEqual(["u1", "u2"]);
  });

  it("routes role to everyone holding it", () => {
    expect(resolveRecipients(rule({ recipient_type: "role", recipient_role: "admin" }), { usersByRole: { admin: ["a1", "a2"] } })).toEqual(["a1", "a2"]);
  });

  it("routes specific_user to just that person", () => {
    expect(resolveRecipients(rule({ recipient_type: "specific_user", recipient_user_id: "u9" }), {})).toEqual(["u9"]);
  });

  it("returns nobody rather than throwing when a recipient cannot be resolved", () => {
    expect(resolveRecipients(rule({ recipient_type: "role", recipient_role: "admin" }), {})).toEqual([]);
    expect(resolveRecipients(rule({ recipient_type: "specific_user", recipient_user_id: null }), {})).toEqual([]);
  });
});
