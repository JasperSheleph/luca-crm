# LUCA Elevators CRM — Build Specification

> **For Claude Code.** Keep `LUCA-CRM-CONTEXT.md` in the repo root for background on the company and the reasoning behind these decisions.
>
> This covers the **entire MVP**. Section 12 describes everything deliberately left for later — read it, because several MVP decisions exist specifically to make those additions easy.

---

## 1. What this is

A lightweight CRM for LUCA Elevators, a ~10-person residential and commercial lift company operating across Tamil Nadu and Puducherry. It covers **lead capture through to Won**.

**Two constraints shape every decision:**

1. **LUCA has no technical staff.** Anything they might want to change must be a **database row editable from an admin screen**, never a code change.
2. **The builder is not a full-time maintainer.** No third-party integrations needing version upkeep. The code must be organised so "where do I change X?" is obvious six months later.

### Real volumes, measured from their actual data

Two sources were analysed: a Meta Lead Ads export (**1,074 rows, 24 Apr – 27 Aug 2026**) and their live sales tracker spreadsheet (1,763 rows, May–Aug 2026). All figures below were re-verified against those files on 28 Aug 2026.

- **~440 leads/month total**, of which ~250/month come from Meta. The rest arrive from other sources
- **Nearly every lead gets called.** Of 1,762 tracker rows only 137 carry any status — there is no meaningful pre-call filtering
- **RNR (ring-no-response) is 30% of all leads** — the most common outcome by a wide margin
- **~4.3% duplicate phone numbers**, plus explicit "repeated lead" markers
- One CRM Manager handles the whole qualified flow today; the system must support several
- 5–6 Sales Reps today, 10–15 later
- ~40% Chennai, ~60% elsewhere in Tamil Nadu and Puducherry. **Outstation is normal business, not an edge case** — never render it as a warning state

### What the CRM is replacing

Today everything lives in one spreadsheet column. A single `Remarks` cell holds an entire call history:

```
02-05 G+1 under construction wanted a lift for his home in thirunelveli,
asked for size and price details, need to fix the meeting
05-05 spoke to him, he will share the address for site visit
06-05 site visit fixed 07-05
```

88% of rows contain date patterns like this; 196 hold three or more dated entries, in inconsistent order. **The `activities` table is a direct replacement for this cell.** That is the core value of the whole project — everything else is secondary.

The structured columns in their sheet (Floors, Duration) are filled in fewer than 50 of 1,762 rows, yet the same information appears constantly inside the remarks text. The lesson for this build: **qualification fields must be fast and optional, never gates.** If capturing them is slower than typing a sentence, they will not be captured.

## 2. Stack

Next.js (App Router) + TypeScript · Supabase (Postgres, Auth with email/password, Storage, RLS) · Tailwind

**No third-party integrations except the WhatsApp Cloud API**, which sits behind a feature flag so the app is fully functional without it.

---

## 3. Roles and permissions

Three roles, **two interfaces**. Admin and CRM Manager share screens with role-gated actions.

| Capability | Admin | CRM Manager | Sales Rep |
|---|:-:|:-:|:-:|
| Assign or reassign leads to any CRM Manager | ✅ | — | — |
| **Assign lead directly to a Sales Rep** | ✅ | ✅ | — |
| View all deals | ✅ | ✅ | own only |
| Edit qualification fields | ✅ | ✅ | — |
| Log calls and activities | ✅ | ✅ | own deals |
| Schedule appointments | ✅ | ✅ | own deals |
| Check in / out of a site visit | — | — | ✅ |
| Run verification call | ✅ | ✅ | — |
| Resolve a failed verification | ✅ | — | — |
| Upload quotes | ✅ | ✅ | — |
| Mark Won / Lost / Not Pursued | ✅ | ✅ | — |
| Manage users, settings, import | ✅ | — | — |
| View dashboard | ✅ | — | — |

- **Admin is a superset of CRM Manager.** Check `role in ('admin','crm_manager')` rather than duplicating screens. This is what lets the owners cover when a CRM Manager is away
- **`crm_manager` is a role, not a person.** The system must work identically with one holder or five
- **Admins can assign straight to a Sales Rep**, skipping the CRM Manager. Real workflow, not a bypass

Implement as a single `can(user, action)` helper used by both server actions and UI, so permissions live in exactly one file.

---

## 4. Repo structure

Organise so "where do I change X?" has an obvious answer months later. **Never mix backend logic into UI components.**

```
/app                      # Next.js routes — thin. Rendering and layout only.
  /(auth)/login
  /(app)
    /deals                # Shared, role-gated
      /[id]
    /queue                # CRM Manager work queue
    /my-deals             # Rep
    /today                # Rep
    /admin
      /dashboard
      /leads              # All leads, bulk assign/reassign
      /users
      /settings
      /import
      /health
/components               # Presentational only. No DB calls, no business rules.
  /ui                     # Design system primitives
  /deals
/lib
  /db                     # Supabase clients (browser + server)
  /queries                # ALL database reads. One file per entity.
  /actions                # ALL database writes (server actions). One per entity.
  /domain                 # Business rules — no DB, no React. Pure and testable.
    stages.ts             # Allowed transitions + guard conditions
    permissions.ts        # The can() helper
    assignment.ts         # Lead distribution modes
    phone.ts              # Normalisation
    city.ts               # Normalisation + service-area matching
    notifications.ts      # Which rule fires when
  /integrations
    whatsapp.ts           # Behind a feature flag. The ONLY external API call.
  /config
    design-tokens.ts      # Single source for colours and type
/supabase
  /migrations
  /seed
/docs
  SCHEMA.md
  DEPLOYMENT.md
  MAKING-CHANGES.md
  ADMIN-GUIDE.md
```

**Enforce throughout:**

