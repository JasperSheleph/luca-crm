"use client";

import { useActionState, useRef, useState } from "react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import { inputClass } from "@/components/ui/field";
import { useDealChanged } from "@/components/deals/use-deal-changed";
import { VisitPhoto } from "@/components/deals/secure-file";
import { compressImage } from "@/components/deals/compress-image";
import { startVisit, completeVisit, uploadVisitPhoto, type VisitState } from "@/lib/actions/visits";
import { formatDateTime } from "@/lib/config/design-tokens";
import type { Visit, Attachment } from "@/lib/types";

const MAX_PHOTOS = 5;

/** How long to wait for a fix before going ahead without one. */
const GEO_TIMEOUT_MS = 8000;

/**
 * Reads the phone's position, and gives up rather than blocking.
 *
 * Geolocation is a deterrent, not proof — it is trivially spoofable, and the
 * verification call is the real control. A rep in a basement with no fix still
 * has to be able to check in; refusing would only teach them to stop using the
 * app, which costs far more than an unlocated visit.
 */
function position(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

export default function VisitPanel({
  dealId, visits, photos, appointmentId, canCheckIn,
}: {
  dealId: string;
  visits: Visit[];
  photos: Attachment[];
  /** The appointment being visited, so check-out can close it too. */
  appointmentId: string | null;
  canCheckIn: boolean;
}) {
  const [startState, startAction] = useActionState<VisitState, FormData>(startVisit, {});
  const [endState, endAction] = useActionState<VisitState, FormData>(completeVisit, {});
  const [photoState, photoAction, photoPending] = useActionState<VisitState, FormData>(uploadVisitPhoto, {});
  useDealChanged(startState);
  useDealChanged(endState);
  useDealChanged(photoState);

  const startRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLFormElement>(null);
  const photoRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [locating, setLocating] = useState(false);

  const open = visits.find((v) => !v.completed_at) ?? null;
  const done = visits.filter((v) => v.completed_at);

  /**
   * Fetch the position, put it in the form, then submit.
   *
   * The click cannot submit directly: getCurrentPosition is async and a native
   * submit would have fired long before the fix arrives.
   */
  const submitWithPosition = async (
    form: HTMLFormElement | null, prefix: "start" | "end",
  ) => {
    if (!form) return;
    setLocating(true);
    const at = await position();
    setLocating(false);
    (form.elements.namedItem(`${prefix}_lat`) as HTMLInputElement).value = at ? String(at.lat) : "";
    (form.elements.namedItem(`${prefix}_lng`) as HTMLInputElement).value = at ? String(at.lng) : "";
    form.requestSubmit();
  };

  const addPhoto = async (file: File) => {
    const compressed = await compressImage(file);
    const data = new DataTransfer();
    data.items.add(compressed);
    fileRef.current!.files = data.files;
    photoRef.current?.requestSubmit();
  };

  const error = startState.error ?? endState.error ?? photoState.error;

  return (
    <Card
      title="Site visit"
      description={open ? "Checked in — check out when you leave" : done.length ? "Completed" : undefined}
    >
      <div className="space-y-3">
        {!open && done.length === 0 && !canCheckIn && (
          <p className="text-sm text-ink-muted">
            No visit yet. The rep this deal is assigned to checks in from their phone.
          </p>
        )}

        {!open && canCheckIn && (
          <form ref={startRef} action={startAction}>
            <input type="hidden" name="deal_id" value={dealId} />
            <input type="hidden" name="appointment_id" value={appointmentId ?? ""} />
            <input type="hidden" name="start_lat" defaultValue="" />
            <input type="hidden" name="start_lng" defaultValue="" />
            <Button
              type="button" size="sm" disabled={locating}
              onClick={() => submitWithPosition(startRef.current, "start")}
            >
              {locating ? "Finding you…" : done.length ? "Check in again" : "Check in"}
            </Button>
            <p className="mt-1.5 text-xs text-ink-muted">
              Records where and when. Works without location if you decline.
            </p>
          </form>
        )}

        {open && (
          <>
            <p className="text-xs text-ink-muted">
              Checked in {formatDateTime(open.started_at)}
              {open.start_lat === null && " · no location"}
            </p>

            {canCheckIn && (
              <form ref={endRef} action={endAction} className="space-y-2">
                <input type="hidden" name="deal_id" value={dealId} />
                <input type="hidden" name="visit_id" value={open.id} />
                <input type="hidden" name="appointment_id" value={open.appointment_id ?? ""} />
                <input type="hidden" name="end_lat" defaultValue="" />
                <input type="hidden" name="end_lng" defaultValue="" />
                <textarea
                  name="notes" rows={3} required
                  placeholder="What did you find? Shaft, floors, access, what they asked for."
                  className={`${inputClass} text-sm`}
                />
                <Button
                  type="button" size="sm" disabled={locating}
                  onClick={() => submitWithPosition(endRef.current, "end")}
                >
                  {locating ? "Finding you…" : "Check out"}
                </Button>
                <p className="text-xs text-ink-muted">
                  Checking out asks the office to ring the customer and confirm the visit.
                </p>
              </form>
            )}
          </>
        )}

        {done.map((v) => (
          <div key={v.id} className="rounded-md border border-border bg-navy-50 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-ink">Visit complete</span>
              <span className="tabular text-xs text-ink-muted">{formatDateTime(v.completed_at)}</span>
              {v.start_lat === null && <Badge tone="neutral">no location</Badge>}
            </div>
            {v.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{v.notes}</p>}
          </div>
        ))}

        {(photos.length > 0 || (canCheckIn && (open || done.length > 0))) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink">
              Photos <span className="font-normal text-ink-muted">{photos.length} of {MAX_PHOTOS}</span>
            </p>

            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => <VisitPhoto key={p.id} path={p.file_url} alt="Site photo" />)}
              </div>
            )}

            {canCheckIn && photos.length < MAX_PHOTOS && (
              <form ref={photoRef} action={photoAction}>
                <input type="hidden" name="deal_id" value={dealId} />
                <input ref={fileRef} type="file" name="photo" className="hidden" />
                <label className="inline-block">
                  <span
                    className={`inline-flex cursor-pointer items-center rounded-md border border-border bg-paper px-2.5 py-1 text-xs font-medium text-ink hover:bg-navy-50 ${
                      photoPending ? "opacity-50" : ""
                    }`}
                  >
                    {photoPending ? "Uploading…" : "Add a photo"}
                  </span>
                  <input
                    type="file" accept="image/*" capture="environment" className="sr-only"
                    disabled={photoPending}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void addPhoto(f);
                    }}
                  />
                </label>
                <p className="mt-1 text-xs text-ink-muted">Shrunk on your phone before sending.</p>
              </form>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-1.5 text-sm text-danger">{error}</p>
        )}
      </div>
    </Card>
  );
}
