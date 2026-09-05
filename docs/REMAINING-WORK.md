# Remaining work before handover

*The single list of what is still missing. [`PROGRESS.md`](PROGRESS.md) records
what is built; this records what is not, and why each one matters.*

**Keep this current.** When something here is finished, move it to `PROGRESS.md`
and delete it here. When something new is found, add it here rather than only
mentioning it in conversation.

---

## 1. Lead intake — the biggest hole

**Today a lead can only enter the system through a CSV upload by an admin.**
The only two code paths that create a deal are `meta-commit.ts` and
`tracker-commit.ts`. There is no API, no manual entry, and no automation.

That means `phone_call`, `referral`, `walk_in` and `indiamart` are seeded as
lead sources with **no way to record one**, and Jennifer cannot enter a lead
from a call she is on.

These four are ordered deliberately — A unblocks B, C and D.

### A. `POST /api/leads/inbound` — the keystone

- `app/api/leads/inbound/` is an **empty directory**; the route was never written
- `ingestLead()` in `lib/ingest.ts` is complete but **called from nowhere**
- The hard part exists: it writes the raw payload to `inbound_leads_raw` *before*
  processing, matches customers on normalised phone, sets `is_repeat`, applies
  `lead_assignment_mode`, and appends the `assignments` row
- **To build:** a route handler that authenticates with `LEADS_INBOUND_API_KEY`
  (already in `.env.example`, and `/api/leads/inbound` is already in
  `PUBLIC_PATHS` in `proxy.ts`), validates the body with zod, calls `ingestLead()`,
  and **always returns 200** so a caller never retries into duplicates
- Everything below depends on this existing

### B. Manual lead entry — smallest, and needed daily

- **Missing entirely.** No screen creates a lead
- **To build:** an *Add lead* button on `/deals` for admin and CRM Manager,
  capturing name, phone, city, source and an optional first note
- **Must go through `ingestLead()`**, not a direct insert. A second insert path
  means duplicate detection, city normalisation and auto-assignment drift apart
  from the importers — the bug would surface months later as wrong dashboard numbers
- Should warn, not block, when the phone already exists: show the existing
  customer and offer "add as a repeat enquiry"

### C. Website leads — currently going nowhere

- Their site runs **WPForms Lite**, which does not store entries in the database
  and does not support webhooks. Both are Pro features
- Submissions have only ever been emailed, and **WP Mail SMTP is reporting failed
  sends** — so website leads may be being lost right now, before any of this
- The arithmetic supports that: the tracker holds ~440 leads/month while Meta
  accounts for ~250. Either the rest is being copied across by hand, or it never arrives
- **To build:** a small WordPress plugin (~15 lines of PHP) hooking
  `wpforms_process_complete` and POSTing to `/api/leads/inbound` with the API key.
  Put it in its own plugin file, **not** `functions.php`, which theme updates overwrite
- **Still to trace:** the 5-step quiz is probably a custom Elementor widget rather
  than WPForms, so it posts somewhere else. **Booked** and **MC4WP** are also
  active and may be capturing leads nobody has mentioned
- Worth resolving the SMTP failure independently — it is losing leads today

### D. Meta leads automatically — needs a decision

Currently manual: export a CSV from Meta, upload it. Three ways to automate,
and the choice has a real cost:

