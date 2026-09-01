"use client";

import { useActionState, useEffect, useRef } from "react";
import { logActivity, type DealActionState } from "@/lib/actions/deals";
import Button from "@/components/ui/button";
import { inputBase, inputClass } from "@/components/ui/field";
import { formatDate } from "@/lib/config/design-tokens";
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
 * Everything is on screen at once. It was tabs — call / note / promise — and
 * the tabs cost a click to discover and hid the thing you wanted while you
 * were looking at the thing you didn't. The three fields together are shorter
 * than the tab strip was.
 *
 * There is no separate "promise" any more. It wrote an activity row with its
 * own due date that nothing scheduled off, sitting beside a next action that
 * everything schedules off — two dates meaning the same thing, one of them
 * inert. Next action is the one that works, so it is the one that stayed.
 */
export default function LogActivity({
  dealId, dispositions, nextActionAt, nextActionNote, onLogged,
}: {
  dealId: string;
  dispositions: ListValue[];
  /** The reminder as it stands, so the field shows what is already set. */
  nextActionAt?: string | null;
  nextActionNote?: string | null;
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
  useDealChanged(state);
  const formRef = useRef<HTMLFormElement>(null);

  // Set only by the keyboard path, so a click never advances.
  const advanceOnSuccess = useRef(false);
  const seen = useRef(state);

  const shortcuts = !!onLogged;
  const keyed = Math.min(MAX_SHORTCUTS, dispositions.length);

  useEffect(() => {
    if (!shortcuts) return;

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
  }, [shortcuts, keyed, dispositions]);

  useEffect(() => {
    if (state !== seen.current && state?.ok && advanceOnSuccess.current) {
      advanceOnSuccess.current = false;
      onLogged?.();
    }
    seen.current = state;
  }, [state, onLogged]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="deal_id" value={dealId} />

      {/* ---------------------------------------------------------- call */}
      <div className="space-y-2">
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
      </div>

      {/* ---------------------------------------------------------- note */}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-ink">
          Note
          <span className="ml-1 font-normal text-ink-muted">
            add it to the call above, or save it on its own
          </span>
        </p>
        <textarea
          name="notes" rows={2} placeholder="Anything worth remembering (optional)"
          aria-label="Notes"
          className={`${inputClass} text-sm`}
        />
        {/* A disposition makes it a call; without one the same box is a note,
            so nothing here needs choosing up front. */}
        <Button type="submit" name="type" value="note" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Add note only"}
        </Button>
      </div>

      {/* --------------------------------------------------- next action */}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-medium text-ink">
          Next action
          <span className="ml-1 font-normal text-ink-muted">when to come back to this</span>
        </p>

        {/* Shown, not prefilled. These inputs sit in the same form as the
            disposition buttons, so a prefilled date would be resubmitted with
            every call logged and the deal could never stop being overdue.
            Empty means "clear it", which is what logging a call should do. */}
        {nextActionAt && (
          <p className="text-xs text-ink-muted">
            Currently {formatDate(nextActionAt)}
            {nextActionNote ? ` · ${nextActionNote}` : ""} — logging a call clears it
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            name="next_action_at" type="date"
            aria-label="Next action date" className={`${inputBase} w-44`}
          />
          <input
            name="next_action_note" placeholder="What needs doing"
            aria-label="Next action note" className={`${inputBase} min-w-0 flex-1`}
          />
          <Button type="submit" name="type" value="next_action" size="sm" variant="secondary" disabled={pending}>
            Set
          </Button>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger">{state.error}</p>
      )}
      {state.message && (
        <p className="rounded-md bg-success/10 px-3 py-1.5 text-sm text-success">{state.message}</p>
      )}
    </form>
  );
}
