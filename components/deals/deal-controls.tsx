"use client";

import { useActionState, useState } from "react";
import {
  changeStage, assignDeal, updateQualification, type DealActionState,
} from "@/lib/actions/deals";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import { Field, inputBase, inputClass } from "@/components/ui/field";
import { STAGE_LABELS } from "@/lib/config/design-tokens";
import type { DealStage } from "@/lib/domain/stages";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import type { ListValue } from "@/lib/types";

function Note({ state }: { state: DealActionState }) {
  if (state.error) return <p role="alert" className="mt-2 rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger">{state.error}</p>;
  if (state.message) return <p className="mt-2 rounded-md bg-success/10 px-3 py-1.5 text-sm text-success">{state.message}</p>;
  return null;
}

/* -------------------------------------------------------------- stage */

export function StageControl({
  dealId, stage, allowed, lossReasons, notPursuedReasons,
}: {
  dealId: string;
  stage: DealStage;
  allowed: DealStage[];
  lossReasons: ListValue[];
  notPursuedReasons: ListValue[];
}) {
  const [state, action, pending] = useActionState<DealActionState, FormData>(changeStage, {});
  const [target, setTarget] = useState<DealStage | "">("");
  useDealChanged(state);

  const needsReason = target === "lost" || target === "not_pursued";
  const reasons = target === "lost" ? lossReasons : notPursuedReasons;

  if (allowed.length === 0) {
    return (
      <Card title="Stage">
        <p className="text-sm text-ink-muted">
          {stage === "won" ? "This deal is won. Nothing further to change." : "No moves available from here."}
        </p>
      </Card>
    );
  }

  return (
    <Card title="Move this deal">
      <form action={action} className="space-y-3">
        <input type="hidden" name="deal_id" value={dealId} />

        <div className="flex flex-wrap gap-1.5">
          {allowed.map((s) => (
            <button
              key={s} type="button" onClick={() => setTarget(target === s ? "" : s)}
              className={`rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                target === s
                  ? "border-navy-900 bg-navy-900 font-medium text-white"
                  : "border-border bg-paper text-ink hover:border-navy-700 hover:bg-navy-100"
              }`}
            >
              {STAGE_LABELS[s]}
            </button>
          ))}
        </div>

        {target && <input type="hidden" name="to_stage" value={target} />}

        {target === "nurture" && (
          <Field label="Bring this back on" htmlFor="nurture_wake_at"
                 hint="It leaves the active list until then, and returns to the queue that morning.">
            <input id="nurture_wake_at" name="nurture_wake_at" type="date" required className={`${inputBase} w-48`} />
          </Field>
        )}

        {target === "won" && (
          <Field label="Advance received" htmlFor="advance_amount"
                 hint="Won means the money arrived. Recording it is what makes the figure real.">
            <input id="advance_amount" name="advance_amount" type="number" min={1} required
                   placeholder="50000" className={`${inputBase} w-48`} />
          </Field>
        )}

        {needsReason && (
          <>
            <Field label="Reason" htmlFor="reason_id">
              <select id="reason_id" name="reason_id" required className={inputClass}>
                <option value="">Choose one…</option>
                {reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
            <textarea name="reason_notes" rows={2} placeholder="Anything to add (optional)"
                      className={`${inputClass} text-sm`} />
          </>
        )}

        {target && (
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Moving…" : `Move to ${STAGE_LABELS[target]}`}
          </Button>
        )}

        <Note state={state} />
      </form>
    </Card>
  );
}

/* --------------------------------------------------------- assignment */

export function AssignControl({
  dealId, crmOwnerId, repOwnerId, crmManagers, reps, canAssignManager, canAssignRep,
}: {
  dealId: string;
  crmOwnerId: string | null;
  repOwnerId: string | null;
  crmManagers: { id: string; name: string }[];
  reps: { id: string; name: string }[];
  canAssignManager: boolean;
  canAssignRep: boolean;
}) {
  const [state, action] = useActionState<DealActionState, FormData>(assignDeal, {});
  useDealChanged(state);
  if (!canAssignManager && !canAssignRep) return null;

  return (
    <Card title="Who is on this">
      <div className="space-y-3">
        {canAssignManager && (
          <form action={action}>
            <input type="hidden" name="deal_id" value={dealId} />
            <input type="hidden" name="as_role" value="crm_manager" />
            <Field label="CRM Manager" htmlFor="crm_owner">
              <select id="crm_owner" name="user_id" defaultValue={crmOwnerId ?? ""} className={inputClass}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="">Nobody</option>
                {crmManagers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </form>
        )}

        {canAssignRep && (
          <form action={action}>
            <input type="hidden" name="deal_id" value={dealId} />
            <input type="hidden" name="as_role" value="sales_rep" />
            <Field label="Sales Rep" htmlFor="rep_owner">
              <select id="rep_owner" name="user_id" defaultValue={repOwnerId ?? ""} className={inputClass}
                      onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="">Nobody</option>
                {reps.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </Field>
          </form>
        )}
        <Note state={state} />
      </div>
    </Card>
  );
}

/* ------------------------------------------------------- qualification */

export function QualificationPanel({
  dealId, deal, lists, requiredFields, editable,
}: {
  dealId: string;
  deal: Record<string, unknown>;
  lists: Record<string, ListValue[]>;
  requiredFields: string[];
  editable: boolean;
}) {
  const filled = [
    "floors", "property_type_id", "building_subtype_id", "lift_mechanism_id",
    "construction_status_id", "space_available_id", "budget_amount", "site_address",
  ].filter((f) => deal[f] !== null && deal[f] !== undefined && deal[f] !== "").length;

  const missing = requiredFields.filter((f) => deal[f] === null || deal[f] === undefined || deal[f] === "");
  const [state, action, pending] = useActionState<DealActionState, FormData>(updateQualification, {});
  useDealChanged(state);

  const select = (name: string, label: string, listType: string) => (
    <Field key={name} label={label} htmlFor={name}>
      <select id={name} name={name} defaultValue={String(deal[name] ?? "")} disabled={!editable} className={inputClass}>
        <option value="">—</option>
        {(lists[listType] ?? []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
    </Field>
  );

  return (
    <Card
      title="Site details"
      description={`${filled} of 8 filled${missing.length ? ` · ${missing.length} needed before booking a visit` : ""}`}
    >
      {/* Always open. It was collapsed so it could never stand between the user
          and logging a call, but the call panel is no longer underneath it —
          hiding it only meant a click to find out there was nothing to see. */}
      <form action={action} className="space-y-3">
        <input type="hidden" name="deal_id" value={dealId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Floors" htmlFor="floors">
            <input id="floors" name="floors" type="number" min={0} defaultValue={String(deal.floors ?? "")}
                   disabled={!editable} className={inputClass} />
          </Field>
          {select("property_type_id", "Property type", "property_type")}
          {select("building_subtype_id", "Building type", "building_subtype")}
          {select("lift_mechanism_id", "Lift mechanism", "lift_mechanism")}
          {select("construction_status_id", "Construction status", "construction_status")}
          {select("space_available_id", "Space available", "space_available")}
          <Field label="Number of lifts" htmlFor="num_lifts">
            <input id="num_lifts" name="num_lifts" type="number" min={1} defaultValue={String(deal.num_lifts ?? "")}
                   disabled={!editable} className={inputClass} />
          </Field>
          <Field label="Budget" htmlFor="budget_amount">
            <input id="budget_amount" name="budget_amount" type="number" min={0}
                   defaultValue={String(deal.budget_amount ?? "")} disabled={!editable} className={inputClass} />
          </Field>
          <Field label="Timeline" htmlFor="timeline_months" hint="Free text — 2 months, next year, whenever">
            <input id="timeline_months" name="timeline_months" defaultValue={String(deal.timeline_months ?? "")}
                   disabled={!editable} className={inputClass} />
          </Field>
          <Field label="Space they have" htmlFor="minimum_space" hint="Free text — a sales reference, not a spec">
            <input id="minimum_space" name="minimum_space" defaultValue={String(deal.minimum_space ?? "")}
                   disabled={!editable} className={inputClass} />
          </Field>
        </div>
        <Field label="Site address" htmlFor="site_address">
          <textarea id="site_address" name="site_address" rows={2} defaultValue={String(deal.site_address ?? "")}
                    disabled={!editable} className={inputClass} />
        </Field>
        {editable && <Button type="submit" size="sm" variant="secondary" disabled={pending}>Save</Button>}
        <Note state={state} />
      </form>
    </Card>
  );
}
