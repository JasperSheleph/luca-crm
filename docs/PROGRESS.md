# Where the build is

*Updated 30 August 2026. Keep this current — it is what a new session reads to
find out what exists.*

Read [`CLAUDE.md`](../CLAUDE.md) first. Where this file disagrees with
[`LUCA-CRM-BUILD.md`](../LUCA-CRM-BUILD.md), **this file is right** and the spec
has not caught up.

---

## Build order

| # | Step | Status |
|---|---|---|
| 1 | Schema, RLS, storage, seed, auth, app shell | **Done** |
| 2 | Settings, Users, Importer A (Meta CSV) | **Done** |
| 3 | Deals list, deal detail, timeline, transitions, assignment | **Done** |
| 4 | Work queue, as presets on `/deals` — not a `/queue` screen | **Built, not yet timed** |
| 5 | Rep view, appointments, visits with geolocation, photos | Pending |
| 6 | Verification gate, quotes | Pending |
| 7 | Importer B (legacy tracker) | Pending |
| 8 | Notification engine, in-app centre, `pg_cron` | Pending |
| 9 | Dashboard, export, health page | Pending |
| 10 | `SCHEMA.md`, `DEPLOYMENT.md`, `MAKING-CHANGES.md`, `ADMIN-GUIDE.md` | Pending |

### What proved each step

**Step 1** — logged in as all three roles and confirmed navigation differs. RLS
verified with a fixture: rep1 saw their own deal, **rep2 got zero rows** on
deals, activities and customers alike. `UPDATE` and `DELETE` on `activities`
refused even for an admin — append-only holds at the database, not just in code.

**Step 2** — the real Meta CSV imported: **1,073 imported, 1 skipped** (row 343,
`created_time` is `~`), **23 invalid phone flagged, 11 repeat enquiries**.
`created_at` spans April 25 / May 170 / June 306 / July 273 / August 299 — the
original timestamps survived, which is the one thing with no second chance.
Re-running imports 0 and reports 1,073 already present.

**Step 3** — walked one deal Qualifying → Won. All six steps appeared in the
timeline with IST timestamps and attribution; all five transitions landed in
`deal_stage_history`. The gates held: Appointment Scheduled stayed hidden until
the required fields were filled, and Won demanded the advance. That deal was a
real customer, so the test data was removed afterwards.

### Step 4: presets on `/deals`, not a `/queue` screen

The spec asks for a separate work queue at `/queue`. Building it would repeat the
`/admin/leads` mistake — a second near-identical list beside Deals, which had to
be deleted. `/deals` already answers two of the five buckets as filters:
`?uncontacted=1` and `?overdue=1` (`lib/queries/deals.ts`).

What `/deals` is genuinely missing is not a screen:

- **Ordering.** `listDeals` sorts `created_at DESC` — right for searching, wrong
  for working. A work queue is oldest-first: the lead that has waited three weeks
  is the one costing money, and newest-first buries it on page 6 of 22. This is
  the mechanism behind "leads wait weeks before anyone calls," named elsewhere as
  their largest addressable loss
- **Three missing buckets.** Awaiting verification (no filter on
  `visit_verification_status`), nurture waking today (`nurture_wake_at` on or
  before today, not merely stage `nurture`), and quotes past SLA — which had no
  sent date on `deal_list_view` to compare against until `20260830120000` added
  `latest_quote_sent_at`. All three are now pure filters over columns the view
  already carries; none needs further schema
- **Speed.** Logging a call must be one interaction. That belongs in
  `components/deals/lead-drawer.tsx`, which already does a non-modal slide-over
  with History-API URL state — exactly the "advance without a page load"
  behaviour `/queue` was going to be built for

So step 4 is: five presets, an oldest-first sort, and one-interaction logging in
the drawer.

**Done already.** `/queue` is a redirect, not a screen, matching what
`/admin/leads` became — so old bookmarks keep working. It is off the nav,
`revalidatePath("/queue")` is gone, and `homeFor("crm_manager")` now returns
`TO_CALL_PRESET` from `lib/navigation.ts`, so she lands on never-contacted leads
oldest-first instead of a placeholder. `listDeals` takes `?sort=oldest`
(defaulting to newest-first, so `/deals`, `/my-deals` and Export are unchanged).

**Also done.** Five preset chips on `/deals`, defined once in
`lib/domain/presets.ts` and covered by `tests/presets.test.ts`. Applying one
replaces the filter state rather than adding to it — these are views of the
work, not extra conditions — and narrowing a preset by city keeps it selected.
The three missing filters are in `listDeals`: `verification=pending`,
`waking=1`, `quotesla=1`. Waking compares against **today in IST** via the
existing `istParts`, because on a UTC server a 05:00 IST deal wakes a day late.
The SLA window is the last value in `quote_followup_days`, read from settings so
LUCA can change it without a deploy.

**One interaction per lead.** In the slide-over, pressing a disposition's number
logs it and moves to the next lead; RNR is seeded first, so RNR is always `1`.
Clicking deliberately does not advance — see the decisions table.

