import { describe, it, expect } from "vitest";
import {
  median, funnel, topBuckets, ratesByCampaign, winRate, cycleTimeDays,
  leadAgeAtFirstContact, stalled, byRep, nurturePool, FUNNEL_STAGES,
  type MetricDeal,
} from "@/lib/domain/metrics";
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
  crm_owner_id: null,
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

describe("nurturePool", () => {
  it("counts only parked deals", () => {
    expect(nurturePool([deal({ stage: "nurture" }), deal({ stage: "lost" })])).toBe(1);
  });
});
