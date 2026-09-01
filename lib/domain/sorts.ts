/**
 * How the deals list can be ordered.
 *
 * Pure data, in `lib/domain` rather than beside the query, because the filter
 * bar is a client component and must never import a runtime value from
 * `lib/queries/*` — that drags `next/headers` into the browser bundle and
 * breaks every page, without `tsc` saying a word.
 *
 * Each entry names a column on `deal_list_view` plus a direction. Nothing here
 * knows about Supabase; `listDeals` turns it into an `.order()`.
 */

export interface DealSort {
  /** What appears in the URL. Stable — presets and bookmarks depend on it. */
  key: string;
  label: string;
  column: string;
  ascending: boolean;
  /**
   * Where the blanks go. Postgres defaults to NULLS LAST ascending and NULLS
   * FIRST descending, which is rarely what a reader wants, so every entry says
   * so explicitly rather than inheriting a rule nobody remembers.
   */
  nullsFirst: boolean;
}

export const DEAL_SORTS: readonly DealSort[] = [
  {
    key: "newest",
    label: "Newest first",
    column: "created_at", ascending: false, nullsFirst: false,
  },
  {
    // The work-queue order, and the reason `sort` exists at all: newest-first
    // is right for searching and wrong for working, because the lead that has
    // waited three weeks is the one costing money.
    key: "oldest",
    label: "Longest waiting",
    column: "created_at", ascending: true, nullsFirst: false,
  },
  {
    key: "next_action",
    label: "Next action soonest",
    column: "next_action_at", ascending: true, nullsFirst: false,
  },
  {
    // Blanks last in BOTH directions. Budget is empty on almost every lead —
    // 46 of 1,762 rows in the old tracker carried one — so letting nulls lead
    // "low to high" would bury the handful of real figures behind a thousand
    // unknowns and make the option useless.
    key: "budget_high",
    label: "Budget, high to low",
    column: "budget_amount", ascending: false, nullsFirst: false,
  },
  {
    key: "budget_low",
    label: "Budget, low to high",
    column: "budget_amount", ascending: true, nullsFirst: false,
  },
  {
    key: "customer",
    label: "Customer name A–Z",
    column: "customer_name", ascending: true, nullsFirst: false,
  },
  {
    // Nulls LAST, though "never touched" is literally the coldest of all.
    // Sorting them to the top made the option worthless: over a thousand leads
    // have no activity at all, so it opened with a page of never-called leads
    // in arbitrary order — which is what "To call" already does, and better.
    // Last-worked-longest-ago is the set no other control surfaces.
    key: "coldest",
    label: "Worked longest ago",
    column: "last_activity_at", ascending: true, nullsFirst: false,
  },
  {
    key: "recent",
    label: "Recently worked first",
    column: "last_activity_at", ascending: false, nullsFirst: false,
  },
] as const;

/** What the list falls back to, and what an unknown `?sort=` resolves to. */
export const DEFAULT_SORT = "newest";

/**
 * The sort a URL asks for, or the default.
 *
 * Never throws: `?sort=nonsense` is a bookmark someone kept after a rename,
 * not a reason to fail a page. It quietly lands on newest-first.
 */
export function dealSort(key: string | undefined | null): DealSort {
  return DEAL_SORTS.find((s) => s.key === key)
    ?? DEAL_SORTS.find((s) => s.key === DEFAULT_SORT)!;
}
