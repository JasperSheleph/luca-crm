# LUCA Elevators CRM — Prerequisites

Current status. Section 2 is the only thing standing between you and starting the build.

---

## 1. Already done ✅

- **Supabase project** — organisation "Luca Elevators", region South Asia (Mumbai), Data API on, **Automatically expose new tables OFF**, **Enable automatic RLS ON**. Database password stored in a password manager
- **Meta access** — full business portfolio access ("Everything") and full Page access. Business Verification already complete
- **WordPress admin login** — form plugin identified as **WPForms Lite**
- **Gmail (LUCA's)** — used for Supabase; use it for any other infrastructure account so they own them at handover
- **Hostinger webmail**
- **Meta CSV export** — **1,074 rows, 24 Apr – 27 Aug 2026** (re-verified 28 Aug 2026)
- **Legacy sales tracker CSV** — 1,763 rows, May–Aug 2026. **Background and history only — not a lead source.** See Importer B in the build spec
- **Logo** — supplied as WebP (`cropped-ChatGPT-Image-...webp`), converted to PNG in the repo. SVG would be crisper if one exists
- Spec files: `LUCA-CRM-CONTEXT.md`, `LUCA-CRM-PREREQUISITES.md`, `LUCA-CRM-BUILD.md`

---

## 2. To start building — about 30 minutes, all on your machine

- [x] **Node.js 20+** installed — v26.4.0. ⚠ Pin `engines` to a version Hostinger actually offers before deploying
- [x] **Claude Code** installed
- [x] **Private GitHub repo** created — `github.com/JasperSheleph/luca-crm` (private, empty)
- [x] **Logo** copied into the repo
- [x] **`LUCA-CRM-BUILD.md` and `LUCA-CRM-CONTEXT.md`** placed in the repo root
- [ ] **Supabase keys** written into `.env.local` — see below. **Never paste keys into a chat window or a commit**

Then point Claude Code at the repo and give it `LUCA-CRM-BUILD.md`.

### `.env.local`

Create it **after** Claude Code scaffolds the app, at the repo root alongside `package.json`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

Supabase is renaming these — **publishable key** = anon, **secret key** = service_role.

- **Never commit it.** Next.js's default `.gitignore` covers `.env*.local` — verify before your first push
- **The service role key bypasses RLS entirely.** Server-side only, never prefixed `NEXT_PUBLIC_`
- **The database password is a different thing** — for direct Postgres connections, not the app

**Nothing external is blocking the build.** Everything below can be chased in parallel.

---

## 3. Blocks deployment, not development

- [ ] **hPanel access** — hpanel.hostinger.com, separate from webmail and WordPress. Ask Vishal to add you via Account Sharing rather than sharing a password. If the agency ("Jesus Digital Beacon") set up the hosting, the account may be under *their* email
- [x] **Which Hostinger plan?** **Answered 2026-09-05: LUCA is on Single, and Single runs Node.js.** Verified in the hPanel setup wizard, which offers "Push your code, we host it" tagged *Node.js* on this plan. The old warning here — that Node needs Business or Cloud — was **wrong**; Hostinger's support docs still say it, but they use the global plan names, and India's lineup is Single / Premium / Unlimited / Cloud Startup. No upgrade is needed
- [ ] **Who controls DNS** — LUCA or the agency
- [ ] **App URL** — `crm.lucaelevators.com`. Needs a DNS record pointing at the Node.js app. SSL is automatic via free Let's Encrypt

**Do not static-export.** Some Hostinger guides suggest `output: 'export'`. It disables server actions and API routes, which this CRM depends on entirely.

---

## 4. Blocks WhatsApp only — and it ships flagged off

The notification engine works fully without WhatsApp: everything writes to `notifications_log` and appears in an in-app notification centre. WhatsApp is an adapter behind `app_settings.whatsapp_enabled`.

### A new phone number is required

A number can only be registered to **one** WhatsApp product at a time. Registering to Cloud API **removes it from the WhatsApp Business App** — no dual mode. Migrating 7550002335, the `wa.me` target on every website CTA, would mean nobody could answer customers.

- [ ] **A new prepaid SIM, ₹200–500:**
  - Must **not** currently be on WhatsApp in any form. If it ever was, delete that account and wait a few days
  - Must receive **one** verification code by SMS or voice. After that the SIM needn't stay in a phone
  - **Use a real mobile SIM.** Meta's Cloud API does permit virtual and VoIP numbers, but delivery is unreliable — many operators don't route OTPs to them, US-hosted VoIP is blocked outright, and support for a number type can be withdrawn later

### Meta setup — Business Verification already complete ✅

- [ ] **Create a WhatsApp Business Account (WABA)** — minutes
- [ ] **Register the new phone number** — minutes, plus the verification code
- [ ] **Display name approval** — usually under a day
- [ ] **Template approval** — each individually, minutes to a day
- [ ] **Payment method** on the Meta account

> No Meta App Review needed. That belongs to the lead-ads API, which we're not using.
> **Ad account access is not needed** — `campaign_name` comes through the CSV. It would only matter for cost-per-lead reporting later.

---

## 5. Open decisions

- [ ] **Vishal: live Google Sheet, or is the export button enough?** The export button is built either way. A live sheet is the only thing that would need a Google service account
- [ ] **An SVG logo**, if one exists
- [ ] **Maintenance ownership and build fee** — see section 8

---

## 6. Before go-live

- [ ] **Supabase Pro — $25/month.** Non-negotiable. The free tier has **no backups**, and this becomes the company's only lead database. Also needed before photo storage passes 1GB
- [ ] Hostinger plan confirmed as Node-capable (**done — Single qualifies**), app deployed, subdomain live
- [ ] **Nightly `pg_dump` to storage** configured and *restore-tested once*
- [ ] WhatsApp templates approved and a test message received (if enabling)
- [ ] Website form hook installed — a small custom plugin on `wpforms_process_complete`
- [ ] All users created, roles assigned, **each person logs in successfully once**
- [ ] Both importers run **in order — Meta first, then tracker** — and spot-checked
- [ ] **One week of parallel running** — the CRM Manager works the CRM alongside the spreadsheet before cutover
- [ ] Handover pack complete: `SCHEMA.md`, `DEPLOYMENT.md`, `MAKING-CHANGES.md`, `ADMIN-GUIDE.md`, credentials inventory

### Verification checks that catch real bugs

- Import the Meta CSV. Expect **1,073 imported, 1 skipped** malformed row, **22 flagged invalid phone, ~11 repeat customers**
- **Confirm `created_at` shows April–August dates, not today's.** If it shows today, the importer used import time instead of the original timestamp, and every lead-age metric is silently wrong forever
- Log in as a rep and confirm another rep's deal returns **zero rows**, not a hidden UI element
- **Log 20 RNRs and time it.** RNR is 30% of all leads. If it's slower than typing into a spreadsheet cell, redesign before going further — this is the adoption test for the whole system
- Import the legacy tracker **after** the Meta CSV. Confirm **~700 new legacy deals and zero duplicate deals** for the 1,031 rows that match a Meta lead — a total near 2,800 deals means the merge rule failed and every dashboard percentage is wrong. Confirm remarks survive both as a full original note and as parsed call activities, and that `RP` initials resolved to reps
- Confirm a `pg_cron` job fires at the correct **IST** hour, not UTC

---

## 7. Running costs to agree with Vishal

| Item | Cost | When |
|---|---|---|
| Supabase Pro | ~₹2,200/mo | At go-live |
| Hostinger Business/Cloud | ₹400–900/mo | Possibly already paying |
| WhatsApp messages | ~₹300–800/mo | Only if WhatsApp is enabled |
| New SIM | ~₹300 one-time | |
| **Total** | **~₹2,900–3,900/mo** | |

Roughly **₹35,000–47,000/year**. Against Zoho at ₹50,000/year for five users today and ₹1.5L at fifteen reps — and unlike Zoho, this doesn't scale with headcount.

**Build fee:** ₹1–1.5 lakh suggested for MVP scope.

---

## 8. The conversation to have before handover

Not technical, but the highest-risk open item in the project.

**Who owns this after handover?** Tokens expire, dependencies go stale, WhatsApp templates need re-approval. You can't maintain it; LUCA has no technical staff. Agree on one of:

- a small annual retainer with you for keeping the lights on, or
- a stated understanding that they engage a developer when something breaks

Settle the build fee in the same conversation. Both are easier now than after you've sunk weeks in, and this is the thing most likely to sour a friendship eighteen months from now.
