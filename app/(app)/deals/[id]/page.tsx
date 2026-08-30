import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/db/server";
import { getDeal, getTimeline, getCustomerHistory } from "@/lib/queries/deals";
import { getDealWork } from "@/lib/queries/visits";
import { getListValuesFor } from "@/lib/queries/settings";
import { can, canViewDeal } from "@/lib/domain/permissions";
import { allowedTransitions } from "@/lib/domain/stages";
import { telHref } from "@/lib/domain/phone";
import { formatAmount, formatDate, STAGE_LABELS } from "@/lib/config/design-tokens";
import PageHeader from "@/components/ui/page-header";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import StageBadge from "@/components/deals/stage-badge";
import Timeline from "@/components/deals/timeline";
import LogActivity from "@/components/deals/log-activity";
import {
  StageControl, AssignControl, NextActionControl, QualificationPanel,
} from "@/components/deals/deal-controls";
import AppointmentPanel from "@/components/deals/appointment-panel";
import VisitPanel from "@/components/deals/visit-panel";
import VerificationPanel from "@/components/deals/verification-panel";
import QuotesPanel from "@/components/deals/quotes-panel";
import { age } from "@/components/deals/relative-time";

const LISTS = [
  "call_disposition", "property_type", "building_subtype", "lift_mechanism",
  "construction_status", "space_available", "loss_reason", "not_pursued_reason",
];

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const deal = await getDeal(id);
  if (!deal || !canViewDeal(user, deal)) notFound();

  const supabase = await createClient();
  const [timeline, lists, history, work, { data: staff }, { data: setting }] = await Promise.all([
    getTimeline(id),
    getListValuesFor(LISTS),
    getCustomerHistory(deal.customer_id, id),
    getDealWork(id),
    supabase.from("users").select("id, name, role").eq("is_active", true).order("name"),
    supabase.from("app_settings").select("value").eq("key", "required_fields_for_appointment").maybeSingle(),
  ]);

  const requiredFields = (setting?.value as string[]) ?? [];
  const allowed = allowedTransitions({
    role: user.role,
    requiredFieldsForAppointment: requiredFields,
    deal: deal as never,
    // Both are collected in the form; this only decides which buttons appear.
    reasonId: 1,
    advanceAmount: 1,
  });

  const crmManagers = (staff ?? []).filter((u) => u.role === "crm_manager" || u.role === "admin");
  const reps = (staff ?? []).filter((u) => u.role === "sales_rep");
  const tel = telHref(deal.customer_phone);

  // The visit a check-in should attach itself to. Cancelled and completed ones
  // are history and must not capture a new visit.
  const liveAppointment = work.appointments.find((a) =>
    ["scheduled", "confirmed", "rescheduled"].includes(a.status),
  );

  return (
    <>
      <PageHeader
        title={deal.customer_name || "Unnamed lead"}
        subtitle={[deal.city, deal.source_label, deal.campaign_name].filter(Boolean).join(" · ") || undefined}
        actions={
          <Link href="/deals" className="text-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline">
            ← All deals
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-paper px-4 py-3">
        <StageBadge stage={deal.stage} firstContactedAt={deal.first_contacted_at} />
        {tel ? (
          <a href={tel} className="tabular text-sm font-medium text-navy-700 hover:underline">
            {deal.customer_phone}
          </a>
        ) : (
          <span className="tabular text-sm text-ink-muted">{deal.customer_phone}</span>
        )}
        {deal.invalid_phone && <Badge tone="warning">Number needs checking</Badge>}
        {deal.is_repeat && <Badge tone="neutral">Repeat enquiry</Badge>}
        {deal.is_outstation && <Badge tone="neutral">Outstation</Badge>}
        {deal.customer_email && <span className="text-sm text-ink-muted">{deal.customer_email}</span>}

        <span className="ml-auto flex flex-wrap gap-x-4 text-xs text-ink-muted">
          <span>Enquired {formatDate(deal.created_at)} · <strong className="text-ink">{age(deal.created_at)}</strong> old</span>
          <span>
            {deal.first_contacted_at
              ? `First called ${formatDate(deal.first_contacted_at)}`
              : <strong className="text-warning">Never called</strong>}
          </span>
          {deal.budget_amount ? <span>Budget {formatAmount(deal.budget_amount)}</span> : null}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <Card title="Log what happened">
            <LogActivity dealId={id} dispositions={lists.call_disposition ?? []} />
          </Card>

          <AppointmentPanel
            dealId={id}
            appointments={work.appointments}
            reps={reps}
            defaultRepId={deal.rep_owner_id}
            canSchedule={can(user, "schedule_appointment", deal)}
          />

          <VisitPanel
            dealId={id}
            visits={work.visits}
            photos={work.photos}
            appointmentId={liveAppointment?.id ?? null}
            canCheckIn={can(user, "check_in_visit", deal)}
          />

          <VerificationPanel
            dealId={id}
            status={deal.visit_verification_status}
            verifications={work.verifications}
            canVerify={can(user, "run_verification_call", deal)}
            canResolve={can(user, "resolve_failed_verification", deal)}
          />

          <QuotesPanel
            dealId={id}
            quotes={work.quotes}
            canUpload={can(user, "upload_quote", deal)}
          />

          <Card title="History" description={`${timeline.length} entr${timeline.length === 1 ? "y" : "ies"}, newest first`}>
            <Timeline entries={timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <StageControl
            dealId={id}
            stage={deal.stage}
            allowed={allowed}
            lossReasons={lists.loss_reason ?? []}
            notPursuedReasons={lists.not_pursued_reason ?? []}
          />

          <NextActionControl dealId={id} at={deal.next_action_at} note={deal.next_action_note} />

          <AssignControl
            dealId={id}
            crmOwnerId={deal.crm_owner_id}
            repOwnerId={deal.rep_owner_id}
            crmManagers={crmManagers}
            reps={reps}
            canAssignManager={can(user, "assign_lead_to_crm_manager")}
            canAssignRep={can(user, "assign_lead_to_rep")}
          />

          <QualificationPanel
            dealId={id}
            deal={deal as unknown as Record<string, unknown>}
            lists={lists}
            requiredFields={requiredFields}
            editable={can(user, "edit_qualification", deal)}
          />

          {history.length > 0 && (
            <Card title="Earlier enquiries" description="Same phone number, previous deals">
              <ul className="space-y-1.5 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <Link href={`/deals/${h.id}`} className="text-navy-700 hover:underline">
                      {formatDate(h.created_at)}
                    </Link>
                    <span className="text-ink-muted"> · {STAGE_LABELS[h.stage as keyof typeof STAGE_LABELS]}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
