import { describe, it, expect } from "vitest";
import {
  median, funnel, topBuckets, ratesBy, ratesByCampaign, winRate, cycleTimeDays,
  leadAgeAtFirstContact, stalled, byRep, outcomes, attention, monthlyLeads,
  activityPace, daysToClear, FUNNEL_STAGES, MIN_PACE_SAMPLE,
  type MetricDeal,
} from "@/lib/domain/metrics";
import { WORK_PRESETS, presetByKey } from "@/lib/domain/presets";
import type { DealStage } from "@/lib/domain/stages";

const BASE: MetricDeal = {
  stage: "qualifying",
  created_at: "2026-08-01T00:00:00Z",
  first_contacted_at: null,
  won_at: null,
  last_activity_at: null,
  source_id: 1,
  campaign_name: null,
  rep_owner_id: null,
  next_action_at: null,
  visit_verification_status: "not_required",
  nurture_wake_at: null,
  latest_quote_sent_at: null,
  city_normalized: null,
  is_outstation: null,
};

const deal = (over: Partial<MetricDeal> = {}): MetricDeal => ({ ...BASE, ...over });

describe("median", () => {
  it("is null with nothing to average", () => expect(median([])).toBeNull());
  it("takes the middle of an odd count", () => expect(median([1, 9, 2])).toBe(2));
  it("averages the two middles of an even count", () => expect(median([1, 2, 3, 10])).toBe(2.5));

  it("resists the long tail an average would follow", () => {
    // Four leads called promptly and one forgotten for a year. The mean says
    // 74 days, which describes no lead in the set.
    const ages = [1, 1, 2, 3, 365];
    expect(median(ages)).toBe(2);
  });
});

describe("funnel", () => {
  it("excludes the parallel exits — they are not steps", () => {
    expect(FUNNEL_STAGES).not.toContain("lost" as DealStage);
    expect(FUNNEL_STAGES).not.toContain("nurture" as DealStage);
    expect(FUNNEL_STAGES).not.toContain("not_pursued" as DealStage);
  });

  it("keeps empty stages so the shape stays readable", () => {
    const rows = funnel([deal({ stage: "won" })]);
    expect(rows).toHaveLength(FUNNEL_STAGES.length);
    expect(rows.find((r) => r.key === "qualifying")!.count).toBe(0);
    expect(rows.find((r) => r.key === "won")!.count).toBe(1);
  });
});

describe("topBuckets", () => {
  const label = (k: string) => k;

  it("sorts by size and folds the tail into Other", () => {
    const deals = [
      ...Array(5).fill(0).map(() => deal({ campaign_name: "a" })),
      ...Array(3).fill(0).map(() => deal({ campaign_name: "b" })),
      deal({ campaign_name: "c" }),
      deal({ campaign_name: "d" }),
    ];
    const rows = topBuckets(deals, (d) => d.campaign_name, label, 2);
    expect(rows.map((r) => [r.label, r.count])).toEqual([["a", 5], ["b", 3], ["Other", 2]]);
  });

  it("counts nulls into Other rather than dropping them", () => {
    const rows = topBuckets(
      [deal({ campaign_name: "a" }), deal({ campaign_name: null })],
      (d) => d.campaign_name, label, 5,
    );
    expect(rows.find((r) => r.key === "__other")!.count).toBe(1);
  });

  it("omits Other entirely when there is no tail", () => {
    const rows = topBuckets([deal({ campaign_name: "a" })], (d) => d.campaign_name, label, 5);
    expect(rows.map((r) => r.key)).toEqual(["a"]);
  });
});

describe("ratesByCampaign", () => {
  it("drops campaigns too small to mean anything", () => {
    // Three leads and one contact is 33%, which is noise dressed as a finding.
    const deals = [
      ...Array(3).fill(0).map(() => deal({ campaign_name: "tiny" })),
      ...Array(10).fill(0).map(() => deal({ campaign_name: "real" })),
    ];
    expect(ratesByCampaign(deals, 10).map((r) => r.key)).toEqual(["real"]);
  });

  it("counts contacted and dropped separately", () => {
    const deals = [
      ...Array(8).fill(0).map(() => deal({ campaign_name: "c", first_contacted_at: "2026-08-02T00:00:00Z" })),
      ...Array(2).fill(0).map(() => deal({ campaign_name: "c", stage: "lost", first_contacted_at: "2026-08-02T00:00:00Z" })),
    ];
    const [row] = ratesByCampaign(deals, 10);
    expect(row.total).toBe(10);
    expect(row.contacted).toBe(10);
    expect(row.dropped).toBe(2);
  });
});

