# LUCA Elevators CRM — Project Context

*A complete briefing document. Share this with Claude Code, any other LLM, a future developer, or anyone joining the project. It assumes no prior knowledge.*

---

## 1. The company

**LUCA Elevators** — lucaelevators.com — is a residential and commercial lift company operating across Tamil Nadu and Puducherry, headquartered in Chennai. Tagline: *"Lifts with Care."* Around 10 people, expanding toward 15–20.

They sell and install home lifts and small commercial lifts, across **Hydraulic**, **Hydraulic Industrial**, **MRL** and **Traction** mechanisms. Their marketing emphasises a small footprint (from about 3×3 ft), retrofitting into existing homes, and elderly-parent accessibility. Their site promises an itemised quotation within about 4 hours of a site assessment — against a real-world turnaround of roughly 2 days.

Their website is WordPress on Hostinger, built by an agency called "Jesus Digital Beacon." It has a 5-step lead-capture quiz, a contact form, and `wa.me` links to **7550002335** on every call-to-action.

### The people

| Name | Role | In the CRM |
|---|---|---|
| **Vishal** | CEO, owner | Admin |
| **Vaishali** | Co-founder, Vishal's sister | Admin — light-touch, mainly oversight |
| **Jennifer** | CRM Manager | The hub of the sales process |
| 5–6 Sales Reps | Field sales | Site visits, negotiation |

---

## 2. The problem

Everything runs on WhatsApp and spreadsheets:

- Vaishali manually updates a lead spreadsheet every morning
- No follow-up reminders, no appointment tracking, no reliable next-action dates
- Vishal cannot see what his sales team is doing
- No record of what a rep promised a customer
- No way to confirm a rep actually visited a site

There is also a **trust dimension**. They want verification calls, GPS check-ins and activity logging partly because they worry about reps misreporting visits or diverting leads.

### What they tried

| Tool | Why it didn't work |
|---|---|
| Zoho CRM | Integration problems with Meta leads |
| Odoo CRM | One user on the free plan, no call integration, no data migration |
| Other vendors | ₹10k/user/year, or ₹25k/year for 5 users plus setup, deployment and integration fees. Customisation pushed delivery to 1–2 months |

---

## 3. What we're building

A lightweight custom CRM covering **lead capture through to Won**. Built once by Jasper, handed to LUCA, who have no technical staff.

**Out of scope:** CPQ, post-sale installation tracking, AMC renewals, expense tracking, call recording. All documented in section 12 of `LUCA-CRM-BUILD.md`.

### The two constraints that shape every decision

1. **LUCA has no technical team.** Anything they might want to change must be a database row editable from an admin screen — never a code change.
2. **Jasper is not a full-time maintainer.** No third-party integrations needing version upkeep. The codebase must make "where do I change X?" obvious six months later.

---

## 4. Their sales process

Not a standard CRM where a rep owns a lead end to end. It's a **hub-and-spoke model** where the CRM Manager is the hub and reps are dispatched field agents.

```
Meta / website / other leads
        ↓
   QUALIFYING  (auto-assigned to a CRM Manager; she calls and logs the disposition)
        ├──→ Not Pursued  (dropped after a call, with a reason)
        ↓
   APPOINTMENT SCHEDULED  (she books, assigns a rep; rep confirms with the customer)
        ↓
   SITE VISIT DONE  (rep visits, checks in, uploads photos)
        ↓
   [VERIFICATION GATE]  she calls the customer to confirm the visit happened
        ↓
   QUOTE SENT  (prepared offline in Excel, uploaded against the deal)
        ↓
   NEGOTIATION  (rep negotiates, can escalate)
        ↓
   WON (advance received) │ LOST (reason required)
```

Alongside sits **Nurture** — a parked state for "call me in eight months," which leaves the active pipeline and wakes on a date.

**Demo visit** — taking a customer to see a nearby installed lift — happens for some deals but not all, so it's recorded as an activity, not a stage.

---

## 5. What their real data showed

Two sources were analysed: a **Meta Lead Ads export** (**1,074 rows, 24 Apr – 27 Aug 2026**) and their **live sales tracker spreadsheet** (1,763 rows, May–Aug 2026). Both corrected assumptions the plan had been built on. Every figure below was re-verified against the files on 28 Aug 2026.

