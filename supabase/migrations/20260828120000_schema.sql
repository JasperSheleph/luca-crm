-- ============================================================
-- LUCA CRM — core schema
-- Spec: LUCA-CRM-BUILD.md section 7
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- enums (structural — not user-editable) ----------
create type user_role as enum ('admin','crm_manager','sales_rep');

create type deal_stage as enum (
  'qualifying','appointment_scheduled','site_visit_done',
  'quote_sent','negotiation','won','lost','not_pursued','nurture'
);

create type verification_status as enum ('not_required','pending','confirmed','failed','unreachable');
create type appointment_status  as enum ('scheduled','confirmed','rescheduled','completed','cancelled','no_show');
create type activity_type as enum (
  'call','whatsapp','note','stage_change','assignment',
  'appointment_set','appointment_changed','visit_started','visit_completed',
  'demo_visit','commitment','quote_sent','verification_call','imported_note'
);

-- ---------- users ----------
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  phone       text,
  role        user_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- every user-facing dropdown lives here ----------
-- Admins add / rename / reorder / deactivate. They NEVER delete: a value
-- referenced by historical deals would silently break reporting.
create table list_values (
  id          bigserial primary key,
  list_type   text not null,
  value       text not null,
  label       text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (list_type, value)
);
create index on list_values (list_type, is_active, sort_order);

create table app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);

-- ---------- durable identity, keyed on phone ----------
create table customers (
  id               uuid primary key default gen_random_uuid(),
  phone_normalized text not null unique,
  name             text,
  email            text,
  city             text,
  created_at       timestamptz not null default now()
);

create table deals (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customers(id),
  source_id    bigint references list_values(id),
  stage        deal_stage not null default 'qualifying',
  is_repeat    boolean not null default false,
  invalid_phone boolean not null default false,
  campaign_name text,
  -- Meta's "are_you_planning_to_install_the_lift?" — genuinely varies
  -- (1,039 yes / 35 no across the export), unlike lead_status and is_organic.
  planning_to_install boolean,
  external_id  text,

  crm_owner_id uuid references users(id),
  rep_owner_id uuid references users(id),

  -- qualification: ALL OPTIONAL. Fast to fill, never a gate except where
  -- app_settings.required_fields_for_appointment says so.
  floors                 int,
  property_type_id       bigint references list_values(id),
  building_subtype_id    bigint references list_values(id),
  lift_mechanism_id      bigint references list_values(id),
  site_address           text,
  construction_status_id bigint references list_values(id),
  space_available_id     bigint references list_values(id),
  minimum_space          text,
  timeline_months        text,
  budget_amount          numeric(12,2),
  num_lifts              int default 1,
  city                   text,
  city_normalized        text,
  is_outstation          boolean not null default false,

  next_action_at      timestamptz,
  next_action_note    text,
  nurture_wake_at     timestamptz,
  visit_verification_status verification_status not null default 'not_required',
  latest_quote_amount numeric(12,2),

  first_contacted_at timestamptz,
  created_at   timestamptz not null default now(),
  -- Won is defined as "advance received" — record it rather than implying it.
  advance_amount      numeric(12,2),
  advance_received_at timestamptz,
  won_at       timestamptz,
  lost_at      timestamptz,
  lost_reason_id bigint references list_values(id),
  lost_notes   text,
  not_pursued_reason_id bigint references list_values(id),
  not_pursued_notes text
);

create index on deals (stage);
create index on deals (rep_owner_id);
create index on deals (crm_owner_id);
create index on deals (city_normalized);
create index on deals (next_action_at) where stage not in ('won','lost','not_pursued');
create index on deals (created_at);
create index on deals (customer_id);
create index on deals (campaign_name);
-- re-importing the same Meta file must be safe
create unique index deals_external_id_key on deals (external_id) where external_id is not null;

create table deal_stage_history (
  id         bigserial primary key,
  deal_id    uuid not null references deals(id) on delete cascade,
  from_stage deal_stage,
  to_stage   deal_stage not null,
  changed_by uuid references users(id),
  reason     text,
  changed_at timestamptz not null default now()
);
create index on deal_stage_history (deal_id, changed_at);

