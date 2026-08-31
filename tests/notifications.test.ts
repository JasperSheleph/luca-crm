import { describe, it, expect } from "vitest";
import {
  isRuleDue, istParts, resolveRecipients, offsetFireTime,
  renderTemplate, dedupeKey, istDayRange, offsetWindow,
  type NotificationRule,
} from "@/lib/domain/notifications";

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

describe("template rendering", () => {
  it("substitutes every placeholder", () => {
    expect(renderTemplate("New lead assigned: {{customer_name}}, {{city}}. Source: {{source}}.", {
      customer_name: "Murugan", city: "Coimbatore", source: "Meta",
    })).toBe("New lead assigned: Murugan, Coimbatore. Source: Meta.");
  });

  it("accepts numbers, which every digest uses", () => {
    expect(renderTemplate("{{count}} deals have an overdue next action.", { count: 11 }))
      .toBe("11 deals have an overdue next action.");
  });

  it("renders zero rather than treating it as missing", () => {
    expect(renderTemplate("Today: {{new_leads}} new.", { new_leads: 0 }))
      .toBe("Today: 0 new.");
  });

  it("never leaves a raw {{placeholder}} on screen", () => {
    // The recipient cannot report a half-rendered message, so it must not happen.
    expect(renderTemplate("Visit at {{time}} — {{customer_name}}.", { time: "10:30 am" }))
      .toBe("Visit at 10:30 am — —.");
    expect(renderTemplate("{{a}}", { a: null })).toBe("—");
    expect(renderTemplate("{{a}}", {})).toBe("—");
  });

  it("leaves text with no placeholders alone", () => {
    expect(renderTemplate("Deal frozen.", {})).toBe("Deal frozen.");
  });
});

describe("idempotency keys", () => {
  it("is stable for the same rule, person and day", () => {
    expect(dedupeKey("next_action_overdue", "u1", "2026-08-31"))
      .toBe(dedupeKey("next_action_overdue", "u1", "2026-08-31"));
  });

  it("separates people, days and triggers", () => {
    const base = dedupeKey("next_action_overdue", "u1", "2026-08-31");
    expect(dedupeKey("next_action_overdue", "u2", "2026-08-31")).not.toBe(base);
    expect(dedupeKey("next_action_overdue", "u1", "2026-09-01")).not.toBe(base);
    expect(dedupeKey("daily_summary", "u1", "2026-08-31")).not.toBe(base);
  });
});

describe("IST day boundaries", () => {
  it("gives the India day, not the UTC one, late in the evening", () => {
    // 20:00 UTC is 01:30 IST the NEXT day — a UTC server reports the wrong
    // date here, and the daily summary then counts the wrong 24 hours.
    const { start, end, ymd } = istDayRange(new Date("2026-08-28T20:00:00Z"));
    expect(ymd).toBe("2026-08-29");
    expect(start.toISOString()).toBe("2026-08-28T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-08-29T18:30:00.000Z");
  });

  it("covers exactly 24 hours", () => {
    const { start, end } = istDayRange(new Date("2026-08-28T06:00:00Z"));
    expect(end.getTime() - start.getTime()).toBe(86_400_000);
  });

  it("walks forward a day for the tomorrow reminder", () => {
    const today = istDayRange(new Date("2026-08-28T06:00:00Z"));
    const tomorrow = istDayRange(new Date("2026-08-28T06:00:00Z"), 1);
    expect(tomorrow.ymd).toBe("2026-08-29");
    expect(tomorrow.start.getTime()).toBe(today.end.getTime());
  });

  it("walks backward too", () => {
    expect(istDayRange(new Date("2026-08-28T06:00:00Z"), -1).ymd).toBe("2026-08-27");
  });

  it("treats midnight IST as the start of that day, not the end of the last", () => {
    const { ymd } = istDayRange(new Date("2026-08-27T18:30:00Z"));
    expect(ymd).toBe("2026-08-28");
  });
});

describe("offset windows", () => {
  it("selects the appointments whose reminder lands in this tick", () => {
    const tickStart = new Date("2026-08-28T10:00:00Z");
    const tickEnd = new Date("2026-08-28T10:15:00Z");
    const { from, to } = offsetWindow(tickStart, tickEnd, -120);

    expect(from.toISOString()).toBe("2026-08-28T12:00:00.000Z");
    expect(to.toISOString()).toBe("2026-08-28T12:15:00.000Z");
  });

  it("is the exact inverse of offsetFireTime, so nothing falls between ticks", () => {
    const tickStart = new Date("2026-08-28T10:00:00Z");
    const tickEnd = new Date("2026-08-28T10:15:00Z");
    const { from, to } = offsetWindow(tickStart, tickEnd, -120);

    // An appointment at either edge of the window fires inside the tick.
    expect(offsetFireTime(from, -120).getTime()).toBe(tickStart.getTime());
    expect(offsetFireTime(to, -120).getTime()).toBe(tickEnd.getTime());

    // One a minute earlier already fired on the previous tick.
    const justBefore = new Date(from.getTime() - 60_000);
    expect(offsetFireTime(justBefore, -120).getTime()).toBeLessThan(tickStart.getTime());
  });
});