| Finding | Consequence |
|---|---|
| **~440 leads/month total**, of which ~250 come from Meta | Other lead sources exist beyond Meta |
| **Nearly every lead gets called** — only 137 of 1,762 tracker rows carry any status | **There is no screening step.** An earlier design had one; it was removed |
| **RNR (ring-no-response) is 30% of all leads** | Logging an RNR must be one interaction. This is the adoption test |
| **The Remarks column holds entire call histories** — 88% contain date patterns, 196 rows have 3+ dated entries in inconsistent order | The `activities` timeline is a direct replacement. This is the core value of the project |
| **Structured columns are abandoned** — Floors filled in 46 of 1,762 rows, yet floors appear constantly inside remarks text | Qualification fields must be fast and optional, never gates |
| **Only 2 rows marked `won`** across 1,762 leads | Status isn't maintained. **They have no reliable conversion baseline** — don't present tracker numbers as truth |
| **59% of leads outside Chennai — deliberately.** Campaigns named "Outside Chennai", "Puducherry", "Tri,Mud,Salem,CBE", "TN" | Service area is TN + Puducherry. Outstation is normal business |
| **Only ~2% fall outside Tamil Nadu** (Bangalore 9, Hyderabad 6) | Geography was never the filter |
| **281 distinct city spellings in the Meta file and 522 in the tracker**, for ~30 real cities | City normalisation with an editable alias map is required |
| **4.65% duplicate phone numbers** in the tracker (vs 1.02% in the Meta file), plus explicit "repeated lead" markers | Duplicate detection matters |
| **974 of 1,063 Meta phone numbers also appear in the tracker** | The two files are largely the same people. **Meta is the source of deals; the tracker supplies history and the 732 leads Meta never saw.** Getting this wrong creates ~974 phantom deals |
| **Five date formats** in the tracker's Date column | The legacy importer needs a tolerant parser |
| **22 international/malformed numbers**, one row with `created_time` = `~` | Flag, don't drop. Skip junk rows gracefully |
| `lead_status` and `is_organic` identical on every Meta row | Ignore both columns |
| Platform split: **65% Facebook, 35% Instagram** | Worth reporting on |

### Their Meta CSV format

18 columns: `id, created_time, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, form_id, form_name, is_organic, platform, are_you_planning_to_install_the_lift?, full_name, email, phone_number, city, lead_status`

Phone numbers arrive prefixed: `p:+919566114558`.

---

## 6. Key decisions, and the reasoning

### No screening stage

An earlier design had an admin filtering leads before the CRM Manager saw them. The tracker data disproved it — everything gets called, and the drops that do happen are recorded *after* a conversation. New leads auto-assign and land directly in Qualifying.

### CSV upload only. No Make.com, Zapier, or any automation vendor

Real-time ingestion solves a problem LUCA doesn't have; they work in batches. CSV matches reality, costs nothing, adds no vendor, needs no Meta App Review, and cannot break. Make.com's free tier (1,000 credits/month, ~3 credits per lead) wouldn't have covered their volume anyway.

### Customer and Deal are separate tables

One split solves three problems: duplicate enquiries show prior history, a B2B client with multiple sites is one customer with several deals, and a revived lead becomes a *new* deal on an *old* customer so conversion metrics stay clean.

### Two interfaces, not three

Admin and CRM Manager share screens with role-gated actions. Only the rep mobile view is genuinely distinct. Admin is a superset of CRM Manager, so the owners can cover absence.

### `crm_manager` is a role, not a person

Several people can hold it. `lead_assignment_mode` supports `auto_single`, `round_robin`, or `manual`, and admins can always assign or reassign to any CRM Manager.

### What the verification gate actually does — be honest with Vishal

He believes it prevents reps stealing leads. **It doesn't.** A rep who wants to steal a lead simply never logs it. The verification call catches a rep who *claimed a visit he didn't make* — false reporting, not theft. Theft is prevented by centralised intake and assignment, which they already have.

Worth building anyway. Vishal should just know what he's actually getting.

### Everything configurable lives in the database

Users, roles, lead sources, call dispositions, loss reasons, not-pursued reasons, service area cities, city aliases, budget bands, assignment mode, SLA timings, notification rules, required fields. All admin-editable. **Values can be deactivated but never deleted** — deleting a value referenced by historical deals silently breaks reporting.

### Other settled decisions

| Decision | Choice |
|---|---|
| Auth | Password, with **either a mobile number or an email** as the identifier. A mobile is mandatory and unique for every user — reps work from phones and know their own number better than an assigned email. Not Supabase phone auth, which would need a paid SMS provider |
| Offline support | None |
| Data export | In-app export button, not a Google Sheets sync |
| WhatsApp | Internal only, behind a feature flag. Template text locked; triggers editable |
| `minimum_space` | Free text. A sales reference, not a tracked entity |
| Hosting | Hostinger, built portable |
| Scheduled jobs | Supabase `pg_cron` + `pg_net` calling a protected route. No host scheduler, survives a move. **All timing evaluated in `Asia/Kolkata`** |
| Legacy tracker | History and non-Meta leads only. Meta is the source of deals |
| Database | Supabase — free while building, **Pro at go-live for daily backups** |
| Demo visit | An activity, not a stage |

