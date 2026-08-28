"use client";

import { useEffect, useRef } from "react";

export const DEAL_CHANGED = "luca:deal-changed";

/**
 * Announces that a deal was just written to.
 *
 * The server actions call revalidatePath, which refreshes the server-rendered
 * list — but the slide-over holds its own copy fetched from /api/deals/[id],
 * and revalidation cannot reach that. Without this, logging a call from the
 * drawer leaves its timeline a step behind until you reopen the lead.
 *
 * Pass the action state from useActionState; it fires once each time an action
 * reports success.
 */
export function useDealChanged(state: { ok?: boolean } | undefined) {
  const seen = useRef(state);

  useEffect(() => {
    if (state !== seen.current && state?.ok) {
      window.dispatchEvent(new CustomEvent(DEAL_CHANGED));
    }
    seen.current = state;
  }, [state]);
}