- A React component never calls Supabase directly. It calls `/lib/queries` or `/lib/actions`
- Business rules live in `/lib/domain` as pure functions — no database, no React. If a rule needs data, pass the data in
- Every stage transition goes through `/lib/domain/stages.ts`. There is no other path
- The WhatsApp adapter is the only code that talks to an external service, isolated in one file

### `docs/MAKING-CHANGES.md` — required deliverable

A plain-language index for the builder returning after six months with no memory of the code:

| I want to… | Where |
|---|---|
| Add a call disposition, loss reason, or not-pursued reason | Admin → Settings (no code) |
| Add a service area city or city alias | Admin → Settings (no code) |
| Change budget bands | Admin → Settings (no code) |
| Change how new leads are distributed | Admin → Settings (no code) |
| Change a notification's timing or recipient | Admin → Settings (no code) |
| Add a **new field** to a deal | Migration + `deals` type + qualification panel + SCHEMA.md — list exact files |
| Add a **new pipeline stage** | `stages.ts` + enum migration + stage colours — list exact files |
| Change who can do what | `lib/domain/permissions.ts`, single file |
| Change colours or fonts | `lib/config/design-tokens.ts`, single file |
| Move to a different host | `docs/DEPLOYMENT.md` |

### Hosting portability

Deploying to Hostinger Node.js hosting, but **must not be coupled to it**. Standard Next.js build, no host-specific APIs, no proprietary edge functions, no platform-specific image loaders. All configuration through environment variables.

`docs/DEPLOYMENT.md` covers the Hostinger deploy **and** generic steps to move to any Node host: env vars, build command, start command, Node version, DNS record.

**Do not use `output: 'export'`.** It disables server actions and API routes.

---

## 5. Design system

Single source of truth in `lib/config/design-tokens.ts`. Derived from the LUCA logo — brand navy sampled at `#061A4C`.

```
--navy-900: #061A4C   sidebar, primary buttons, headers
--navy-800: #0C2A6B   hover
--navy-700: #1B3F8F   links, focus rings
--navy-100: #E4E9F4   selected rows, tinted panels
--navy-50:  #F5F7FC   app background
--paper:    #FFFFFF
--ink:      #0F1729
--ink-muted:#5A6580
--border:   #DCE2EE
--gold:     #C08A2E   Won state and wordmark only
--success:  #12734A
--warning:  #B45309
--danger:   #B42318
--parked:   #64748B
```

**Stage colours:** Qualifying `--navy-700` · Appointment Scheduled `--navy-800` · Site Visit Done `--navy-900` · Quote Sent `--warning` · Negotiation `--warning` · Won `--gold` · Lost `--danger` · Not Pursued `--parked` · Nurture `--parked`

**Typography:** Inter throughout, with `font-variant-numeric: tabular-nums` on every amount, date and count column. The brand serif appears **only** in the sidebar logo lockup and login screen — never in tables or forms.

**Density:** a working tool, not a marketing site. Tight rows, compact controls, minimal decoration. Take the logo, navy and accent from lucaelevators.com; leave its layout language behind.

**Responsiveness:** Admin and Rep screens are **mobile-first** — the owners work on phones and reps live on them. The shared deals interface is **desktop-first but responsive**.

**Logo:** bundle a copy in the app. Never hotlink from WordPress.

---

## 6. Pipeline

```
Inbound → Qualifying → Appointment Scheduled → Site Visit Done
        (CRM Manager)                                │
             │                                       ▼
             └─→ Not Pursued   Won ←── Negotiation ←── Quote Sent ←── [verification gate]
                                │            │
                               Lost ←────────┘
                                      ↕
                                   Nurture (parked, wakes on a date)
```

### There is no screening gate

An earlier draft had a Screening stage where an admin filtered leads before the CRM Manager saw them. **Their real data disproves it** — of 1,762 tracker rows only 137 carry any status, and nearly all have call remarks. Everything gets called. The `drop` values that do appear were recorded *after* a conversation, not before one.

So new leads **auto-assign to a CRM Manager and land directly in Qualifying**, in a "To Call" queue. A mandatory gate that always says yes would add a click to every one of ~440 leads a month for no decision.

**Not Pursued remains available from Qualifying** — matching how dropping actually happens today.

### Lead assignment

`app_settings.lead_assignment_mode`:

| Mode | Behaviour |
|---|---|
| `auto_single` (default) | All new leads to the single active CRM Manager |
| `round_robin` | Distributed evenly across active CRM Managers |
| `manual` | Land unassigned; an admin assigns from Admin → Leads |

**Admins can always assign or reassign to any CRM Manager**, individually or in bulk, regardless of mode. Every assignment writes an `assignments` row — never overwrite `crm_owner_id` without recording the handoff.

### Stages

| Stage | Owner | Entry condition |
|---|---|---|
| Qualifying | CRM Manager | Lead ingested and assigned |
| Appointment Scheduled | CRM Manager → Rep | Date/time set, rep assigned |
| Site Visit Done | Rep | Rep marks visit complete |
| Quote Sent | CRM Manager | **Gated:** verification confirmed, or admin override |
| Negotiation | Rep, escalatable to CRM Manager | Customer responds to quote |
| Won | — | **Advance received** plus final quote sent |
| Lost | — | Loss reason mandatory |
| Not Pursued | — | Dropped after a call, reason required |

**Demo visit is not a stage.** Taking a customer to see a nearby installed lift happens for some deals but not all. Record it as an activity with a date and free-text location — making it a stage would corrupt funnel maths.

**Nurture** is a parked state. The deal leaves the active pipeline, carries `nurture_wake_at`, and a daily job returns it to the CRM Manager's queue on that date.

### Transitions

Enforced in `lib/domain/stages.ts`, called from server actions. Never in the UI.

