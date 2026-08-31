import { createClient } from "@/lib/db/server";
import { istParts } from "@/lib/domain/notifications";
import type {
  Appointment, Visit, VisitVerification, Quote, Attachment,
} from "@/lib/types";

/**
 * Everything hanging off one deal that steps 5 and 6 own: the appointments,
 * the visits and their photos, the verification calls, the quotes.
 *
 * One round trip rather than five, because the deal page and the rep's phone
 * both need the lot and a phone on 4G feels every extra request.
 *
 * RLS scopes all of it — a rep sees these only for a deal they own.
 */

export interface DealWorkRow {
  appointments: (Appointment & { rep_name: string | null })[];
  visits: Visit[];
  photos: Attachment[];
  verifications: (VisitVerification & { verified_by_name: string | null })[];
  quotes: Quote[];
}

export async function getDealWork(dealId: string): Promise<DealWorkRow> {
  const supabase = await createClient();

  const [appointments, visits, photos, verifications, quotes] = await Promise.all([
    supabase.from("appointments")
      .select("*, rep:users!appointments_rep_id_fkey(name)")
      .eq("deal_id", dealId).order("scheduled_at", { ascending: false }),
    supabase.from("visits")
      .select("*").eq("deal_id", dealId).order("started_at", { ascending: false }),
    supabase.from("attachments")
      .select("*").eq("deal_id", dealId).eq("type", "visit_photo")
      .order("uploaded_at", { ascending: false }),
    supabase.from("visit_verifications")
      .select("*, verifier:users!visit_verifications_verified_by_fkey(name)")
      .eq("deal_id", dealId).order("called_at", { ascending: false }),
    supabase.from("quotes")
      .select("*").eq("deal_id", dealId).order("version_no", { ascending: false }),
  ]);

  return {
    appointments: (appointments.data ?? []).map((a) => {
      const { rep, ...rest } = a as typeof a & { rep: { name: string } | null };
      return { ...rest, rep_name: rep?.name ?? null } as Appointment & { rep_name: string | null };
    }),
    visits: (visits.data ?? []) as Visit[],
    photos: (photos.data ?? []) as Attachment[],
    verifications: (verifications.data ?? []).map((v) => {
      const { verifier, ...rest } = v as typeof v & { verifier: { name: string } | null };
      return { ...rest, verified_by_name: verifier?.name ?? null } as
        VisitVerification & { verified_by_name: string | null };
    }),
    quotes: (quotes.data ?? []) as Quote[],
  };
}

export interface TodayRow {
  appointment: Appointment;
  deal_id: string;
  customer_name: string | null;
  customer_phone: string;
  city: string | null;
  site_address: string | null;
  /** The open visit for this appointment, if the rep has already checked in. */
  visit: Visit | null;
}

/**
 * The rep's day: appointments falling on today in IST.
 *
 * The window is computed in India, not UTC. A 09:00 IST appointment is 03:30
 * UTC the same day, but a 23:00 IST one is 17:30 UTC — take a naive UTC day and
 * the late ones fall off the end of the list.
 *
 * RLS already limits this to the signed-in rep's deals, so there is no rep_id
 * filter here; an admin looking at this page would see everyone's, which is
 * why /today is a rep route.
 */
export async function getToday(): Promise<TodayRow[]> {
  const supabase = await createClient();
  const ymd = istParts(new Date()).ymd;

  const { data } = await supabase
    .from("appointments")
    .select("*, deal:deals!inner(id, site_address, city, customer:customers!inner(name, phone_normalized))")
    .gte("scheduled_at", `${ymd}T00:00:00+05:30`)
    .lte("scheduled_at", `${ymd}T23:59:59+05:30`)
    .not("status", "in", "(cancelled,completed)")
    .order("scheduled_at");

  const rows = (data ?? []) as unknown as (Appointment & {
    deal: { id: string; site_address: string | null; city: string | null;
            customer: { name: string | null; phone_normalized: string } };
  })[];
  if (rows.length === 0) return [];

  // The check-in state of each appointment, so the page knows whether to offer
  // "Check in" or "Check out" without a request per row.
  const { data: visits } = await supabase
    .from("visits").select("*").in("appointment_id", rows.map((r) => r.id));
  const byAppointment = new Map((visits ?? []).map((v) => [(v as Visit).appointment_id, v as Visit]));

  return rows.map(({ deal, ...appointment }) => ({
    appointment: appointment as Appointment,
    deal_id: deal.id,
    customer_name: deal.customer.name,
    customer_phone: deal.customer.phone_normalized,
    city: deal.city,
    site_address: deal.site_address,
    visit: byAppointment.get(appointment.id) ?? null,
  }));
}

/**
 * Deals the rep owns whose follow-up date has passed. The second half of
 * /today: an appointment is a commitment to someone else, an overdue next
 * action is a commitment to yourself, and both belong on the same screen.
 */
export async function getOverdueForMe() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deal_list_view")
    .select("id, customer_name, customer_phone, city, stage, next_action_at, next_action_note")
    .lt("next_action_at", new Date().toISOString())
    .not("stage", "in", "(won,lost,not_pursued)")
    .order("next_action_at");
  return data ?? [];
}

/**
 * Just the verification calls. The slide-over needs these and nothing else
 * from this module: the Awaiting-verification queue exists so the CRM Manager
 * can ring down it, and making her open the full deal page each time would
 * undo the point of working from a list.
 */
export async function getVerifications(
  dealId: string,
): Promise<(VisitVerification & { verified_by_name: string | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visit_verifications")
    .select("*, verifier:users!visit_verifications_verified_by_fkey(name)")
    .eq("deal_id", dealId).order("called_at", { ascending: false });

  return (data ?? []).map((v) => {
    const { verifier, ...rest } = v as typeof v & { verifier: { name: string } | null };
    return { ...rest, verified_by_name: verifier?.name ?? null } as
      VisitVerification & { verified_by_name: string | null };
  });
}
