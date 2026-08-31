/**
 * The CRM Manager's work queue.
 *
 * Five ordered views, each one a filter combination over /deals rather than a
 * screen of its own. A separate /queue route was specified and dropped: it
 * would have been /admin/leads all over again, a second near-identical list
 * beside Deals. See docs/PROGRESS.md.
 *
 * Every preset sorts oldest-first. That is the substance of the whole idea —
 * newest-first is right for searching and wrong for working, because the lead
 * that has waited three weeks is the one costing money.
 *
 * Pure data. No database, no React, so both the server page and the client
 * table can read it.
 */

export interface WorkPreset {
  /** Stable id. Appears in no URL — the params below are the URL. */
  key: string;
  label: string;
  /** Shown on hover, and as the empty state when the view has no rows. */
  hint: string;
  /** The whole URL state for this view. Applying one replaces every filter. */
  params: Record<string, string>;
  /**
   * Set where the bucket cannot have rows until a later build step exists.
   * Without this an empty view reads as broken rather than as not-yet-built.
   */
  emptyUntil?: string;
}

export const WORK_PRESETS: readonly WorkPreset[] = [
  {
    key: "to-call",
    label: "To call",
    hint: "Nobody has logged a call yet. Longest wait first.",
    params: { uncontacted: "1", sort: "oldest" },
  },
  {
    key: "awaiting-verification",
    label: "Awaiting verification",
    hint: "A site visit was marked complete and the customer has not confirmed it.",
    params: { verification: "pending", sort: "oldest" },
    emptyUntil: "reps start logging site visits",
  },
  {
    key: "overdue",
    label: "Overdue",
    hint: "The follow-up date has passed.",
    params: { overdue: "1", sort: "oldest" },
  },
  {
    key: "waking",
    label: "Waking today",
    hint: "Parked in Nurture with a wake date of today or earlier.",
    params: { waking: "1", sort: "oldest" },
  },
  {
    key: "quote-sla",
    label: "Quotes past SLA",
    hint: "A quote went out, the follow-up window has run out and there is still no answer.",
    params: { quotesla: "1", sort: "oldest" },
    emptyUntil: "quotes are being sent",
  },
] as const;

/** The query string for a preset, without the leading `?`. */
export function presetQuery(preset: WorkPreset): string {
  return new URLSearchParams(preset.params).toString();
}

export function presetHref(preset: WorkPreset, path = "/deals"): string {
  return `${path}?${presetQuery(preset)}`;
}

/**
 * Which preset the current URL is showing, if any.
 *
 * A preset matches when every parameter it defines is present with that exact
 * value. Extra filters on top — a city, a search term — keep it matching, so
 * narrowing "To call" to Coimbatore still reads as working the To Call queue.
 */
export function activePreset(get: (key: string) => string | undefined | null): WorkPreset | undefined {
  return WORK_PRESETS.find((p) =>
    Object.entries(p.params).every(([k, v]) => (get(k) ?? "") === v),
  );
}

/**
 * A preset by key, so a link cannot silently repoint if the list is reordered.
 * Throws at module load rather than returning undefined: a broken key should
 * fail the build, not send someone to a blank page six months from now.
 */
function preset(key: string): WorkPreset {
  const found = WORK_PRESETS.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown work preset: ${key}`);
  return found;
}

/** Where the CRM Manager lands at sign-in: the first bucket, oldest first. */
export const TO_CALL = WORK_PRESETS[0];

/**
 * The two buckets notifications link into. A digest saying "11 deals are
 * overdue" has to land on the eleven deals, sorted the way they are worked —
 * which is what a preset is, and why these are not hand-written query strings.
 */
export const OVERDUE = preset("overdue");
export const AWAITING_VERIFICATION = preset("awaiting-verification");