describe("winRate", () => {
  it("is null before anything has closed", () => {
    expect(winRate([deal(), deal()]).rate).toBeNull();
  });

  it("measures against closed deals, not the whole pipeline", () => {
    const deals = [deal({ stage: "won" }), deal({ stage: "lost" }), deal({ stage: "qualifying" })];
    const r = winRate(deals);
    expect(r.closed).toBe(2);
    expect(r.rate).toBe(0.5);
  });

  it("counts not_pursued as closed", () => {
    expect(winRate([deal({ stage: "won" }), deal({ stage: "not_pursued" })]).rate).toBe(0.5);
  });
});

describe("cycleTimeDays", () => {
  it("is null with no won deals", () => expect(cycleTimeDays([deal()])).toBeNull());

  it("measures enquiry to Won", () => {
    const deals = [deal({
      stage: "won",
      created_at: "2026-08-01T00:00:00Z",
      won_at: "2026-08-31T00:00:00Z",
    })];
    expect(cycleTimeDays(deals)).toBe(30);
  });
});

describe("leadAgeAtFirstContact", () => {
  it("bands the wait and reports the median", () => {
    const deals = [
      deal({ created_at: "2026-08-01T00:00:00Z", first_contacted_at: "2026-08-01T06:00:00Z" }),
      deal({ created_at: "2026-08-01T00:00:00Z", first_contacted_at: "2026-08-03T00:00:00Z" }),
      deal({ created_at: "2026-08-01T00:00:00Z", first_contacted_at: "2026-08-20T00:00:00Z" }),
    ];
    const r = leadAgeAtFirstContact(deals);
    expect(r.medianDays).toBe(2);
    expect(r.bands.find((b) => b.key === "same_day")!.count).toBe(1);
    expect(r.bands.find((b) => b.key === "1_3")!.count).toBe(1);
    expect(r.bands.find((b) => b.key === "over_7")!.count).toBe(1);
  });

  it("counts never-called only while the deal is still open", () => {
    const deals = [
      deal({ stage: "qualifying" }),
      deal({ stage: "lost" }),
    ];
    expect(leadAgeAtFirstContact(deals).neverCalled).toBe(1);
  });
});

describe("stalled", () => {
  const now = new Date("2026-08-30T00:00:00Z");

  it("falls back to the enquiry date when nothing was ever logged", () => {
    // The 1,073 imported leads have no activity at all. If a null read as
    // "recent", the deals most at risk would be the only ones never counted.
    expect(stalled([deal({ created_at: "2026-01-01T00:00:00Z" })], 21, now)).toBe(1);
  });

  it("ignores closed deals", () => {
    const old = { created_at: "2026-01-01T00:00:00Z" };
    expect(stalled([deal({ ...old, stage: "won" }), deal({ ...old, stage: "lost" })], 21, now)).toBe(0);
  });

  it("does not count a deal worked recently", () => {
    const deals = [deal({ created_at: "2026-01-01T00:00:00Z", last_activity_at: "2026-08-29T00:00:00Z" })];
    expect(stalled(deals, 21, now)).toBe(0);
  });
});