```
qualifying            → appointment_scheduled | nurture | lost | not_pursued
appointment_scheduled → site_visit_done | qualifying | lost | nurture
site_visit_done       → quote_sent | lost | nurture
quote_sent            → negotiation | lost | nurture
negotiation           → won | lost | nurture
nurture               → qualifying
not_pursued           → qualifying        (admin only — revive)
lost                  → qualifying        (admin only — revive)
```

Every transition writes `deal_stage_history` and an `activities` row.

### The verification gate

1. Rep marks visit complete → `Site Visit Done`, verification status `pending`
2. Appears in the CRM Manager's work queue as "awaiting verification"
3. She calls the customer and records the outcome:
   - **Confirmed** → deal can advance to Quote Sent
   - **Customer says no visit happened** → deal flags red, **freezes** (cannot advance), immediate alert to both admins
   - **Unreachable** → stays pending, escalates to admins after the configured hours
4. An **admin** resolves a failure with a note, writing `resolved_by` / `resolved_at` / `resolution_notes` on the `visit_verifications` row. Per-rep failure counter appears on the dashboard

**Resolution end state — `stages.ts` needs this to be unambiguous.** A deal is frozen when `deals.visit_verification_status = 'failed'`, and *only* then. Resolving sets it to `confirmed` (visit did happen — deal advances normally) or `not_required` (visit written off — deal returns to `appointment_scheduled` to be re-booked). It never stays `failed` after resolution, and the `visit_verifications` history row preserves that a failure occurred.

**Admin override exists from day one** so the pipeline doesn't freeze when a CRM Manager is away.

---

## 7. Schema

```sql
-- ============================================================
-- ENUMS (structural — not user-editable)
-- ============================================================
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

-- ============================================================
create table users (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  phone       text,
  role        user_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ALL user-facing dropdowns live here
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

-- Durable identity, keyed on phone
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

  crm_owner_id uuid references users(id),
  rep_owner_id uuid references users(id),

  -- qualification: ALL OPTIONAL. Fast to fill, never a gate except where
  -- required_fields_for_appointment says so.
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
  -- Won is defined as "advance received"; record it rather than implying it.
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

-- Handoff trail. Never overwrite; always append.
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
-- This table replaces their spreadsheet's Remarks column.
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
  daily_at_time  time,
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
```

### Helper functions

```sql
-- Strips the "p:" prefix used in their exports, plus spaces and dashes
create or replace function normalize_phone(raw text) returns text as $$
declare digits text;
begin
  if raw is null then return null; end if;
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if length(digits) > 10 and left(digits,2) = '91' then
    digits := right(digits, 10);
  end if;
  if length(digits) <> 10 then return '+' || digits; end if;
  return '+91' || digits;
end;
$$ language plpgsql immutable;

-- security definer so it bypasses RLS on `users`. Without this, the `users`
-- admin-read policy calls this function, which reads `users`, which re-evaluates
-- the policy — infinite recursion. `set search_path` is required on every
-- security definer function; without it a caller can shadow `users`.
create or replace function current_user_role() returns user_role as $$
  select role from users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

-- Budget band reads thresholds from app_settings.
-- NOT a generated column — generated columns must be immutable,
-- and these thresholds are admin-editable.
create or replace function budget_band(amount numeric) returns text as $$
declare bands jsonb; b jsonb;
begin
  if amount is null then return null; end if;
  select value into bands from app_settings where key = 'budget_bands';
  for b in select * from jsonb_array_elements(bands) loop
    if amount < (b->>'max')::numeric then return b->>'label'; end if;
  end loop;
  return (bands -> -1) ->> 'label';
end;
$$ language plpgsql stable;
```

### Row Level Security

```sql
alter table deals enable row level security;
alter table activities enable row level security;
alter table appointments enable row level security;
alter table visits enable row level security;
alter table quotes enable row level security;
alter table attachments enable row level security;
alter table customers enable row level security;

create policy deals_read on deals for select using (
  current_user_role() in ('admin','crm_manager')
  or rep_owner_id = auth.uid()
);

create policy deals_write on deals for update using (
  current_user_role() in ('admin','crm_manager')
  or rep_owner_id = auth.uid()
);

create policy deals_insert on deals for insert with check (
  current_user_role() in ('admin','crm_manager')
);
```

Apply the same shape to child tables — reps see rows only for deals they own. **Test by logging in as a rep and confirming another rep's deal returns zero rows, not a hidden UI element.**

### RLS on every table, without exception

The Supabase project is configured with **"Automatically expose new tables" OFF** and **"Enable automatic RLS" ON**, so new tables are private by default and fail closed. Match that in code.

| Table group | Policy |
|---|---|
| `deals`, `activities`, `appointments`, `visits`, `visit_verifications`, `quotes`, `attachments`, `customers`, `deal_stage_history`, `assignments` | Role-based policies as above. Reps scoped to their own deals |
| `inbound_leads_raw`, `audit_log`, `notifications_log` | **RLS enabled with no policies at all.** Server-only, reachable exclusively via the service role key |
| `list_values`, `app_settings`, `notification_templates`, `notification_rules` | Read for authenticated users; write restricted to `admin` |
| `users` | Read own row; admins read and write all |

`inbound_leads_raw` stores complete payloads — names, phone numbers and emails for thousands of real people — and the anon key is public by design, shipped in the browser bundle. A table exposed to the Data API without a policy is readable by anyone who opens devtools.

### Supabase Storage — buckets and policies

`quotes.file_url` and `attachments.file_url` are bare `text`, so the buckets behind them must be specified or they default to wrong.

| Bucket | Public? | Holds |
|---|---|---|
| `quotes` | **No** | Quotation files — Excel, PDF, image. Commercially sensitive |
| `visit-photos` | **No** | Site photos from rep check-ins |

