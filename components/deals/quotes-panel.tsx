"use client";

import { useActionState, useState } from "react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { inputClass } from "@/components/ui/field";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import { QuoteFile } from "@/components/deals/secure-file";
import { uploadQuote, type QuoteState } from "@/lib/actions/quotes";
import { formatAmount, formatDate } from "@/lib/config/design-tokens";
import type { Quote } from "@/lib/types";

/**
 * Quotes, versioned rather than replaced.
 *
 * LUCA quote in rounds, and "what did we send them in March" is a question the
 * spreadsheet could never answer. The newest shows; older ones collapse under
 * it. Any file type — they quote from Excel, print to PDF sometimes, and
 * occasionally photograph a printed sheet.
 */
export default function QuotesPanel({
  dealId, quotes, canUpload,
}: {
  dealId: string;
  quotes: Quote[];
  canUpload: boolean;
}) {
  const [state, action, pending] = useActionState<QuoteState, FormData>(uploadQuote, {});
  useDealChanged(state);
  const [adding, setAdding] = useState(false);

  const [latest, ...older] = quotes;
  const [showOlder, setShowOlder] = useState(false);

  return (
    <Card
      title="Quotes"
      description={quotes.length ? `${quotes.length} version${quotes.length === 1 ? "" : "s"}` : "None sent"}
      actions={
        canUpload && !adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            {quotes.length ? "New version" : "Add a quote"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {latest && (
          <div className="rounded-md border border-border bg-navy-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{formatAmount(latest.amount)}</span>
              <Badge tone="neutral">v{latest.version_no}</Badge>
              {latest.is_final && <Badge tone="success">final</Badge>}
              <span className="text-xs text-ink-muted">{formatDate(latest.sent_at)}</span>
            </div>
            {latest.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{latest.notes}</p>}
            {latest.file_url && (
              <p className="mt-1"><QuoteFile path={latest.file_url} label="Open the file" /></p>
            )}
          </div>
        )}

        {canUpload && adding && (
          <form action={action} className="space-y-2">
            <input type="hidden" name="deal_id" value={dealId} />
            <input
              name="amount" type="number" min="1" step="1" required placeholder="Amount quoted (₹)"
              className={`${inputClass} text-sm`} aria-label="Amount quoted"
            />
            <input
              type="file" name="file"
              className="block w-full text-xs text-ink-muted file:mr-2 file:rounded-md file:border file:border-border file:bg-paper file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink"
              aria-label="Quote file"
            />
            <textarea
              name="notes" rows={2} placeholder="Anything worth remembering (optional)"
              className={`${inputClass} text-sm`}
            />
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" name="is_final" /> This is the final quote
            </label>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending}>{pending ? "Saving…" : "Save quote"}</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-ink-muted">
              The first quote moves the deal to Quote Sent, which needs the site visit
              verified with the customer first.
            </p>
          </form>
        )}

        {older.length > 0 && (
          <div>
            <button
              type="button" onClick={() => setShowOlder((v) => !v)}
              className="text-xs text-navy-700 hover:underline"
            >
              {showOlder ? "Hide" : `Show ${older.length} earlier version${older.length === 1 ? "" : "s"}`}
            </button>
            {showOlder && (
              <ul className="mt-2 space-y-1.5">
                {older.map((qt) => (
                  <li key={qt.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <span className="tabular">v{qt.version_no}</span>
                    <span className="font-medium text-ink">{formatAmount(qt.amount)}</span>
                    <span>{formatDate(qt.sent_at)}</span>
                    {qt.file_url && <QuoteFile path={qt.file_url} label="file" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {state.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger">{state.error}</p>
        )}
      </div>
    </Card>
  );
}