-- Handoff trail. Never overwrite crm_owner_id/rep_owner_id without appending here.
create table assignments (
  id                 bigserial primary key,
  deal_id            uuid not null references deals(id) on delete cascade,
  user_id            uuid not null references users(id),
  role_at_assignment user_role not null,
  assigned_by        uuid references users(id),
  assigned_at        timestamptz not null default now(),
  unassigned_at      timestamptz
);
create index on assignments (deal_id, assigned_at);

-- Append-only timeline. Never update or delete a row.
-- This table replaces their spreadsheet's Remarks column — the core of the project.
-- Commitments live here as type='commitment' with metadata = { due_date, status }.
create table activities (
  id             bigserial primary key,
  deal_id        uuid not null references deals(id) on delete cascade,
  user_id        uuid references users(id),
  type           activity_type not null,
  disposition_id bigint references list_values(id),
  notes          text,
  metadata       jsonb,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now()
);
create index on activities (deal_id, occurred_at desc);

create table appointments (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references deals(id) on delete cascade,
  rep_id            uuid references users(id),
  scheduled_at      timestamptz not null,
  status            appointment_status not null default 'scheduled',
  rescheduled_from  timestamptz,
  reschedule_reason text,
  rep_confirmed_at  timestamptz,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now()
);
create index on appointments (rep_id, scheduled_at);
create index on appointments (deal_id);

create table visits (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals(id) on delete cascade,
  appointment_id uuid references appointments(id),
  rep_id         uuid references users(id),
  started_at     timestamptz,
  start_lat      numeric(9,6),
  start_lng      numeric(9,6),
  completed_at   timestamptz,
  end_lat        numeric(9,6),
  end_lng        numeric(9,6),
  notes          text
);
create index on visits (deal_id);

create table visit_verifications (
  id          bigserial primary key,
  deal_id     uuid not null references deals(id) on delete cascade,
  visit_id    uuid references visits(id),
  verified_by uuid references users(id),
  called_at   timestamptz not null default now(),
  outcome     verification_status not null,
  notes       text,
  resolved_by uuid references users(id),
  resolved_at timestamptz,
  resolution_notes text
);
create index on visit_verifications (deal_id, called_at);

create table quotes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  version_no  int not null,
  file_url    text,
  file_type   text,
  amount      numeric(12,2),
  is_final    boolean not null default false,
  notes       text,
  sent_by     uuid references users(id),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (deal_id, version_no)
);

create table attachments (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  type        text not null,
  file_url    text not null,
  file_size   bigint,
  uploaded_by uuid references users(id),
  uploaded_at timestamptz not null default now()
);
create index on attachments (deal_id);

-- Every inbound payload, stored before processing. Debugging lifeline.
create table inbound_leads_raw (
  id           bigserial primary key,
  source       text not null,
  external_id  text,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  deal_id      uuid references deals(id),
  error        text
);
create index on inbound_leads_raw (source, received_at desc);
create index on inbound_leads_raw (external_id);

create table notification_templates (
  key          text primary key,
  channel      text not null default 'whatsapp',
  meta_template_name text,
  body_preview text not null,
  variables    jsonb,
  is_approved  boolean not null default false
);

create table notification_rules (
  id             bigserial primary key,
  trigger_key    text not null unique,
  template_key   text references notification_templates(key),
  is_enabled     boolean not null default true,
  channel        text not null default 'whatsapp',
  timing_type    text not null,          -- immediate | offset | daily_at | weekly_at
  offset_minutes int,
  daily_at_time  time,                   -- ALWAYS interpreted as Asia/Kolkata
  weekly_day     int,
  recipient_type text not null,          -- role | specific_user | deal_owner
  recipient_role user_role,
  recipient_user_id uuid references users(id),
  threshold_value numeric,
  updated_at     timestamptz not null default now()
);

create table notifications_log (
  id           bigserial primary key,
  deal_id      uuid references deals(id),
  user_id      uuid references users(id),
  channel      text not null,
  template_key text,
  payload      jsonb,
  status       text not null,
  error        text,
  read_at      timestamptz,
  sent_at      timestamptz not null default now()
);
create index on notifications_log (user_id, read_at, sent_at desc);

create table audit_log (
  id          bigserial primary key,
  table_name  text not null,
  record_id   text not null,
  user_id     uuid references users(id),
  action      text not null,
  before_data jsonb,
  after_data  jsonb,
  occurred_at timestamptz not null default now()
);
create index on audit_log (table_name, record_id, occurred_at desc);