**Both buckets are private.** Site photos are pictures of customers' homes, and the anon key ships in the browser bundle — a public bucket means anyone with a URL can enumerate them. Serve every file through a **short-lived signed URL** generated server-side, and store the storage *path* in `file_url`, never a signed URL (they expire; a stored one rots).

Storage RLS mirrors the table policies: admin and CRM Manager reach any object; a rep reaches objects only under deals where `rep_owner_id = auth.uid()`. A path convention of `{bucket}/{deal_id}/{filename}` makes that policy a straightforward prefix check against `deals`.

### City normalisation — `lib/domain/city.ts`

Their real data contains **232 distinct spellings for roughly 30 cities**: "trichy" and "tiruchirappalli" both appear, plus case and whitespace variants.

```
normalizeCity(raw):
  lowercase, trim, collapse whitespace, strip punctuation
  apply alias map from app_settings.city_aliases
```

Store the raw string in `city`, the normalised form in `city_normalized`. All service-area matching runs against the normalised form. The alias map lives in `app_settings` so admins can extend it.

### Seed data

`list_values`:

| list_type | values |
|---|---|
| `lead_source` | Meta Ads, Website Quiz, Website Contact Form, Phone Call, Referral, IndiaMART, Walk-in, CSV Import, Legacy Tracker |
| `call_disposition` | **RNR (ring no response)**, Connected – Interested, Connected – Not interested, Switched off, Wrong number, Budget constraint, Just exploring, Planning later, Language barrier, Duplicate enquiry, Call back later, Not reachable |
| `not_pursued_reason` | Budget too low, Duplicate enquiry, Invalid number, Spam or test entry, Only researching, Vendor or competitor, No lift requirement, Outside service area |
| `loss_reason` | Price too high, Went with competitor, Project postponed, Site not feasible, Budget unavailable, No response after quote, Plans changed, Spec not offered |
| `property_type` | Residential, Commercial, Semi-commercial, Other |
| `building_subtype` | Individual house, Apartment, Villa |
| `lift_mechanism` | Hydraulic, Hydraulic Industrial, MRL, Traction |
| `construction_status` | Under construction, Existing |
| `space_available` | Yes, No, Not sure |

RNR is listed first deliberately — it's 30% of outcomes and must be the fastest option to pick.

`app_settings`:

```json
{
  "lead_assignment_mode": "auto_single",
  "budget_bands": [
    {"label":"Under ₹6L","max":600000},
    {"label":"₹6–8L","max":800000},
    {"label":"₹8–12L","max":1200000},
    {"label":"Above ₹12L","max":999999999}
  ],
  "required_fields_for_appointment": ["floors","property_type_id","construction_status_id","space_available_id"],
  "service_area_cities": [
    "chennai","coimbatore","madurai","salem","tiruchirappalli","tirupur",
    "vellore","puducherry","erode","hosur","kanchipuram","nagercoil",
    "tuticorin","krishnagiri","tiruvannamalai","sivakasi","thanjavur","dindigul"
  ],
  "city_aliases": {
    "trichy":"tiruchirappalli","madras":"chennai","cbe":"coimbatore",
    "pondy":"puducherry","pondicherry":"puducherry","tuty":"tuticorin",
    "thoothukudi":"tuticorin","kovai":"coimbatore"
  },
  "quote_followup_days": [3,7,14],
  "verification_escalation_hours": 48,
  "whatsapp_enabled": false
}
```

Seed **mock users** covering all three roles, plus the builder's own email as an admin.

### The `list_values` rule — enforce in the UI

Admins can **add, rename and reorder** values. They can **deactivate, never delete**. Deleting a value referenced by fifty historical deals silently breaks reporting. Make this impossible to get wrong: no delete button anywhere.

---

## 8. Lead ingestion

One endpoint for all sources: `POST /api/leads/inbound`

```
Headers: X-Api-Key: <per-source key>
Body:    { source, external_id, name, phone, email, city, campaign?, raw {} }
```

1. Write the raw payload to `inbound_leads_raw` **before** any processing
2. Normalise phone; normalise city
3. Match `customers` on normalised phone — no match creates one, a match sets `is_repeat`
4. Assign per `lead_assignment_mode`; create the deal in `qualifying`
5. Always return 200; log failures rather than erroring

CSV upload writes through this same path. The WordPress website form posts to it directly.

### Importer A — Meta Lead Ads CSV

18 columns:

```
id, created_time, ad_id, ad_name, adset_id, adset_name, campaign_id,
campaign_name, form_id, form_name, is_organic, platform,
are_you_planning_to_install_the_lift?, full_name, email, phone_number,
city, lead_status
```

Every requirement below comes from something actually present in their data:

- `phone_number` arrives as `p:+919566114558` → strip prefix, normalise
- **~2% have international or malformed numbers** (`+18015511772`, `+98416494649`). Import them, set `invalid_phone = true`, surface the flag. **Never silently drop**
- **At least one row has `created_time` = `~`.** Skip malformed rows gracefully and report the count — never fail the whole import
- `created_time` → `deals.created_at`. **Preserve the original timestamp. Never use import time.** Lead age is a tracked metric and this is the only chance to get it right
- `city` → raw into `city`, normalised into `city_normalized`
- `campaign_name` → `deals.campaign_name`, needed for per-campaign reporting
- `id` → `external_id`, deduplicated so re-importing the same file is safe
- **Ignore `lead_status` and `is_organic`** — identical on every row across the whole export (`CREATED` / `false`)
- **`are_you_planning_to_install_the_lift?` → `deals.planning_to_install`.** Unlike the two above, this one genuinely varies: 1,039 `yes` / 35 `no`. Map `yes`/`no` to boolean, anything else to null
- ⚠ **Nine rows carry a Facebook permission error in place of a campaign name** — the string `You don't have enough permission. Please refer to this help: https://www.facebook.com/business/help/766393076839635`, appearing in `campaign_name`, `ad_name` and `adset_name` alike. **Null these on import.** Stored verbatim they become a fake campaign sitting inside the per-campaign reporting the dashboard is built on
- 42 rows have an empty `city`, and 2 emails are malformed (`fahimjf@gmail.com9940095735`). Import both as-is — neither is a reason to reject a lead
- Preview before commit: new / duplicate / invalid phone / skipped

