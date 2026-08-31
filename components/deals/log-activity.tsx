"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { logActivity, type DealActionState } from "@/lib/actions/deals";
import Button from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import type { ListValue } from "@/lib/types";

/** Only the first nine get a key. RNR is seeded first, so RNR is always 1. */
const MAX_SHORTCUTS = 9;

/**
 * Logging a call is the most repeated action in the system and the one the
 * whole thing is judged on. RNR alone is 30% of outcomes across ~440 leads a
 * month, so the dispositions are buttons, not a dropdown inside a form: one
 * click logs the call and nothing else is required.
 *
 * Notes and commitments are behind a second click, because they are the
 * exception rather than the rule.
 */
export default function LogActivity({
  dealId, dispositions, onLogged,
}: {
  dealId: string;
  dispositions: ListValue[];
  /**
   * Queue mode, passed only by the slide-over.
   *
   * A number key logs that disposition and calls this to move to the next
   * lead — the single keystroke the spec asks for, and the thing that makes
   * working 130 RNRs a month bearable.
   *
   * Clicking deliberately does NOT advance. The two paths are different jobs:
   * running down a queue is `1 1 1`, while clicking "Connected - Interested"
   * means the next thing she wants is a next action on this lead, not the
   * lead after it.
   */
  onLogged?: () => void;
}) {
  const [state, action, pending] = useActionState<DealActionState, FormData>(logActivity, {});
  const [mode, setMode] = useState<"call" | "note" | "commitment">("call");
  useDealChanged(state);
  const formRef = useRef<HTMLFormElement>(null);

  // Set only by the keyboard path, so a click never advances.
  const advanceOnSuccess = useRef(false);
  const seen = useRef(state);

  const shortcuts = !!onLogged;
  const keyed = Math.min(MAX_SHORTCUTS, dispositions.length);

  useEffect(() => {
    if (!shortcuts || mode !== "call") return;

    const onKey = (e: KeyboardEvent) => {
      // Typing a note must not log a call. Same guard the drawer's arrow keys
      // use, for the same reason.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > keyed) return;

      const btn = formRef.current?.querySelector<HTMLButtonElement>(
        `[data-disposition="${dispositions[n - 1].id}"]`,
      );
      if (!btn || btn.disabled) return;

      e.preventDefault();
      advanceOnSuccess.current = true;
      // Passing the button as the submitter is what puts its disposition_id
      // into the FormData — the same entry a click would have produced.
      formRef.current?.requestSubmit(btn);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcuts, mode, keyed, dispositions]);

  useEffect(() => {
    if (state !== seen.current && state?.ok && advanceOnSuccess.current) {
      advanceOnSuccess.current = false;
      onLogged?.();
    }
    seen.current = state;
  }, [state, onLogged]);

  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="deal_id" value={dealId} />
      <input type="hidden" name="type" value={mode} />

      <div className="flex gap-1 text-sm">
        {(["call", "note", "commitment"] as const).map((m) => (
          <button
            key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-md px-2.5 py-1 capitalize transition-colors ${
              mode === m ? "bg-navy-900 font-medium text-white" : "text-ink-muted hover:bg-navy-50"
            }`}
          >
            {m === "commitment" ? "Promise" : m}
          </button>
        ))}
      </div>

      {mode === "call" && (
        <>
          <p className="text-xs text-ink-muted">
            {shortcuts
              ? "One click logs the call. Press its number to log and go straight to the next lead."
              : "One click logs the call."}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {dispositions.map((d, i) => (
              <button
                key={d.id}
                name="disposition_id"
                value={d.id}
                data-disposition={d.id}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-md border border-border bg-paper px-2.5 py-1.5 text-sm text-ink transition-colors hover:border-navy-700 hover:bg-navy-100 disabled:opacity-50"
              >
                {d.label}
                {shortcuts && i < keyed && (
                  <kbd className="rounded border border-border bg-navy-50 px-1 text-[10px] leading-4 text-ink-muted">
                    {i + 1}
                  </kbd>
                )}
              </button>
            ))}
          </div>
          <textarea
            name="notes" rows={2} placeholder="Anything worth remembering (optional)"
            className={`${inputClass} text-sm`}
          />
        </>
      )}

      {mode === "note" && (
        <>
          <textarea
            name="notes" rows={3} required autoFocus placeholder="What happened?"
            className={`${inputClass} text-sm`}
          />
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Add note"}</Button>
        </>
      )}

      {mode === "commitment" && (
        <>
          <textarea
            name="notes" rows={2} required autoFocus placeholder="What did we promise them?"
            className={`${inputClass} text-sm`}
          />
          <div className="flex items-center gap-2">
            <label htmlFor="due_date" className="text-sm text-ink-muted">By</label>
            <input id="due_date" name="due_date" type="date" required className={`${inputClass} w-44 text-sm`} />
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Record promise"}</Button>
          </div>
        </>
      )}

      {state.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger">{state.error}</p>
      )}
    </form>
  );
}
