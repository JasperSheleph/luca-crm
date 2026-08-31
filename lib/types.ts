import type { DealStage } from "@/lib/domain/stages";
import type { Role } from "@/lib/domain/permissions";

export type { DealStage, Role };

export type VerificationStatus =
  | "not_required" | "pending" | "confirmed" | "failed" | "unreachable";

export type AppointmentStatus =
  | "scheduled" | "confirmed" | "rescheduled" | "completed" | "cancelled" | "no_show";

export type ActivityType =
  | "call" | "whatsapp" | "note" | "stage_change" | "assignment"
  | "appointment_set" | "appointment_changed" | "visit_started" | "visit_completed"
  | "demo_visit" | "commitment" | "quote_sent" | "verification_call" | "imported_note";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface ListValue {
  id: number;
  list_type: string;
  value: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

export interface Customer {
  id: string;
  phone_normalized: string;
  name: string | null;
  email: string | null;
  city: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  customer_id: string;
  source_id: number | null;
  stage: DealStage;
  is_repeat: boolean;
  invalid_phone: boolean;
  campaign_name: string | null;
  planning_to_install: boolean | null;
  external_id: string | null;
  crm_owner_id: string | null;
  rep_owner_id: string | null;
  floors: number | null;
  property_type_id: number | null;
  building_subtype_id: number | null;
  lift_mechanism_id: number | null;
  site_address: string | null;
  construction_status_id: number | null;
  space_available_id: number | null;
  minimum_space: string | null;
  timeline_months: string | null;
  budget_amount: number | null;
  num_lifts: number | null;
  city: string | null;
  city_normalized: string | null;
  is_outstation: boolean;
  next_action_at: string | null;
  next_action_note: string | null;
  nurture_wake_at: string | null;
  visit_verification_status: VerificationStatus;
  latest_quote_amount: number | null;
  first_contacted_at: string | null;
  created_at: string;
  advance_amount: number | null;
  advance_received_at: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason_id: number | null;
  lost_notes: string | null;
  not_pursued_reason_id: number | null;
  not_pursued_notes: string | null;
}

export interface Activity {
  id: number;
  deal_id: string;
  user_id: string | null;
  type: ActivityType;
  disposition_id: number | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  deal_id: string;
  rep_id: string | null;
  scheduled_at: string;
  status: AppointmentStatus;
  rescheduled_from: string | null;
  reschedule_reason: string | null;
  rep_confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Visit {
  id: string;
  deal_id: string;
  appointment_id: string | null;
  rep_id: string | null;
  started_at: string | null;
  start_lat: number | null;
  start_lng: number | null;
  completed_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
  notes: string | null;
}

export interface VisitVerification {
  id: number;
  deal_id: string;
  visit_id: string | null;
  verified_by: string | null;
  called_at: string;
  outcome: VerificationStatus;
  notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

export interface Quote {
  id: string;
  deal_id: string;
  version_no: number;
  /** A storage PATH inside the private `quotes` bucket, never a signed URL. */
  file_url: string | null;
  file_type: string | null;
  amount: number | null;
  is_final: boolean;
  notes: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface Attachment {
  id: string;
  deal_id: string;
  /** "visit_photo" today. A storage path in `visit-photos`. */
  type: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}