| Option | Cost | Trade-off |
|---|---|---|
| **Lead-forwarding service** (Make.com Core or similar) | ~₹800–1,100/mo | Absorbs Meta's annual API-version treadmill. The free tier will not cover ~440 leads/month at ~3 credits each |
| **Direct Meta webhook** | Free | Needs App Review for `leads_retrieval`, `pages_manage_ads`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement` — plus re-work whenever Meta deprecates a Graph version, roughly annually |
| **Stay on CSV** | Free | Works today. Someone has to remember to do it |

- **Recommendation: the forwarding service.** Not because it is technically
  better, but because of constraint #2 — there is no full-time maintainer, and
  the webhook route buys a free integration in exchange for annual maintenance
  nobody is committed to doing. Paying ~₹1,000/month to make that somebody
  else's problem is the cheaper answer over two years
- Either way the CRM side is unchanged: both POST to `/api/leads/inbound`, and
  `lead_source` is already an editable list. **Adding a source is configuration,
  not code**
- ⚠ Leads arriving in real time changes the meaning of `created_at`. Today it is
  the original Meta timestamp preserved through import; automated it becomes
  arrival time. Lead-age metrics stay correct either way, but confirm the
  forwarder passes Meta's `created_time` rather than its own

---

## 2. Built but never proven

Each has a gate that has not been run. None is a code gap.

- **Open the rep view on a real phone.** Step 5 has never run on hardware.
  Geolocation needs a secure origin, so this needs the deployed site or a
  tunnel — a LAN IP over http will not grant it
- **Run the tracker import.** ~700 non-Meta leads are still outside the system.
  Expect ~700 new legacy deals and **zero duplicates** for the 1,031 rows that
  match a Meta lead
- **Point `cron:setup` at a real URL.** Needs `APP_URL` reachable *from the
  internet* — `pg_net` calls from Supabase's servers, so localhost would let the
  self-test pass while nothing ever fires
- **Verify a job fires at the right IST hour**, not UTC. Cannot be tested until
  the above is done
- **Walk one deal through visit → verification → quote**, including a failed
  verification freezing the deal and an admin unfreezing it
- **Read the dashboard against real data** and sanity-check the numbers

---

## 3. Deployment — never was a step in the plan

The ten-step build order ends at *Docs*. **There is no step for making it live**,
and nothing in the repo is configured for it. This is a gap in the plan itself,
not work that was skipped.

**Nothing is deployment-ready today:**

- `next.config.ts` has **no `output` setting**. The default build expects the
  whole `node_modules` tree on the server, which is painful on shared hosting.
  `output: "standalone"` bundles only what is needed — decide once the Hostinger
  Node setup is known, because it changes the start command
- `npm start` is plain `next start`. No process manager, nothing to restart it
  after a reboot or a crash
- `docs/DEPLOYMENT.md` does not exist. It is a step 10 deliverable, but the
  *doing* has to happen before the *writing*

**Blocking, and on LUCA:**

- **Which Hostinger plan.** Node.js runs only on **Business and Cloud**. Premium
  and Single are PHP-only — if they are on Premium it is an upgrade or a
  different host. Everything else here waits on this answer
- **hPanel access**, separate from webmail and WordPress. Ask Vishal to add you
  via Account Sharing rather than sharing a password. If the agency set up the
  hosting, the account may be under *their* email
- **Who controls DNS** — LUCA or the agency
- **The Node version Hostinger offers.** `engines` says `>=20.9` with no ceiling
  precisely because this is unknown. Pin it in `engines` and `.nvmrc` once known,
  so nobody builds against something the host cannot run

**To do, in order, once the above are answered:**

1. Set `output` and the start command to match Hostinger's Node app setup
2. Create the subdomain `crm.lucaelevators.com` and point a DNS record at the app.
   SSL is automatic via Let's Encrypt
3. Set all runtime env vars in hPanel — `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
   `LEADS_INBOUND_API_KEY`, and the two WhatsApp vars if enabled.
   **`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_`**
4. Deploy, then confirm sign-in works over HTTPS on the real domain
5. **Only now** run `npm run cron:setup` with `APP_URL` set to the live address —
   `pg_net` calls from Supabase's servers, so this is the first moment it can work
6. Verify a scheduled job fires at the correct **IST** hour
7. **Retest the rep view on a real phone.** Geolocation needs a secure origin, so
   check-in has never actually been exercised — HTTPS is the first chance
8. Add `allowedDevOrigins` is dev-only and needs nothing in production; confirm
   the production build ignores it

**Before cutover:**

- **Supabase Pro** — the free tier has no backups
- **Nightly `pg_dump` to storage, and restore-tested once.** An untested backup
  is not a backup
- Website form plugin installed and posting real leads
- All users created, each person signs in successfully once
- Both importers run and spot-checked
- **One week of parallel running** — Jennifer works the CRM alongside the
  spreadsheet before anyone relies on it

---

## 4. Waiting on LUCA

- **Supabase Pro, ~₹2,200/mo.** Non-negotiable before go-live: the free tier has
  **no backups** and this becomes their only lead database
- **Hostinger plan confirmed as Business or Cloud.** Node.js does not run on
  Premium. This also settles the Node version to pin in `engines` and `.nvmrc`
- hPanel access · DNS control · `crm.lucaelevators.com`
- Prepaid SIM, only if WhatsApp is enabled — it ships flagged off
- **Maintenance ownership.** The highest-risk open item: a retainer, or a stated
  understanding they engage a developer when it breaks
- Build fee

**Recommended to LUCA** (see [`DATA-HANDLING-BRIEF.md`](DATA-HANDLING-BRIEF.md)):
set the Meta ad account to India time · make the city question a dropdown ·
grant ad-account access so campaign names export properly.

---

## 5. Handover pack — deliberately last

**Do not start these until the build is confirmed complete.** They describe the
system as shipped, so writing them early guarantees they are wrong.

- `SCHEMA.md` — every table and column, in plain language
- `DEPLOYMENT.md` — the Hostinger deploy **and** generic steps for any Node host
- `MAKING-CHANGES.md` — the "I want to… / where" index. Which changes are a
  Settings row and which need a developer
- `ADMIN-GUIDE.md` — for Vishal and Jennifer, not for a developer
- Credentials inventory

**When the handover is requested, these must reflect everything built and
modified since the spec was written** — including every decision in
`PROGRESS.md` that supersedes `LUCA-CRM-BUILD.md`. Re-read both before writing,
and confirm the build is final first.

---

## 6. Out of MVP scope

Recorded so nothing here is designed around them: call recording · CPQ and quote
generation · post-sale installation and AMC · rep expense tracking · cost per
lead by campaign (needs ad-account access) · rep–customer conversation
visibility · customer-facing WhatsApp · live Google Sheets sync. Reasoning in
`LUCA-CRM-BUILD.md` §12.
