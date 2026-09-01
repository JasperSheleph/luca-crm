# What the CRM does to your data automatically

*For LUCA Elevators. Last updated 28 August 2026, after importing 1,073 Meta leads.*

**Walking someone through this in a meeting?** Use
[`DATA-HANDLING-BRIEF.md`](DATA-HANDLING-BRIEF.md) — the same ground in one page
of bullets. This document is the version to read alone, and the one to reach for
when someone asks *why*.

Your lead data arrives messy — that is normal, and not a criticism. People type
their city as an email address, Meta exports timestamps in an American timezone,
and the same customer appears three times under two spellings. The CRM cleans
this up as leads come in.

This document lists **every automatic correction the system makes**, so nothing
is a surprise, and says **what would fix each problem at source** — because
cleaning up after a problem is always second-best to not having it.

---

## 1. Phone numbers

**What arrives:** `p:+919566114558`, `9566114558`, `09566114558`, `+91 95661 14558`,
and about 23 international numbers like `+18015511772`.

**What the CRM does**

- Strips the `p:` prefix Meta adds, plus spaces, brackets and dashes
- Adds the `+91` country code when it is missing
- Removes the leading `0` people add out of habit — `09566114558` becomes `+919566114558`
- Stores every number the same way, so the same person is recognised however they were typed

**Numbers it cannot dial** — international ones, or ones with too few digits — are
**imported and flagged, never thrown away.** 23 of your 1,073 leads are flagged
this way. Someone should look at them; a few may be genuine customers who typed
their number wrongly.

**Permanent fix:** add phone validation to the website form so a customer cannot
submit an unusable number. Meta's own form already validates, which is why
almost all the bad numbers are from other sources.

---

## 2. Dates and times — the important one

**What arrives:** Meta timestamps every lead in **the timezone your ad account is
set to**. Yours is set to a **United States timezone**: 1,065 of your 1,074 leads
carry a `-05:00` offset rather than India's `+05:30`.

**What the CRM does**

- Stores the exact moment the lead arrived, independent of any timezone
- **Displays every date and time in India time**, everywhere in the system
- Runs every scheduled job — the 9am overdue reminder, the 7pm daily summary — on India time

Nothing is wrong with your data. But if anyone opens the raw Meta CSV in Excel,
they will see times that look several hours off. That is Excel showing the
American timezone, not an error.

**We also keep the original lead date.** A lead from 24 April shows as 24 April,
not as the day it was imported. This matters more than it sounds: "how long did
this lead wait before anyone called?" is one of the most valuable numbers you
have, and it is only measurable if the original date survives. Yours span April
to August, exactly as they should.

**One lead was rejected** — its date field contained the single character `~`,
which is not a date. It was reported rather than silently dropped.

**Permanent fix:** change your Meta ad account's timezone to India Standard Time.
Future exports will then read correctly everywhere, including in Excel. This does
not affect anything already imported.

---

## 3. Cities and your service area

This is where the messiest data lives. Your 1,073 leads contained **280 different
spellings** for roughly 60 real places.

**What the CRM does, in order**

1. Lowercases the text and trims spaces — `" Chennai "` and `"CHENNAI"` become `chennai`
2. Removes punctuation and collapses double spaces — `"Chennai,"` becomes `chennai`
3. Looks the result up in an **alias list** you control — `trichy` becomes `tiruchirappalli`, `cbe` becomes `coimbatore`, `pondy` becomes `puducherry`
4. Checks the result against your **service area list** — also yours to edit

Both lists live in **Settings → How it works**. Adding a spelling takes seconds
and needs no developer.

**What changed after the first import.** 29% of leads had a city the system did
not recognise — almost all real Tamil Nadu towns simply missing from the initial
list: Cuddalore, Tirunelveli, Namakkal, Pollachi, Chengalpattu, Karur, Theni,
Tenkasi and others. The list was rebuilt from your actual data. Recognition went
from **67% to 78%**.

**What is still unrecognised, and why that is correct**

| | |
|---|---|
| Bangalore, Hyderabad, Kochi, Ahmedabad, Jammu, Thiruvananthapuram, Thrissur | Genuinely outside Tamil Nadu and Puducherry — about 2% of leads, correctly not matched |
| `tamilnadu` | A state, not a city |
| ~165 one-off entries | Pincodes, full addresses, email addresses, prices, and text like `1làkh` typed into the city box |

**Matching is exact, not clever — on purpose.** The system will not guess that
`chenai` means Chennai unless you tell it. A guess that quietly files a Chennai
lead under Coimbatore is worse than an honest "not recognised", because a wrong
answer looks just like a right one on a report.

**Note on outstation:** around 60% of your leads are outside Chennai, deliberately
— your campaigns target Trichy, Madurai, Salem, Coimbatore and Puducherry by
name. The CRM treats outstation as **normal business**, never as a warning.

**Permanent fix:** change the city question in your Meta lead form from free text
to a **dropdown list of towns you serve**. That removes the problem entirely for
new leads. Until then, add spellings to the alias list as you notice them, then
run the re-check tool so existing leads pick up the change too.

---

## 4. Campaign names

**What arrives:** 9 of your leads have this where the campaign name should be:

> *"You don't have enough permission. Please refer to this help: …"*

That is a Facebook permissions error that got exported as though it were text.

**What the CRM does:** clears it. Left alone, it would appear on your dashboard as
a campaign named "You don't have enough permission", competing for attention with
real campaigns.

**Permanent fix:** grant ad-account access to whoever exports the CSV. Meta will
then export the real campaign names. This is also what would eventually let the
dashboard show **cost per lead by campaign**.

---

## 5. Duplicates and repeat customers

**Same person, second enquiry.** Matched on phone number. The CRM creates a **new
deal against the existing customer**, rather than a second customer record. You
see their full history, and your conversion figures stay honest — one person
enquiring twice is two enquiries, not two customers. 11 of your leads are repeats.

**Same file imported twice.** Safe. Every Meta lead carries an ID, and re-importing
a file you have already loaded imports nothing and tells you so. Tested: the
second run imported 0 and reported 1,073 already present.

---

## 6. Columns deliberately ignored

| Column | Why |
|---|---|
| `lead_status` | Reads `CREATED` on every single row across four months. It carries no information |
| `is_organic` | Reads `false` on every row, same reason |

**Kept, because it does vary:** *"Are you planning to install the lift?"* — 1,039
said yes, 35 said no. That is a real signal and it is stored against each lead.

---

## 7. Small things worth knowing

- **42 leads arrived with no city at all.** Imported normally; the city is simply blank
- **2 email addresses are malformed** — someone's phone number got typed onto the end. Imported as-is rather than rejected
- **Dropdown values can be renamed or hidden, never deleted.** Rename "Just exploring" and it updates everywhere, including on deals closed months ago, because deals point at the entry rather than storing its text. Deleting is not offered at all: an entry that fifty old deals point at would take your reports down with it
- **No email is sent to anyone.** Password links are generated on screen for an admin to hand over directly

---

## Summary — what would help most, in order

| Fix at source | Effort | What it removes |
|---|---|---|
| **Change the Meta ad account timezone to IST** | Minutes | Confusing timestamps in every raw export |
| **Make the city question a dropdown in the Meta form** | Minutes | The single largest source of messy data |
| **Grant ad-account access for exports** | Minutes | Broken campaign names, and unlocks cost-per-lead later |
| **Add phone validation to the website form** | Small dev task | Most unusable phone numbers |

None of these are blocking. The CRM handles all of it today. They would just mean
it has less to clean up — and less cleaning means fewer places for something to
be quietly wrong.