---

## 7. The WhatsApp constraint

A phone number can only be registered to **one** WhatsApp product at a time:

- **WhatsApp Messenger** — the consumer app
- **WhatsApp Business App** — the free small-business app. Almost certainly what LUCA uses today
- **WhatsApp Cloud API** — programmatic, **no app at all**

Registering to Cloud API **removes the number from the Business App**. If 7550002335 were migrated — the number on every website CTA — nobody could open WhatsApp to answer customers.

Since MVP WhatsApp is internal only, the fix is a **new prepaid SIM**, ₹200–500, never previously on WhatsApp. Meta permits virtual/VoIP numbers on the Cloud API, but OTP delivery is unreliable and support can be withdrawn — not worth the risk at this price.

**Meta Business Verification is already complete.** Jasper has full business portfolio access and full Page access. Ad account access is **not needed** for MVP — `campaign_name` already comes through the CSV. It would only matter for cost-per-lead reporting later.

---

## 8. Current state of access

| Item | Status |
|---|---|
| Supabase project | ✅ Created under LUCA's org, Mumbai region, auto-expose off, automatic RLS on |
| Meta business portfolio | ✅ Full access, Everything |
| Meta Page | ✅ Full access |
| Meta ad accounts | ❌ Not needed for MVP |
| WordPress admin | ✅ |
| Hostinger webmail | ✅ |
| Gmail (LUCA's) | ✅ Used for infrastructure accounts so they own them at handover |
| **Hostinger hPanel** | ⏳ Waiting. Needed for deployment only |
| **DNS control** | ⏳ Unknown whether LUCA or the agency holds it |
| Prepaid SIM | ⏳ WhatsApp only, ships flagged off |

---

## 9. WordPress findings

**WPForms Lite is the active form plugin.** Contact Form 7 and Forminator are installed but inactive.

WPForms Lite doesn't store entries in the database and doesn't support webhooks — both are Pro features. Submissions have only ever been emailed. The connection route is a small custom plugin hooking `wpforms_process_complete` and POSTing to `/api/leads/inbound`.

⚠ **WP Mail SMTP is reporting failed sends.** Since Lite stores nothing and only emails, website leads may be getting lost right now. Parked for investigation — it doesn't affect the build, since the ingestion endpoint is already source-agnostic.

The 5-step quiz is probably not WPForms (Lite has no multi-step) and may be a custom Elementor widget from the agency. **Booked** and **MC4WP Mailchimp** are also active and may be capturing leads nobody has mentioned.

---

## 10. Known risks

**Rep adoption is the biggest.** This is visibly a control system. If reps experience it as surveillance with no benefit to them, they'll log the minimum and the dashboard becomes fiction. The rep app has to be genuinely faster than WhatsApp for the rep's *own* work.

**RNR logging speed is the CRM Manager's adoption test.** 30% of ~440 leads a month. If it's slower than typing into a spreadsheet cell, the CRM loses.

**Maintenance ownership is unresolved.** Tokens expire, dependencies go stale. Jasper can't maintain it and LUCA has no technical staff. Needs an explicit agreement — a retainer, or a stated understanding they hire someone when it breaks.

**Jennifer is a single point of failure.** ~440 leads/month plus verification calls and quoting. The admin override and multi-CRM-manager support cover it structurally, but it's an operational issue worth raising.

**Geolocation is spoofable.** A deterrent, not proof.

**Leads wait weeks before anyone calls.** Almost certainly their largest addressable loss. The CRM tracks lead age at first contact specifically so this becomes visible.

---

## 11. Commercials

Their anchor: Zoho at roughly ₹10k/user/year — ₹50k for five users today, **₹1.5L at fifteen reps** — or ₹25k/year for five plus setup, deployment and integration fees.

The pitch is **one-time build, owned forever** versus **per-user recurring that scales with headcount**. Suggested range: **₹1–1.5 lakh** for MVP scope.

Running costs land around **₹2,900–3,900/month** (Supabase Pro, Hostinger, WhatsApp) — roughly ₹35,000–47,000/year, and unlike Zoho it doesn't grow with headcount.

---

## 12. Working files

| File | Purpose |
|---|---|
| `LUCA-CRM-CONTEXT.md` | This document |
| `LUCA-CRM-PREREQUISITES.md` | Accounts, access, decisions, costs |
| `LUCA-CRM-BUILD.md` | The complete build specification, including section 12 on everything parked for later |
