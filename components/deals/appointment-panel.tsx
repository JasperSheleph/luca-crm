"use client";

import { useActionState, useState } from "react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { inputClass } from "@/components/ui/field";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import {
  scheduleAppointment, rescheduleAppointment, setAppointmentStatus, type AppointmentState,
} from "@/lib/actions/appointments";
import { formatDateTime } from "@/lib/config/design-tokens";
import type { Appointment, AppointmentStatus } from "@/lib/types";

const STATUS_TONE: Record<AppointmentStatus, "neutral" | "warning" | "success"> = {
  scheduled: "neutral", confirmed: "success", rescheduled: "warning",
  completed: "success", cancelled: "neutral", no_show: "warning",
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Booked", confirmed: "Confirmed", rescheduled: "Moved",
  completed: "Done", cancelled: "Cancelled", no_show: "No show",
};

/** An appointment still worth acting on — cancelled and completed are history. */
const LIVE: AppointmentStatus[] = ["scheduled", "confirmed", "rescheduled"];

export default function AppointmentPanel({
  dealId, appointments, reps, defaultRepId, canSchedule,
}: {
  dealId: string;
  appointments: (Appointment & { rep_name: string | null })[];
  reps: { id: string; name: string }[];
  defaultRepId: string | null;
  canSchedule: boolean;
}) {
  const [bookState, bookAction, booking] = useActionState<AppointmentState, FormData>(scheduleAppointment, {});
  const [moveState, moveAction, moving] = useActionState<AppointmentState, FormData>(rescheduleAppointment, {});
  const [statusState, statusAction] = useActionState<AppointmentState, FormData>(setAppointmentStatus, {});
  useDealChanged(bookState);
  useDealChanged(moveState);
  useDealChanged(statusState);

  const [showBookForm, setShowBookForm] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const live = appointments.find((a) => LIVE.includes(a.status)) ?? null;
  const past = appointments.filter((a) => a !== live);
  const error = bookState.error ?? moveState.error ?? statusState.error;

  return (
    <Card
      title="Appointment"
      description={live ? undefined : "No visit booked"}
      actions={
        canSchedule && !live && !showBookForm ? (
          <Button size="sm" variant="secondary" onClick={() => setShowBookForm(true)}>Book a visit</Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {live && (
          <div className="space-y-2 rounded-md border border-border bg-navy-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{formatDateTime(live.scheduled_at)}</span>
              <Badge tone={STATUS_TONE[live.status]}>{STATUS_LABEL[live.status]}</Badge>
              {live.rep_name && <span className="text-xs text-ink-muted">{live.rep_name}</span>}
            </div>

            {live.reschedule_reason && (
              <p className="text-xs text-ink-muted">Moved: {live.reschedule_reason}</p>
            )}

            {canSchedule && (
              <div className="flex flex-wrap gap-1.5">
                {live.status !== "confirmed" && (
                  <form action={statusAction}>
                    <input type="hidden" name="deal_id" value={dealId} />
                    <input type="hidden" name="appointment_id" value={live.id} />
                    <input type="hidden" name="status" value="confirmed" />
                    <Button size="sm" variant="secondary">Confirm</Button>
                  </form>
                )}
                <Button
                  size="sm" variant="secondary"
                  onClick={() => setMovingId(movingId === live.id ? null : live.id)}
                >
                  Reschedule
                </Button>
                <form action={statusAction}>
                  <input type="hidden" name="deal_id" value={dealId} />
                  <input type="hidden" name="appointment_id" value={live.id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <Button size="sm" variant="ghost">Cancel</Button>
                </form>
              </div>
            )}

            {movingId === live.id && (
              <form action={moveAction} className="space-y-2 border-t border-border pt-2">
                <input type="hidden" name="deal_id" value={dealId} />
                <input type="hidden" name="appointment_id" value={live.id} />
                <input
                  type="datetime-local" name="scheduled_at" required
                  className={`${inputClass} text-sm`} aria-label="New date and time"
                />
                {/* Mandatory on purpose: a repeatedly moved visit is the
                    commonest way a deal quietly dies, and the reason is the
                    only thing that makes the pattern visible later. */}
                <input
                  name="reschedule_reason" required placeholder="Why is it moving?"
                  className={`${inputClass} text-sm`}
                />
                <Button size="sm" disabled={moving}>{moving ? "Moving…" : "Move visit"}</Button>
              </form>
            )}
          </div>
        )}

        {canSchedule && !live && showBookForm && (
          <form action={bookAction} className="space-y-2">
            <input type="hidden" name="deal_id" value={dealId} />
            <input
              type="datetime-local" name="scheduled_at" required
              className={`${inputClass} text-sm`} aria-label="Date and time"
            />
            <select name="rep_id" defaultValue={defaultRepId ?? ""} className={`${inputClass} text-sm`} aria-label="Rep">
              <option value="">Whoever owns it</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button size="sm" disabled={booking}>{booking ? "Booking…" : "Book"}</Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setShowBookForm(false)}>Cancel</Button>
            </div>
            <p className="text-xs text-ink-muted">
              Booking moves the deal to Appointment Scheduled, which needs the qualification
              fields filled first.
            </p>
          </form>
        )}

        {past.length > 0 && (
          <ul className="space-y-1 text-xs text-ink-muted">
            {past.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                <span className="tabular">{formatDateTime(a.scheduled_at)}</span>
                <Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
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