describe("byRep", () => {
  const names = new Map([["r1", "Nithya"], ["r2", "Vikram"]]);

  it("ranks by wins and carries failed verifications across", () => {
    const deals = [
      deal({ rep_owner_id: "r1", stage: "won" }),
      deal({ rep_owner_id: "r1" }),
      deal({ rep_owner_id: "r2" }),
    ];
    const rows = byRep(deals, names, new Map([["r2", 1]]));
    expect(rows.map((r) => r.label)).toEqual(["Nithya", "Vikram"]);
    expect(rows[0].total).toBe(2);
    expect(rows[1].failedVerifications).toBe(1);
  });

  it("shows a rep with a failure even when they hold no deals now", () => {
    const rows = byRep([], names, new Map([["r2", 2]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Vikram", total: 0, failedVerifications: 2 });
  });

  it("ignores deals with no rep", () => {
    expect(byRep([deal({ rep_owner_id: null })], names, new Map())).toHaveLength(0);
  });
});

describe("outcomes", () => {
  it("counts only parked deals as nurture", () => {
    expect(outcomes([deal({ stage: "nurture" }), deal({ stage: "lost" })]).nurture).toBe(1);
  });

  it("splits into parts that add back to the total", () => {
    const o = outcomes([
      deal(), deal({ stage: "nurture" }), deal({ stage: "won" }),
      deal({ stage: "lost" }), deal({ stage: "not_pursued" }),
    ]);
    expect(o.open + o.won + o.lost + o.notPursued).toBe(o.total);
  });

  it("counts a parked deal as still open", () => {
    // funnel() deliberately excludes nurture, because parking is not a step
    // towards Won. This one includes it, because a parked lead is still in
    // play — and the two disagreeing is exactly why both live in one file.
    const o = outcomes([deal({ stage: "nurture" })]);
    expect(o.open).toBe(1);
    expect(o.nurture).toBe(1);
  });
});

describe("attention", () => {
  const NOW = new Date("2026-09-01T12:00:00+05:30");
  const opts = { quoteSlaDays: 14 };

  it("returns one bucket per work preset, in the same order", () => {
    // The anti-drift test. The tiles link into these presets, so a tile that
    // counted a different set from the list it opens is worse than no tile.
    expect(attention([], NOW, opts).map((b) => b.key)).toEqual(WORK_PRESETS.map((p) => p.key));
  });

  it("resolves every bucket key back to a preset", () => {
    for (const b of attention([], NOW, opts)) expect(presetByKey(b.key).key).toBe(b.key);
  });

  const bucket = (deals: MetricDeal[], key: string) =>
    attention(deals, NOW, opts).find((b) => b.key === key)!;

  it("counts never-called open deals as to-call", () => {
    expect(bucket([deal(), deal({ first_contacted_at: "2026-08-02T00:00:00Z" })], "to-call").count).toBe(1);
  });

  it("leaves closed deals out of to-call", () => {
    expect(bucket([deal({ stage: "lost" })], "to-call").count).toBe(0);
  });

  it("ignores a deal with no next action when counting overdue", () => {
    // Without this every uncalled lead would be overdue, because null sorts
    // before any date. next_action_at is set by hand and usually absent.
    expect(bucket([deal()], "overdue").count).toBe(0);
    expect(bucket([deal({ next_action_at: "2026-08-30T00:00:00Z" })], "overdue").count).toBe(1);
  });

  it("counts a frozen deal as awaiting verification even though it is closed", () => {
    // Deliberate mirroring of lib/queries/deals.ts, which does not exclude
    // closed deals from this filter. A frozen deal is exactly what someone
    // looking at the visit check needs to see. Not an oversight.
    const d = deal({ stage: "lost", visit_verification_status: "pending" });
    expect(bucket([d], "awaiting-verification").count).toBe(1);
  });

  it("wakes a parked lead against end of day in India, not UTC", () => {
    // 2026-09-01T23:00+05:30 is still today in Chennai and already tomorrow in
    // UTC. Getting this wrong wakes every lead a day late, silently.
    const tonight = deal({ stage: "nurture", nurture_wake_at: "2026-09-01T23:00:00+05:30" });
    const tomorrow = deal({ stage: "nurture", nurture_wake_at: "2026-09-02T00:30:00+05:30" });
    expect(bucket([tonight], "waking").count).toBe(1);
    expect(bucket([tomorrow], "waking").count).toBe(0);
  });

  it("leaves a won deal with a stale wake date out of the waking queue", () => {
    expect(bucket([deal({ stage: "won", nurture_wake_at: "2026-01-01T00:00:00Z" })], "waking").count).toBe(0);
  });

  it("counts a quote past its follow-up window", () => {
    const stale = deal({ latest_quote_sent_at: "2026-08-01T00:00:00Z" });
    const fresh = deal({ latest_quote_sent_at: "2026-08-30T00:00:00Z" });
    expect(bucket([stale, fresh], "quote-sla").count).toBe(1);
  });

  it("reports the oldest wait, and null for an empty bucket", () => {
    expect(bucket([], "to-call").oldestDays).toBeNull();
    expect(bucket([deal({ created_at: "2026-08-22T12:00:00+05:30" })], "to-call").oldestDays).toBe(10);
  });

  it("judges severity on age rather than count", () => {
    // With a thousand leads never called, no count threshold means anything.
    // How long the oldest has waited is the part that actually moves.
    expect(bucket([], "to-call").severity).toBe("clear");
    expect(bucket([deal({ created_at: "2026-09-01T00:00:00+05:30" })], "to-call").severity).toBe("watch");
    expect(bucket([deal({ created_at: "2026-07-01T00:00:00+05:30" })], "to-call").severity).toBe("act");
  });
});

describe("monthlyLeads", () => {
  const NOW = new Date("2026-09-15T12:00:00+05:30");

  it("returns exactly the months asked for, oldest first", () => {
    const points = monthlyLeads([], 3, NOW);
    expect(points.map((p) => p.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("zero-fills a quiet month rather than dropping it", () => {
    // Closing the gap would make intake look steadier than it was.
    const points = monthlyLeads([deal({ created_at: "2026-09-02T00:00:00+05:30" })], 3, NOW);
    expect(points.map((p) => p.total)).toEqual([0, 0, 1]);
  });

  it("buckets by the Indian month, not the UTC one", () => {
    // 31 Aug 20:00 UTC is already 1 September in Chennai.
    const points = monthlyLeads([deal({ created_at: "2026-08-31T20:00:00Z" })], 2, NOW);
    expect(points.find((p) => p.key === "2026-09")!.total).toBe(1);
    expect(points.find((p) => p.key === "2026-08")!.total).toBe(0);
  });

  it("credits a call back to the month the lead arrived in", () => {
    const d = deal({ created_at: "2026-07-05T00:00:00+05:30", first_contacted_at: "2026-08-20T00:00:00Z" });
    expect(monthlyLeads([d], 3, NOW).find((p) => p.key === "2026-07")!.contacted).toBe(1);
  });
});

describe("activityPace", () => {
  const NOW = new Date("2026-09-15T12:00:00Z");
  const call = (at: string, type = "call") => ({ occurred_at: at, type });
  const many = (n: number, at: string) => Array.from({ length: n }, () => call(at));

  it("gives no rate below the minimum sample", () => {
    // Three calls in a fortnight is somebody trying the app, not a rate
    // anyone should plan a hire against.
    const r = activityPace(many(MIN_PACE_SAMPLE - 1, "2026-09-14T00:00:00Z"), 14, NOW);
    expect(r.total).toBe(MIN_PACE_SAMPLE - 1);
    expect(r.perDay).toBeNull();
  });

  it("averages over the window once there is enough", () => {
    const r = activityPace(many(14, "2026-09-14T00:00:00Z"), 14, NOW);
    expect(r.perDay).toBe(1);
  });

  it("ignores activity older than the window", () => {
    // The tracker importer writes backdated call rows, so an unbounded count
    // would report a pace the team never worked at.
    expect(activityPace(many(20, "2025-01-01T00:00:00Z"), 14, NOW).total).toBe(0);
  });

  it("counts calls only", () => {
    const rows = [...many(10, "2026-09-14T00:00:00Z"), call("2026-09-14T00:00:00Z", "stage_change")];
    expect(activityPace(rows, 14, NOW).total).toBe(10);
  });
});

describe("daysToClear", () => {
  it("is null when there is no pace to project from", () => {
    expect(daysToClear(1000, null)).toBeNull();
    expect(daysToClear(1000, 0)).toBeNull();
  });

  it("rounds up to a whole day", () => expect(daysToClear(10, 3)).toBe(4));
  it("is zero when there is no backlog", () => expect(daysToClear(0, 3)).toBe(0));
});

describe("ratesBy", () => {
  it("groups by whatever key it is given", () => {
    // Same assertions as ratesByCampaign, keyed by source instead — which is
    // the point of generalising it.
    const rows = [
      ...Array.from({ length: 10 }, () => deal({ source_id: 1, first_contacted_at: "2026-08-02T00:00:00Z" })),
      ...Array.from({ length: 3 }, () => deal({ source_id: 2 })),
    ];
    const out = ratesBy(rows, (d) => String(d.source_id), (k) => `Source ${k}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "1", label: "Source 1", total: 10, contacted: 10 });
  });
});
