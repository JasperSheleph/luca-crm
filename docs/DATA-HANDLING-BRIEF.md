# What the CRM cleans up automatically

*One page for walking the LUCA team through it. Figures measured on the 1,073
imported Meta leads and verified against the live database on 30 August 2026.*

**The reasoning behind each of these is in [`DATA-HANDLING.md`](DATA-HANDLING.md)**
— use that if someone asks *why* mid-meeting. Re-check the numbers before
reusing this; they move as soon as the legacy tracker is imported.

---

**Phone numbers**

- Strips Meta's `p:` prefix, plus spaces, brackets and dashes
- Adds `+91` when missing; removes the leading `0` people type out of habit
- Every number stored one way, so the same person is recognised however it was entered
- **23 numbers cannot be dialled** (international or too short) — imported and **flagged, never deleted**. Worth someone reviewing
- Duplicate detection matches on the last 10 digits

**Dates and times**

- **The original enquiry date is kept** — a lead from 24 April shows as 24 April, not the day it was imported
- That is what makes *"how long did this lead wait before anyone called?"* measurable at all
- Everything displays in India time, including the 9am and 7pm reminders
- ⚠️ **The Meta ad account is set to a US timezone** — 1,065 of 1,074 leads arrive stamped `-05:00`. Stored correctly, but a raw export opened in Excel will look hours off
- 1 lead was rejected outright: its date field contained the character `~`

**Cities**

- Lowercases, trims spaces, strips punctuation
- Applies the alias list — **40 mappings today** (`trichy` → `tiruchirappalli`, `cbe` → `coimbatore`, `pondy` → `puducherry`)
- Checks against the service area — **58 towns**, all editable in Settings
- **194 leads** have a city the system does not recognise; **42** have none at all
- Matching is **exact, never a guess** — a Chennai lead is never quietly filed under Coimbatore, because a wrong answer looks identical to a right one on a report
- **412 leads are outstation.** Treated as normal business, never flagged as a problem

**Campaigns**

- 9 leads arrived with a Facebook *permissions error* where the campaign name should be — cleared, so it does not appear as a fake campaign on the dashboard

**Duplicates**

- Same phone = same customer, new enquiry. **11 leads are repeats**
- Their full history is visible, and conversion figures stay honest
- Re-importing the same file is safe: it imports nothing and says so

**Columns ignored, and one kept**

- `lead_status` and `is_organic` — ignored, identical on every row across four months
- *"Planning to install the lift?"* — **kept**. 1,039 yes / 35 no. A real signal

---

## Four things worth fixing at source

| Fix | Effort | What it removes |
|---|---|---|
| Set the Meta ad account to India time | Minutes | Confusing timestamps in every raw export |
| Make the city question a dropdown | Minutes | The single biggest source of messy data |
| Grant ad-account access for exports | Minutes | Broken campaign names; unlocks cost-per-lead later |
| Add phone validation to the website form | Small dev task | Most unusable phone numbers |

*None of these are blocking — the CRM handles all of it today. They would just
mean less to clean up, and less cleaning means fewer places for something to be
quietly wrong.*

---

## Two things to say before someone spots them

- **The timezone point will confuse the room** if anyone opens the raw CSV during
  the meeting. The data is right; Excel is showing American time. Say it first
- The 194 unrecognised cities are a **source** problem, not a CRM one. The Meta
  form takes free text, so people type pincodes, addresses and `chennaiytttt`.
  The dropdown fix removes it entirely for new leads
