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
| 5 | Rep view, appointments, visits with geolocation, photos | **Built, not yet on a phone** |
| 6 | Verification gate, quotes | **Built, not yet walked through** |
| 7 | Importer B (legacy tracker) | **Built — NOT yet run** |
| 8 | Notification engine, in-app centre, `pg_cron` | **Built — schedule NOT yet live** |
| 9 | Dashboard, export, health page | **Built, not yet read on real data** |
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

### Steps 5 and 6

**No migration.** Every table, policy, grant and bucket these needed already
existed from step 1 — `appointments`, `visits`, `visit_verifications`, `quotes`,
`attachments`, and both private storage buckets.

**Step 5.** `/today` is two lists: visits booked for today and follow-ups past
their date. An appointment is a commitment to someone else, an overdue next
action one to yourself, and a rep owes both. The day window is computed in IST —
a 23:00 IST appointment is 17:30 UTC, so a naive UTC day drops the late ones.
Check-in is on `/today` itself, because a rep standing outside a building should
not have to open the deal first; check-out needs notes, so it lives on the deal.

Geolocation **never blocks**. A rep in a basement with no fix still has to be
able to work, and refusing would only teach them to stop using the app — which
costs more than an unlocated visit. A missing fix is recorded and shown, not
prevented. It is a deterrent, not proof: the verification call is the real
control.

Photos are compressed in the browser to roughly 300 KB before upload. A current
phone camera produces 3–5 MB frames and the bucket caps at 2 MB, so an untouched
upload fails on the rep's own handset. Five per visit.

Both buckets stay private and the tables store a **storage path, never a URL** —
the anon key ships in the browser bundle, so a public bucket would let anyone
holding it enumerate photographs of customers' homes. `/api/files` mints a
five-minute signed URL, running as the signed-in user so the storage policies
decide.

**Step 6.** Checking out sets `visit_verification_status` to `pending`, which is
what fills the Awaiting-verification queue and blocks a quote. A `failed` call
freezes the deal — that rule was already in `lib/domain/stages.ts` and is not
re-implemented anywhere. An admin resolution can only land on `confirmed` or
`not_required`, never back on `failed`, and the note is mandatory: it is a
judgement about a rep and should not be possible to make silently.

The verification panel is in the slide-over as well as the deal page, so the
Awaiting-verification preset can actually be rung down without a page load.
Quotes stay on the full page — they involve a file, and it is not a
many-times-a-day action.

Quotes are versioned, never replaced. "What did we send them in March" is a
question the spreadsheet could never answer.

**Still to verify.** None of this has been run against the real data or on a
phone. In particular: geolocation and the camera need HTTPS or localhost, so use
`npm run dev:lan`; and the photo path only proves out on a real handset.

### Step 9

**Export was already done** in step 3 (`app/(app)/deals/export/route.ts`), so this
was the dashboard and the health page.

Every number is computed in `lib/domain/metrics.ts` — pure, no database, 25
tests. Aggregating ~1,800 rows in JavaScript rather than SQL is deliberate: it
keeps "what does win rate mean" in one readable file instead of split between a
view and a component, and at this size the cost is unmeasurable. Revisit at ten
thousand rows.

Things decided while building it:

- **The funnel shows six stages, not nine.** Lost, Not Pursued and Nurture are
  parallel exits, not steps a deal passes through; drawing them as bars would
  invent a funnel that narrows for reasons it does not narrow for. They are
  counted separately underneath
- **Win rate and cycle time say so when there is nothing to measure.** No deal
  has closed in this system yet. The page states that in words rather than
  showing a confident-looking `0%`, and repeats that the old tracker's 2 Won
  across 1,762 rows is not a baseline
- **Median, not mean,** for lead age and cycle time. A handful of leads called
  after four months would drag an average somewhere no actual lead lives
- **Campaigns need 10 leads to appear** in the rate comparison. Three leads and
  one contact reads as 33%, which is noise presented as a finding
- **A non-zero bar always renders.** Four deals out of a thousand is 0.4% — a
  sub-pixel mark identical to zero, which is the one distinction the chart owes
  the reader. Caught by screenshotting the real markup, not by any test
- **One hue per chart, never a value-ramp.** Bar length already encodes size;
  colouring darker-where-bigger spends the only free channel saying it twice.
  The funnel is the exception and uses each stage's own badge colour, which is
  identity the reader already knows — and every row is labelled, so nothing
  rests on colour alone

The health page needs one **`security definer`** function, `system_health()` —
`pg_database_size()`, the storage total and the failed-job count are not
readable by `authenticated`, and `notifications_log` is read-own under RLS so an
admin cannot count anyone else's failures from the client. Security definer
bypasses RLS by design, so the function checks `is_admin()` itself; that check is
the only thing protecting it.

Percentages are measured against **three new settings rows** —
`database_limit_bytes`, `storage_limit_bytes`, `stalled_deal_days` — because the
allowance is a property of the Supabase plan and changes the day LUCA move to
Pro. A plan change should be a row edit, not a deploy.

`20260830140000_health.sql` is applied, so both pages read live numbers.