**Expected result for the file on hand** (1,074 records, 24 Apr – 27 Aug 2026): **1,073 imported, 1 skipped** (the `~` row), **22 flagged `invalid_phone`, ~11 repeat customers.**

### Importer B — their legacy sales tracker

A separate importer for their existing spreadsheet, so historical context survives the cutover.

Columns: `Date, RP, Floors, Duration, Name, Mail, Contact, Place, Remarks, site visit done (yes/NO), Quotation Shared (yes/No), Status, Status Remarks` — plus six unnamed trailing columns, 13 rows of which carry stray text. Sweep those into the imported note rather than dropping them silently.

#### ⚠ The tracker is not a lead source. Meta is.

**974 of the 1,063 phone numbers in the Meta export also appear in this tracker** — the two files are largely the same people recorded twice. Under a naive "phone match sets `is_repeat`, create a deal anyway" rule, importing both files produces **~974 phantom repeat deals**: roughly 2,800 deals for ~1,860 real enquiries, a meaningless repeat-customer signal, and every funnel percentage on the admin dashboard wrong from day one.

So the tracker supplies **history**, and **only** the leads Meta never captured. Keyed on normalised phone, every row takes one of two paths:

| Tracker row | Rows | Action |
|---|---|---|
| **Phone matches an existing deal** | 1,031 | Attach history to that deal. **No new customer, no new deal**, `is_repeat` untouched |
| **No phone match** | 732 (700 distinct) | Create customer + deal, `source = 'Legacy Tracker'` |

Run Importer A first — this ordering is required, not incidental. The 732 unmatched rows are the non-Meta channels (website, phone, referral, IndiaMART) that make up the gap between ~250 Meta leads/month and the ~440 they actually receive; 29 of them already have a site visit done and 25 already have a quotation shared, so they are live deals, not dead history.

**Expected result: ~1,073 Meta deals + ~700 legacy deals ≈ 1,773 total.**

#### Field handling — applies to both paths

- **The `Date` column has at least six formats** — `2 May` (1,537 rows), ISO timestamps (176), bare `Mon` (29), empty (16), plus stragglers like `06- Jul`, `2026/5/14`, `01/05/2026` and `dd/mm/yy`. Use a tolerant multi-format parser; on failure, import the row with a null date rather than dropping it
- **`Contact`** — 1,695 rows use the `p:` prefix, 64 don't, 4 are empty. Same normalisation. A row with no usable phone cannot key a customer: import it against a placeholder and flag it, don't discard it
- **`Floors` and `Duration` contain junk** — values like `rnr`, `repeated lead`, `no incoming`, `w`. Only accept values matching `G+N`; put anything else in the notes. `Duration` maps to `timeline_months` as free text
- **`Remarks` is the important column** (1,728 rows carry one). Preserve it two ways:
  1. Store the **entire original text** as one `activities` row with `type='imported_note'`. Nothing is ever lost
  2. **Best-effort parse** into individual call activities: split on newlines, and where a chunk begins with a `DD-MM` or `DD/MM` pattern, create a `call` activity dated accordingly. Ordering in the source is inconsistent — sometimes newest first — so **trust the parsed dates, not the line order**
- **`RP` is rep attribution and must not be dropped.** 127 rows carry initials: `JN` (63), `NV` (29), `NV/JN` (26), plus `Jacil`, `JF`, `NV/Jacil`, `JACIL/JN`, `NV/Jaleel`. This is the only historical rep data in the entire dataset. Resolve initials to users through an **admin-editable alias map in `app_settings`** — never hardcode initials. For combined values take the first initial as `rep_owner_id` and record the full original string in the imported note
- `Status Remarks` (43 rows) appends to the imported note
- Map `Status` values: `won` → Won · `drop`/`dropped`/`no` → Not Pursued · `negotiation` → Negotiation · `site visit pending`/`demo visit pending` → Appointment Scheduled. **Roughly 37 of the 137 statuses are free-text sentences** ("site visit - fixed | can go anytime, have to inform the client before the visit"). Anything unrecognised → Qualifying with the original string kept in notes
- `site visit done = yes` (81 rows) and `Quotation Shared = yes` (60) set the corresponding stage where it's further along than `Status` implies
- **Within-tracker duplicates** — 82 rows, 4.65% — collapse onto one deal per distinct phone; the extra rows append their remarks as further activities rather than creating a second deal

#### On a matched row, do not overwrite Meta data

The Meta record is authoritative for `created_at`, `campaign_name`, `city` and `planning_to_install`. A matched tracker row may only **add**: activities, `rep_owner_id` where absent, stage advancement, and qualification fields that are still null. Overwriting `created_at` with a tracker date would corrupt lead-age metrics for 1,031 deals — the exact failure Importer A is explicitly guarded against.
---

## 9. Screens

### CRM Manager work queue — desktop-first

Her primary screen. **Ordered, not browsable.** She handles ~440 leads a month plus verification calls, so this must tell her what to do next rather than invite exploration.

1. **To Call** — newly assigned leads, never contacted
2. Visits awaiting verification
3. Overdue next actions
4. Nurture leads waking today
5. Quotes sent with no response past SLA

**Logging a call must be one interaction.** RNR is 30% of outcomes — there should be a single tap or keystroke that logs "RNR, today" and advances to the next lead, without opening a form. Everything else about this build is secondary to getting this right; if it's slower than typing into a spreadsheet cell, the CRM will not be adopted.