**Still to verify.** The number that governs the design: **RNR is 30% of ~440
leads a month.** Log 20 with the `1` key and time it against a spreadsheet cell.
Two presets — Awaiting verification and Quotes past SLA — correctly show nothing
until steps 5 and 6 exist; their empty state says why rather than reading as a
bug.

---

## Decisions that supersede the spec

The spec is being corrected as we go, but these are the changes that came from
using the thing:

| Change | Why |
|---|---|
| **`/admin/leads` deleted**, merged into `/deals` as a Select mode | Two near-identical screens, and Leads shipped with no filter controls at all. Redirects now |
| **A click logs and stays; a number key logs and advances** | The spec said "a single tap or keystroke". Making both advance is wrong: `Connected - Interested` and `Call back later` need a next action on *this* lead. The keyboard is the bulk path (`1 1 1` down the RNRs), the mouse the considered one. Avoids hard-coding which dispositions are "done" in a `.tsx`, which would have been a code change LUCA cannot make |
| **`/queue` dropped; the work queue is presets on `/deals`** | The same mistake as `/admin/leads`, one step later. Two of the five buckets are already filters; what was actually missing is oldest-first ordering, three more filters, and one-interaction logging in the slide-over that already exists |
| **Sign in with mobile number or email**; mobile mandatory and unique | Reps work from phones and know their number better than an assigned email. Not Supabase phone auth — that needs a paid SMS provider |
| **Leads open in a slide-over**, not a separate page | Reviewing a queue without losing filters or scroll. Non-modal; the list stays interactive. `?lead=<id>`, written with the History API so stepping through leads does not re-run the page's queries |
| **Campaign moved behind More filters** | Date-stamped ad names that grow with every ad; two already cover 78% of leads. Per-campaign analysis belongs on the dashboard |
| **Budget dropped from the list columns** | Null on all 1,073 rows — Meta does not supply it. Still on the deal page |
| **Phone and Source added as columns** | Phone was buried under the name; source was invisible |
| **"Not called yet"** shown instead of Qualifying before the first call | Every deal reads Qualifying, which tells nobody anything. Derived in `stage-badge.tsx` — deliberately **not** a database stage, since that would add a funnel step no transition leads out of |
| **City filter offers 58 real towns + "Other"** | The Meta form takes free text: 231 raw values, 165 appearing once, including pincodes and `chennaiytttt` |
| **Importer B: Meta is the sole source of deals** | 974 of 1,063 Meta phones also appear in the tracker. The spec's original rule would have created ~974 phantom deals |
| **Scheduling via Supabase `pg_cron` + `pg_net`** | Hostinger has no scheduler, and this survives a host move. All timing in `Asia/Kolkata` |

---

## Live state

- **1,073 Meta leads** imported, all in `qualifying`, **none marked Won**
- **Importer B has not been run.** The ~700 non-Meta tracker leads are not in the
  system yet
- **Three mock accounts**, all `LucaDemo2026!`:
  `admin@luca.test` / `9000000001` · `crmmanager@luca.test` / `9000000002` ·
  `salesrep@luca.test` / `9000000003`.
  Real accounts get created from Admin → Users after the demo. **Nothing is ever
  emailed** — `.test` cannot receive mail and accounts are created confirmed
- **WhatsApp is off** (`app_settings.whatsapp_enabled`) and stays off for MVP
- **Schema is current through `20260830120000_deal_list_view_quote_sent.sql`**,
  which added `latest_quote_sent_at` to `deal_list_view`

### Things that cost hours to discover

- **Connect to Postgres through the pooler**, `aws-0-ap-south-1.pooler.supabase.com:5432`.
  The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from a
  machine without IPv6. The password contains an `@` and must stay
  percent-encoded or the URI parses the rest as the hostname
- **`supabase link` does not work** — the project is in LUCA's Supabase org and
  the local CLI is signed in as a different account. `db:push` passes
  `--db-url` directly and needs no org access
- **Grants are not automatic.** "Automatically expose new tables" is OFF, so a
  migration-created table has privileges for nobody, service role included, and
  every query returns `42501`. Any new table needs an explicit grant — see
  `20260828120500_grants.sql`
- **Their Meta ad account is on a US timezone** — 1,065 of 1,074 rows carry
  `-05:00`. Stored correctly as instants, but every date must render in
  `Asia/Kolkata` or LUCA sees the wrong day

---

## Open items

**Before go-live**

- **Supabase Pro, ~₹2,200/month.** Non-negotiable: the free tier has **no
  backups** and this is becoming their only lead database
- Hostinger plan confirmed as **Business or Cloud** — Node.js does not run on
  Premium. This also settles the Node version to pin in `engines` and `.nvmrc`
- hPanel access, DNS control, subdomain `crm.lucaelevators.com`
- Prepaid SIM if WhatsApp is enabled — it ships flagged off
- One week of parallel running before cutover

**Unresolved**

- **Maintenance ownership after handover.** The highest-risk open item and the
  one most likely to sour a friendship. Retainer, or a stated understanding they
  engage a developer when it breaks
- Build fee — ₹1–1.5 lakh suggested for MVP scope

**Recommended to LUCA** — see [`DATA-HANDLING.md`](DATA-HANDLING.md): set the
Meta ad account to India time, make the city question a dropdown, grant
ad-account access so campaign names export properly.