⚠ **The two allowances are seeded at the FREE tier** — 512 MB database, 1 GB
storage. That is correct today and wrong the moment Supabase Pro is bought:
the percentages would read roughly sixteen and a hundred times too high, which
is exactly the kind of false alarm that teaches people to ignore a health page.
Change both in Admin → Settings on the day the plan changes.

### Step 7 — built, deliberately not run

**No migration.** `rep_initials_map` was already seeded (empty).

What it is for, corrected after talking to Vishal: the tracker is **their live
working file across all sources**, not an archive. So the matched path is not
history — it is the **current state of ~1,031 deals**. All 1,073 Meta deals sit
in `qualifying` because that is where Importer A left them, not because that is
where they are. This is what turns the dashboard funnel from one bar into a
pipeline.

Three things it does: gives existing deals their real stage (81 rows have a site
visit done, 60 a quotation shared), adds the ~700 leads Meta never saw, and adds
the call history (88% of Remarks carry date patterns).

Decisions:

- **`plan()` and `commit()` share one code path.** A preview that runs different
  logic from the commit is a preview of nothing, and this writes append-only
  rows that cannot be undone
- **Stage only ever moves forward**, and never over a person: a deal already
  closed in the CRM is not reopened, and Nurture — someone saying "call me in
  eight months" — is never woken by a stale sheet (`shouldAdvance`)
- **A terminal tracker status beats a milestone flag.** A dropped deal that was
  quoted is still dropped; showing it as Quote Sent would put a dead deal in the
  live pipeline
- **Unrecognised statuses become Qualifying with the text kept.** ~37 of 137 are
  free-text sentences; inventing a stage from prose would put fiction in the funnel
- **`external_id` is namespaced `tracker:<phone>`** — `deals_external_id_key` is
  a global unique index shared with Importer A, and this also makes a re-run safe
- **Dates are day-first and take an explicit year.** 1,537 rows are like "2 May";
  defaulting to the current year would silently mis-date everything if re-run in
  January, and reading `05/01` as 5 January would be wrong on every ambiguous row
- **Source is `Legacy Tracker`, not a guess.** The tracker has no source column.
  Tagging ~700 rows "Website" would put fabricated attribution into the exact
  chart Vishal uses to judge ad spend
- **Nothing is dropped.** No phone → placeholder, flagged. Unreadable date →
  imported with none. Junk in Floors, Status Remarks, the RP string and the six
  unnamed trailing columns → all swept into the imported note

**Before running it:** fill `rep_initials_map` in Admin → Settings. 127 rows
carry initials and it is the only historical rep data in the entire dataset;
unmapped ones import with nobody attached. The preview names any it cannot
resolve.

**How to run.** Preview in Admin → Import, or `npm run import:tracker -- <file>`
for a dry run; add `--commit` to write. The UI needs the word IMPORT typed.

---

### Step 8 — built last, wired into everything before it

Nine rules and a tested pure module for deciding when each is due already
existed, and nothing called any of it. `notify()` in
`lib/notifications/dispatch.ts` is now the only path: it renders the approved
template, resolves recipients from the rule row, writes `notifications_log`,
and sends via WhatsApp only if that is on. It never throws — a message that
fails must not roll back the assignment that caused it.

Verified against a throwaway Postgres 16, because a half-applied migration
against the one shared database is this project's worst outcome:

- **All fourteen migrations apply in order**, including on a database with no
  `pg_cron` or `pg_net` — those raise a notice instead of failing, and
  `system_health()` degrades to "schedule unknown" rather than erroring.
- **Idempotency holds.** A repeated `dedupe_key` inserts nothing and returns no
  rows; event-driven rows, which carry no key, never collide. That is what
  makes a 15-minute cron safe against `isRuleDue()`'s 10-minute jitter window.
- **The secret is sealed.** `anon` and `authenticated` can read neither
  `job_config` nor execute the function that uses it.
- **`authenticated` cannot INSERT into `notifications_log`** — only read, and
  update `read_at`. Nobody can forge a notification to somebody else.

**Not verified against the live database.** `db:push` and `cron:setup` have not
been run, so nothing timed has ever fired.

Built after steps 4–7 landed, so the two triggers that had no call site —
`visit_awaiting_verification` and `verification_failed` — are wired into
`completeVisit` and `recordVerification` rather than left for later.

One gap closed that predates all of this: `verification_escalation_hours` has
been an editable setting since the first seed, and its help text has always
said "how long an unreachable verification waits before both admins are told".
Nothing told them — there was no rule, no template and no job. There is now
(`20260831130000`). The hours stay in `app_settings` rather than moving to the
rule's `threshold_value`, because two controls for one number is how a system
starts lying about what it will do.

## Decisions that supersede the spec

The spec is being corrected as we go, but these are the changes that came from
using the thing:

| Change | Why |
|---|---|
| **`/admin/leads` deleted**, merged into `/deals` as a Select mode | Two near-identical screens, and Leads shipped with no filter controls at all. Redirects now |
| **`warning` and `danger` are nearly the same colour** | Measured, not guessed: `#B45309` and `#B42318` are ΔE 8.6 apart in normal vision and 5.4 under deutan — below the threshold where anyone can tell two marks apart by hue. Every status on the Health page therefore carries a word and a symbol as well as a colour. Worth fixing in `globals.css` one day; the badges have the same problem |
| **Geolocation never blocks a check-in** | Spoofable anyway, so it was never proof. A basement with no fix must not stop a rep working; refusing teaches them to skip the app, which costs more than an unlocated visit. Recorded and shown when missing |
| **A click logs and stays; a number key logs and advances** | The spec said "a single tap or keystroke". Making both advance is wrong: `Connected - Interested` and `Call back later` need a next action on *this* lead. The keyboard is the bulk path (`1 1 1` down the RNRs), the mouse the considered one. Avoids hard-coding which dispositions are "done" in a `.tsx`, which would have been a code change LUCA cannot make |
| **`/queue` dropped; the work queue is presets on `/deals`** | The same mistake as `/admin/leads`, one step later. Two of the five buckets are already filters; what was actually missing is oldest-first ordering, three more filters, and one-interaction logging in the slide-over that already exists |
| **Sign in with mobile number or email**; mobile mandatory and unique | Reps work from phones and know their number better than an assigned email. Not Supabase phone auth — that needs a paid SMS provider |
| **Leads open in a slide-over**, not a separate page | Reviewing a queue without losing filters or scroll. Non-modal; the list stays interactive. `?lead=<id>`, written with the History API so stepping through leads does not re-run the page's queries |
| **Campaign moved behind More filters** | Date-stamped ad names that grow with every ad; two already cover 78% of leads. Per-campaign analysis belongs on the dashboard |
| **Budget dropped from the list columns** | Null on all 1,073 rows — Meta does not supply it. Still on the deal page |
| **Phone and Source added as columns** | Phone was buried under the name; source was invisible |
| **"Not called yet"** shown instead of Qualifying before the first call | Every deal reads Qualifying, which tells nobody anything. Derived in `stage-badge.tsx` — deliberately **not** a database stage, since that would add a funnel step no transition leads out of |
| **City filter offers 58 real towns + "Other"** | The Meta form takes free text: 231 raw values, 165 appearing once, including pincodes and `chennaiytttt` |
| **The ~700 tracker-only deals are tagged `Legacy Tracker`, not a guessed channel** | The tracker has no source column. Meta is primary and the website is the other confirmed source, but which of the 700 came from where is unknown — and a guess would land in the campaign report Vishal uses to judge ad spend |
| **Importer B: Meta is the sole source of deals** | 974 of 1,063 Meta phones also appear in the tracker. The spec's original rule would have created ~974 phantom deals |
| **Scheduling via Supabase `pg_cron` + `pg_net`** | Hostinger has no scheduler, and this survives a host move. All timing in `Asia/Kolkata` |
| **`job_config` table for the app URL and cron secret** | The database has to call the app, so it needs both — and neither can go in a migration or in `app_settings`, which every authenticated user can read |
| **Bulk assign sends no notifications** | Two hundred leads would be two hundred messages to one person. A muted notification system is a decorative one |
| **Notification links point at work presets, never at `/queue`** | `/queue` is a redirect since step 4. A digest saying "11 overdue" has to land on the eleven deals, sorted the way they are worked |
| **Escalation hours stay in `app_settings`, not on the rule** | The setting predates the rule and is already documented under Settings → How it works. Two controls for one number disagree eventually |

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
- **WhatsApp is off** (`app_settings.whatsapp_enabled`) and stays off for MVP.
  All ten templates are `is_approved = false` — Meta reviews each body
  individually, and until that happens the in-app centre is the only channel,
  which is **pull, not push**: it reaches nobody who does not open the app
- **The notification schedule is not live.** `npm run db:push` then
  `npm run cron:setup`, which needs `APP_URL` in `.env.local`. Until then
  nothing timed fires; the event-driven notifications work as soon as the
  migration is applied
- **The database is current through `20260830140000_health.sql`. Three
  migrations are written and NOT applied:** `20260831120000_notifications`
  (`dedupe_key`, `job_config`, the `pg_cron` schedule),
  `20260831130000_verification_escalation` (the tenth rule) and
  `20260831140000_health_notifications` (schedule status on the Health page).
  One `npm run db:push` applies all three

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

- **`npm run cron:setup` has not been run.** Step 8's code and the three
  migrations are applied, but `job_config` holds no `app_url` or `cron_secret`,
  so `pg_cron` has nothing to dial and no notification will ever fire. It needs
  `APP_URL` in `.env.local` — the address the app is reachable at *from the
  internet*, because `pg_net` calls it from Supabase's servers, not from this
  machine. `localhost` would let the script's self-test pass while the real
  schedule silently never runs, so this is deliberately deferred until the app
  is deployed at `crm.lucaelevators.com` (or a tunnel is stood up to test it
  end-to-end sooner). Re-runnable any time; it overwrites both rows
- **The IST timing check for `pg_cron` is therefore still unverified.** Step 8's
  own gate — a job firing at the correct **Asia/Kolkata** hour rather than UTC —
  cannot be exercised until the above is done
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