### Deals interface — shared, role-gated

One set of screens for Admin and CRM Manager, actions gated by `can()`. Reps see the same deal detail scoped by RLS.

- **Search box — phone or name, single field.** The CRM Manager takes inbound calls from people already in the system; she must find them in one keystroke sequence, not by filtering. Match against `customers.phone_normalized` (partial, last-10-digit) and `customers.name`
- Filters: stage, owner, source, city, campaign, date range, next-action overdue
- Columns: customer, city, stage, owner, budget band, next action, age
- **Export button** — downloads the current filtered view as CSV or Excel. This is what guarantees LUCA is never locked in
- Deal detail:
  - Header: customer, phone with click-to-call, stage badge, owners
  - **Timeline** — reverse-chronological `activities`, append-only. This is the centrepiece of the screen, not a sidebar
  - **Log activity** — call with disposition, note, or commitment with a due date
  - **Qualification panel** — the fields, inline editable, all optional. Collapsed by default so it never blocks logging a call
  - **Change stage** — validated in `stages.ts`; blocks `qualifying → appointment_scheduled` unless `required_fields_for_appointment` are filled
  - **Assign** — to a CRM Manager or directly to a Sales Rep, writing to `assignments`, never overwriting history
  - **Appointments** — schedule, reschedule with a mandatory reason
  - **Verification** — record the call outcome; failures freeze the deal and alert admins
  - **Quotes** — upload any file type (Excel, PDF, image) with amount and version. Latest shows; older collapse under history
  - Set next action date and note; park to Nurture with a wake date; mark Won, Lost or Not Pursued with a mandatory reason

### Admin → Leads

Bulk operations across all leads: filter, multi-select, bulk assign or reassign to any CRM Manager, bulk assign to a Sales Rep. Used when onboarding a new CRM Manager, covering leave, or rebalancing.

### Rep view — mobile-first

Reps live on phones. **This must be faster than WhatsApp for the rep's own work**, or they won't use it and the whole system becomes fiction.

- **Today** — appointments today plus overdue next actions
- **My Deals** — RLS-enforced, cannot see other reps' deals
- Deal detail: log calls, confirm or reschedule appointments with a reason, **check in and out of a site visit capturing geolocation**, upload photos, log commitments, update negotiation

**Photos:** compress client-side to roughly 300KB, cap at 5 per visit. Main driver of storage cost and the strongest anti-fraud evidence.

### Admin dashboard — mobile-first

The owners work on phones. Stacked metric cards, not wide tables.

- Leads received this month, by source and campaign
- **Contact rate and drop rate by campaign** — which ad spend produces reachable, qualifiable people
- Funnel by stage; win rate
- Conversion by rep; average cycle time
- **Lead age at first contact** — how long leads wait before anyone calls
- Stalled deals, failed verifications by rep, nurture pool size

> Note for context: their current tracker shows only 2 `won` rows across 1,762 leads, which means status simply isn't maintained today. **They have no reliable conversion baseline.** Don't present historical tracker numbers as truth.

### Health page — Admin

Plain language, readable by someone who doesn't code:

- Last lead imported: *3 hours ago* ✅
- WhatsApp: *Enabled / Not configured* ✅
- Failed jobs (24h): *0* ✅
- File storage: *62% used* ✅ — warns at 80%
- Database: *31% used* ✅

### Admin — Users, Settings, Import

Users: create, deactivate, assign roles, trigger password reset.
Settings: all `list_values`, `app_settings` including assignment mode, notification rules.
Import: both CSV importers.

---

## 10. Notifications

Build a **notification engine** that is fully functional without WhatsApp.

- Every notification writes to `notifications_log` and appears in an **in-app notification centre**
- If `app_settings.whatsapp_enabled` is true and credentials exist, the WhatsApp adapter also sends. If not, in-app only
- This decouples the build from Meta's approval timeline entirely

### What admins can change

`notification_rules`, one row per trigger. Admins control **on/off, timing, recipient, and threshold** from Settings. No code change.

### What they cannot change: message text

WhatsApp Cloud API sends only **pre-approved templates**. Meta approves each body; you inject variables. Editing wording means Meta re-approval.

**Template text is locked.** State this plainly in the Settings UI — a short line under the read-only field explaining why, not a mystery.

### Default rules

| Trigger | To | Timing |
|---|---|---|
| Lead assigned | CRM Manager or Rep | Immediate |
| Appointment tomorrow | Rep | 7pm previous day |
| Appointment approaching | Rep | 2h before |
| Next action overdue | Owner | 9am daily |
| Visit awaiting verification | CRM Manager | Immediate |
| **Verification failed** | Both admins | **Immediate** |
| Deal won | Both admins | Immediate |
| Daily summary | Both admins | 7pm |
| Uncontacted leads older than N days | Admins | Weekly |

Individual pings stay personal; admins get digests. A firehose gets muted, and a muted system is decorative.

### Scheduled jobs — Supabase `pg_cron` + `pg_net`

Hostinger Node hosting has **no built-in scheduler**, and the app must stay portable. So the schedule lives in Postgres: `pg_cron` fires, `pg_net` POSTs to a protected API route carrying a shared secret from an env var. Nothing is installed on the host, and moving to another Node host changes only the target URL.

The daily job handles: nurture wake-ups, overdue next actions, quote follow-up nudges at the configured days, verification escalation past the configured hours, and the evening digest.

**⚠ Timezone — `Asia/Kolkata`, everywhere.** `notification_rules.daily_at_time` is a bare `time` with no zone. Postgres `cron.schedule` runs in the database's timezone and the Node server may well run UTC, so a rule set to "9am" fires at 2:30pm IST unless this is pinned deliberately. Schedule cron entries in UTC-equivalent terms, and evaluate every `daily_at_time` / `weekly_at` comparison as `(now() at time zone 'Asia/Kolkata')`. Cover this with a unit test — it is silent when wrong.

