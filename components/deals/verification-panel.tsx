"use client";

import { useActionState } from "react";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { inputClass } from "@/components/ui/field";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import {
  recordVerification, resolveVerification, type VerificationState,
} from "@/lib/actions/verification";
import { formatDateTime } from "@/lib/config/design-tokens";
import type { VerificationStatus, VisitVerification } from "@/lib/types";

const STATUS: Record<VerificationStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
  not_required: { label: "Not needed",  tone: "neutral" },
  pending:      { label: "Awaiting call", tone: "warning" },
  confirmed:    { label: "Confirmed",   tone: "success" },
  failed:       { label: "Failed — frozen", tone: "danger" },
  unreachable:  { label: "Unreachable", tone: "warning" },
};

/**
 * The verification gate.
 *
 * What it catches is a visit that was reported but never happened. It is not
 * theft prevention — a rep who wants to divert a lead simply never logs it, and
 * centralised intake is what stops that. Worth being straight about, because
 * the alternative is buying false comfort.
 */
export default function VerificationPanel({
  dealId, status, verifications, canVerify, canResolve,
}: {
  dealId: string;
  status: VerificationStatus;
  verifications: (VisitVerification & { verified_by_name: string | null })[];
  canVerify: boolean;
  canResolve: boolean;
}) {
  const [callState, callAction, calling] = useActionState<VerificationState, FormData>(recordVerification, {});
  const [fixState, fixAction, fixing] = useActionState<VerificationState, FormData>(resolveVerification, {});
  useDealChanged(callState);
  useDealChanged(fixState);

  const meta = STATUS[status];
  const frozen = status === "failed";
  const error = callState.error ?? fixState.error;

  // Nothing to verify and nothing to show: a deal nobody has visited yet.
  if (status === "not_required" && verifications.length === 0 && !canVerify) return null;

  return (
    <Card title="Verification" actions={<Badge tone={meta.tone}>{meta.label}</Badge>}>
      <div className="space-y-3">
        {frozen && (
          <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            The customer did not confirm this visit. Nothing moves until an admin resolves it.
          </p>
        )}

        {canVerify && !frozen && (
          <form action={callAction} className="space-y-2">
            <input type="hidden" name="deal_id" value={dealId} />
            <p className="text-xs text-ink-muted">
              {status === "pending"
                ? "Ring the customer and record what they say."
                : "Record another verification call."}
            </p>
            <textarea
              name="notes" rows={2} placeholder="What did they say? (required if it failed)"
              className={`${inputClass} text-sm`}
            />
            <div className="flex flex-wrap gap-1.5">
              {(["confirmed", "unreachable", "failed"] as const).map((o) => (
                <button
                  key={o} name="outcome" value={o} disabled={calling}
                  className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors disabled:opacity-50 ${
                    o === "failed"
                      ? "border-danger/40 text-danger hover:bg-danger/10"
                      : "border-border bg-paper text-ink hover:border-navy-700 hover:bg-navy-100"
                  }`}
                >
                  {o === "confirmed" ? "Visit happened" : o === "unreachable" ? "Could not reach" : "Says no visit"}
                </button>
              ))}
            </div>
          </form>
        )}

        {frozen && canResolve && (
          <form action={fixAction} className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-ink">Resolve</p>
            <textarea
              name="resolution_notes" rows={2} required
              placeholder="How was this resolved? Who did you speak to?"
              className={`${inputClass} text-sm`}
            />
            <div className="flex flex-wrap gap-1.5">
              {/* Never back to `failed`: that is the frozen state, and a deal
                  cannot sit there once a human has looked at it. */}
              <button
                name="resolution" value="confirmed" disabled={fixing}
                className="rounded-md border border-border bg-paper px-2.5 py-1.5 text-sm text-ink hover:border-navy-700 hover:bg-navy-100 disabled:opacity-50"
              >
                It did happen
              </button>
              <button
                name="resolution" value="not_required" disabled={fixing}
                className="rounded-md border border-border bg-paper px-2.5 py-1.5 text-sm text-ink hover:border-navy-700 hover:bg-navy-100 disabled:opacity-50"
              >
                Check does not apply
              </button>
            </div>
          </form>
        )}

        {frozen && !canResolve && (
          <p className="text-xs text-ink-muted">Only an admin can unfreeze this.</p>
        )}

        {verifications.length > 0 && (
          <ul className="space-y-2 border-t border-border pt-3">
            {verifications.map((v) => (
              <li key={v.id} className="text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-ink">{STATUS[v.outcome].label}</span>
                  <span className="tabular text-xs text-ink-muted">{formatDateTime(v.called_at)}</span>
                  {v.verified_by_name && <span className="text-xs text-ink-muted">· {v.verified_by_name}</span>}
                </div>
                {v.notes && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{v.notes}</p>}
                {v.resolution_notes && (
                  <p className="mt-0.5 rounded border border-border bg-navy-50 px-2 py-1 text-xs text-ink-muted">
                    Resolved {v.resolved_at ? formatDateTime(v.resolved_at) : ""}: {v.resolution_notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger">{error}</p>
        )}
      </div>
    </Card>
  );
}
