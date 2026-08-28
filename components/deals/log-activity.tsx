"use client";

import { useActionState, useRef, useState } from "react";
import { logActivity, type DealActionState } from "@/lib/actions/deals";
import Button from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import type { ListValue } from "@/lib/types";

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
  dealId, dispositions,
}: {
  dealId: string;
  dispositions: ListValue[];
}) {
  const [state, action, pending] = useActionState<DealActionState, FormData>(logActivity, {});
  const [mode, setMode] = useState<"call" | "note" | "commitment">("call");
  const formRef = useRef<HTMLFormElement>(null);

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
          <p className="text-xs text-ink-muted">One click logs the call.</p>
          <div className="flex flex-wrap gap-1.5">
            {dispositions.map((d) => (
              <button
                key={d.id}
                name="disposition_id"
                value={d.id}
                disabled={pending}
                className="rounded-md border border-border bg-paper px-2.5 py-1.5 text-sm text-ink transition-colors hover:border-navy-700 hover:bg-navy-100 disabled:opacity-50"
              >
                {d.label}
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