---

## 11. Build order

Not separate phases — one build. But work in this sequence so each step is verifiable before the next depends on it.

1. **Schema, RLS, seed data, auth, app shell.** Verify: log in as each role, confirm navigation differs
2. **Settings, Users, Importer A (Meta CSV).** Verify with the real file — expect **1,073 imported, 1 skipped, 22 invalid phone, ~11 repeats**. **Confirm `created_at` shows April–August dates, not today's.** If it shows today, every lead-age metric is silently wrong forever
3. **Deals interface, deal detail, timeline, stage transitions, assignment.** Verify: walk one deal from Qualifying to Won, checking every step appears in the timeline
4. **CRM Manager work queue.** Verify: log 20 RNRs. **Time it.** If it's slower than typing into a spreadsheet, redesign before going further
5. **Rep view, appointments, visits with geolocation, photos.** Verify on an actual phone
6. **Verification gate, quotes.** Verify: a failed verification freezes the deal and an admin can unfreeze it
7. **Importer B (legacy tracker).** Run *after* Importer A — the order is required. Verify: **~700 new legacy deals and zero duplicate deals for the 1,031 matched rows**, remarks survive both as a full original note and as parsed call activities, and `RP` initials resolved to reps
8. **Notification engine, in-app centre, `pg_cron` jobs.** WhatsApp adapter behind the flag, off by default. Verify a scheduled job fires at the correct **IST** hour, not UTC
9. **Dashboard, export button, health page**
10. **Docs:** `SCHEMA.md`, `DEPLOYMENT.md`, `MAKING-CHANGES.md`, `ADMIN-GUIDE.md`

### Tests

Unit tests for `lib/domain` only — stage transitions, permissions, assignment modes, phone normalisation, city normalisation, notification rule evaluation (**including the `Asia/Kolkata` boundary**). Add one parity test asserting the SQL `normalize_phone()` and `lib/domain/phone.ts` agree, using the 22 known-bad numbers from the Meta export as fixtures — two implementations of one rule will drift otherwise. These are the rules most likely to be broken by a future change, and the only part of the codebase worth testing at this stage.

---

## 12. Out of MVP scope — parked for later

**Do not build anything in this section.** It is here so that nothing in the MVP gets designed around a feature that isn't coming yet, and so the reasoning survives for whoever picks this up later. Several MVP decisions exist specifically to make these additions cheap — those are noted inline.

### 12.1 Parked features

#### Call recording

**Why parked:** the single most expensive requirement in the original brief. Everything else in this project is straightforward; this isn't.

LUCA wants the CRM Manager's calls recorded against the lead. They explored Airtel VOIP business SIMs. The realistic approach is a cloud telephony provider — Exotel, MyOperator, Knowlarity, Airtel IQ — giving her a virtual number where calls route through their system, get recorded, and land in the CRM via webhook. Roughly ₹2,000–6,000/month plus per-minute charges.

Android call-recording apps are unreliable post-Android 10 and won't attach recordings to leads automatically.

**Legal note:** recording without informing the other party sits in a grey area under Indian law. A recorded pre-call disclaimer is standard practice and cloud providers support it.

**MVP prepares this by:** recording every call in `activities` with a disposition and timestamp. Adding a `recording_url` column and a webhook endpoint is a small change against an existing structure.

#### CPQ — quote generation

**Why parked:** pricing configurators, discount logic and terms management. A separate engagement, not a CRM feature.

LUCA's stated pain: quotes take ~2 days against a 4-hour target; negotiation without a structured quote becomes bargaining; changes to terms cause rework. They want **time-based discounts** — more discount for spot closure.

**MVP prepares this by:** versioning quotes (`version_no`, `amount`, `is_final`). After a few hundred deals you'll have real data on what changes between v1 and v3, which is exactly what a CPQ needs to be designed against.

#### Post-sale: installation and AMC

**Why parked:** MVP stops at Won. But annual maintenance contracts are recurring revenue nobody currently tracks, and their existing customer base is where it sits.

Would need: installation scheduling, milestone tracking, handover sign-off, AMC records with renewal dates and reminders.

**MVP prepares this by:** treating Won as terminal but not deleted. A post-sale module hangs off `deals` where `stage = 'won'`.

#### Expense tracking for sales reps

Travel and accommodation for outstation visits. ~60% of leads are outside Chennai, so this is real money. Would attach to `visits`.

#### Cost per lead by campaign

Needs Meta **ad account** access plus the Marketing API. The builder currently has full business portfolio and Page access — enough for everything MVP needs, but not ad spend.

Would let the dashboard show cost per lead and cost per won deal by campaign, the natural companion to the contact-rate metric MVP already produces.

#### Rep–customer conversation visibility

They want to see what reps discuss with customers. Overlaps with call recording. **Handle carefully** — it compounds the surveillance dynamic that already threatens rep adoption.

#### Real-time Meta lead ingestion

**Why parked:** CSV matches how they actually work today.

Two paths. A **lead-forwarding service** (Make.com Core at ~$9–12/month — the free tier's 1,000 credits won't cover ~3 credits per lead at their volume) which absorbs Meta's annual API-version treadmill. Or a **direct Meta webhook**, needing App Review for `leads_retrieval`, `pages_manage_ads`, `pages_manage_metadata`, `pages_show_list` and `pages_read_engagement`, plus ongoing version maintenance — Meta deprecates Graph API versions annually.

**MVP prepares this by:** `POST /api/leads/inbound` is already source-agnostic. Adding a source is configuration, not code.

#### IndiaMART and other lead sources

Same endpoint. `lead_source` is already a seeded, editable list.

#### Customer-facing WhatsApp

MVP messages staff only. Customer-facing would mean appointment confirmations, quote-sent notifications, and automating the verification call — asking the customer directly "did our rep visit?" instead of phoning.

**Constraint:** their customer-facing number 7550002335 must stay on the WhatsApp Business App so a human can reply. Automated customer messages from a different number may confuse people.

#### Live Google Sheets sync

MVP has an export button instead — no service account, no cron, nothing to break. Only revisit if Vishal specifically wants a sheet he can open without logging in. If so, it must be **read-only**; edits will not flow back, and that has to be said plainly.

---

### 12.2 Parked investigations

#### The website form path

Their WordPress runs **WPForms Lite**, which does not store entries in the database and does not support webhooks — both are Pro features. Contact Form 7 and Forminator are installed but inactive.

The cheapest route is a small custom plugin hooking `wpforms_process_complete` and POSTing to `/api/leads/inbound`. Roughly fifteen lines of PHP, no licence cost, forms untouched. Put it in its own plugin, not `functions.php`, which theme updates overwrite.

**Does not affect the build.** The endpoint is already source-agnostic and "Website Contact Form" is already a seeded source. This is a wiring job at the end.

#### WP Mail SMTP failures ⚠

The plugin is reporting failed sends. Since WPForms Lite only emails submissions and stores nothing, **failed email may mean website leads are being lost right now.**

Worth resolving independently of this project. Check WP Mail SMTP → Email Log, then cross-check the Hostinger mailbox for form notifications, and confirm whether those people appear in the sales tracker.

Note the arithmetic: the tracker holds ~440 leads/month while Meta accounts for only ~250. Either the remainder is the website flow being manually copied across, or website leads have never reached the tracker at all.

#### The 5-step quiz

Probably not WPForms — Lite doesn't support multi-step. Likely a custom Elementor widget from their agency ("LUCA Home Lifts - Elementor Widgets" is installed). Trace where it posts separately.

#### Other possible lead capture

**Booked** (appointment booking) and **MC4WP Mailchimp** are both active in WordPress. If either captures leads, that's a source nobody has mentioned.

#### The second Meta portfolio

The business portfolio is named **"Luca Elevators 1"**. A trailing digit usually means another portfolio exists. If the ad account isn't visible despite full portfolio access, the ads likely live in a different one. Irrelevant while using CSV imports.

---

### 12.3 Parked access and setup

| Item | Blocks | Status |
|---|---|---|
| **hPanel access** | Deployment only | Waiting on Vishal / the agency |
| **Which Hostinger plan** | Deployment only | ⚠ Node.js needs Business or Cloud. Premium is PHP-only |
| **DNS control** | Deployment only | Unknown whether LUCA or the agency holds it |
| **Prepaid SIM** | WhatsApp only | Not bought. WhatsApp ships flagged off |
| **WABA, display name, template approval** | WhatsApp only | Not started. Meta Business Verification is done |
| **SVG logo** | Nothing | PNG works fine |
| **Their existing lead spreadsheet** | Importer B testing | Have the tracker CSV; confirm it's the full file |

MVP is fully buildable and demonstrable without any of these.

---

### 12.4 Parked decisions

- **Maintenance ownership after handover** — retainer, or an explicit "you hire someone when it breaks." The highest-risk open item in the project, and the one most likely to sour a friendship. Settle before handover, ideally before the first commit
- **Build fee** — ₹1–1.5 lakh suggested for MVP scope. Their anchor is Zoho at ₹50,000/year for five users, ₹1.5L at fifteen
- **Live Google Sheet vs export button** — export button is built either way; only a live sheet needs a Google service account
- **Legacy tracker import: automated or one-time transform?** Importer B is specced. If the file turns out messier than expected, a manual transform may be faster

---

### 12.5 Resolved — do not revisit

| Question | Answer |
|---|---|
| Does Vaishali screen leads? | **No.** Data disproved it — 137 statuses across 1,762 rows. Screening stage removed entirely |
| Is the service area Chennai only? | **No.** Tamil Nadu and Puducherry. Campaigns deliberately target Trichy, Madurai, Salem, Coimbatore, Puducherry |
| Do we need Make.com or Zapier? | **No.** CSV matches how they work. Free tier wouldn't have covered their volume anyway |
| Do we need Meta ad account access? | **No** for MVP. Only for cost-per-lead later |
| Do we need a Google Cloud service account? | **No.** Replaced by an in-app export button |
| Can we use their existing WhatsApp number? | **No.** Cloud API registration removes a number from the WhatsApp Business App |
| Will a virtual SIM work? | Permitted by Meta, but unreliable — OTP delivery fails on many virtual numbers and support can be withdrawn. Buy a real prepaid SIM |
| Three separate interfaces? | **No.** Admin and CRM Manager share role-gated screens |
| Structured space/capacity fields? | **No.** `minimum_space` stays free text |

---

### 12.6 Known risks carried into the build

**Rep adoption is the biggest.** This is visibly a control system — verification calls, GPS check-ins, activity logging. If reps experience it as surveillance with no benefit to them, they'll log the minimum and the dashboard becomes fiction. The rep app must be faster than WhatsApp for the rep's *own* work.

**RNR speed is the adoption test for the CRM Manager.** 30% of ~440 leads a month. If logging an RNR is slower than typing in a spreadsheet cell, the CRM loses.

**They have no conversion baseline.** Their tracker shows 2 `won` rows across 1,762 leads, which means status isn't maintained rather than that conversion is 0.1%. Don't present historical tracker numbers as truth to Vishal.

**Geolocation is spoofable.** A deterrent, not proof. Photos and the verification call are the stronger controls.

**The verification gate doesn't prevent lead theft.** A rep who wants to divert a lead simply never logs it. This catches *false reporting* of visits. Centralised intake and assignment is what prevents theft. Tell Vishal plainly rather than letting him buy false comfort.
