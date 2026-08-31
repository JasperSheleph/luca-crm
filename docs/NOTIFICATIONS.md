# Notifications

*How anyone gets told anything. Build step 8.*

Read [`../CLAUDE.md`](../CLAUDE.md) first, then [`PROGRESS.md`](PROGRESS.md).

---

## What it does, in one paragraph

Nine rules live as rows in `notification_rules`. Four of them fire the moment
something happens; five fire on a clock the database keeps. Either way the
message is rendered and written to `notifications_log`, which is what the
in-app notification centre reads. If WhatsApp is switched on, the same message
also goes out through Meta's Cloud API — but nothing depends on that being
true.

**Admins change every rule from Admin → Settings → Notifications.** Timing,
recipient, threshold, and whether it runs at all are all rows. None of it is a
code change.

---

## The two paths

**Event-driven** (`timing_type: 'immediate'`) fires from the server action that
caused it. `assignDeal` tells the new owner; `changeStage` tells the admins
when an advance lands. No clock involved, and nobody's browser has to be open —
the write happens on the server during the request that caused it.

**Scheduled** (`daily_at`, `weekly_at`, `offset`) is driven by `pg_cron`:

```
pg_cron (every 15 min)
  └─ run_notification_cron()          a plpgsql function; reads job_config
       └─ POST /api/cron              with the x-cron-secret header
            └─ runDueJobs()           asks isRuleDue() which rules are due now
                 └─ notify()          renders, writes, optionally sends
```

The clock is in the database on purpose. Hostinger has no scheduler, and a Node
timer dies with the process — this survives both, and a move to another host.

`isRuleDue()` compares wall-clock time in `Asia/Kolkata`, always. The server is
almost certainly on UTC, and `daily_at_time` is a bare `time` with no zone, so
"9am" becomes 2:30pm IST the moment anyone forgets this. It is why
`lib/domain/notifications.ts` exists as a tested, pure module.

---

## Why nothing double-sends

The cron fires every 15 minutes and `isRuleDue()` deliberately tolerates 10
minutes of lateness, so one rule can be "due" on two consecutive ticks. Every
scheduled notification therefore carries a `dedupe_key`
(`trigger:user:scope`) with a unique index behind it, and the insert uses
`on conflict do nothing`. A second tick writes nothing and sends nothing.

Event-driven notifications pass no key at all. If a lead really was assigned
twice, that is two events, and the timeline should say so.

---

## Setting it up on a new deployment

Two commands, once:

```bash
npm run db:push      # creates dedupe_key, job_config, and schedules the cron job
npm run cron:setup   # tells the database the app's URL and the shared secret
```

`cron:setup` reads `APP_URL` and `CRON_SECRET` from `.env.local`, writes them
to `job_config`, then makes the same POST pg_cron will make and prints the
result. If that test fails, the schedule would have failed silently at 9am
tomorrow — so it is worth reading the output.

`job_config` exists because neither value can live in a migration: one is a
secret, and the other is not known until the app is deployed somewhere. It gets
no grant to `authenticated`, because the anon key ships in the browser bundle.

To check the schedule from the Supabase SQL editor:

```sql
select jobname, schedule, active from cron.job where jobname = 'luca-notifications';
select run_notification_cron();   -- fires one tick now
```

If `pg_cron` or `pg_net` were unavailable when the migration ran, it applies
cleanly and raises a NOTICE instead of failing — but nothing is scheduled.
Enable both in the Supabase dashboard and re-run `npm run db:push`.

---

## Turning WhatsApp on

Three separate things must all be true, and any one of them being false is a
skip, never an error:

1. `app_settings.whatsapp_enabled` is on (Admin → Settings).
2. `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are set.
3. `notification_templates.is_approved` is true for that template, and
   `meta_template_name` holds the name Meta approved.

All nine templates ship with `is_approved = false`. Meta reviews each message
body individually and that review is a lead time you cannot compress, so start
it early if WhatsApp matters for go-live.

**The wording cannot be edited in the app.** Meta only delivers templates it has
approved in advance, so changing the words means submitting them again. Timing,
recipient and on/off are all editable; the text is not, and Settings says so.

---

## The honest limitation

**The in-app centre is pull, not push.** It shows what is waiting the next time
someone opens the CRM. There is no web push, no service worker and no email —
if a rep does not open the app, nothing reaches them.

For office staff that is fine; they have it open. For a rep in the field, "you
will see it next time you open the CRM" is not a reminder about a site visit in
two hours. **WhatsApp is the only channel that actually reaches someone who is
not looking at the app**, which is what makes item 3 above a go-live question
rather than a nice-to-have. If WhatsApp is not going to happen, the fallback
that needs no approval is email, and it is not currently built.

---

## What is wired, and what is waiting

| Trigger | Fires from | Status |
|---|---|---|
| `lead_assigned` | `assignDeal`, `ingestLead` | **Live** |
| `deal_won` | `changeStage` → won | **Live** |
| `next_action_overdue` | daily job | **Live** |
| `uncontacted_leads` | weekly job | **Live** |
| `daily_summary` | daily job | **Live** |
| `appointment_tomorrow` | daily job | Live, but `appointments` is written by step 5 |
| `appointment_approaching` | offset job | Live, but `appointments` is written by step 5 |
| `visit_awaiting_verification` | visit completion | Waiting on step 5 |
| `verification_failed` | verification call | Waiting on step 6 |

The last two have no call site yet. The engine handles them; they need one line
in the action that step 5 and 6 will add.

**`bulkAssign` deliberately sends nothing.** Handing over two hundred leads
would put two hundred messages in one person's centre and on their phone, which
is how a notification system gets muted. The leads appear in their queue anyway.
The single-deal path notifies; bulk is a visible administrative act.

**The Meta CSV importer sends nothing either**, for the same reason — it goes
through `prepareLead`, not `ingestLead`, so the 1,073-row import path never
touches the engine.

---

## Where things live

```
lib/domain/notifications.ts   Pure: when a rule is due, who gets it, IST maths
lib/notifications/dispatch.ts The ONE send path. notify() — no second route
lib/notifications/jobs.ts     The scheduled job bodies
lib/notifications/whatsapp.ts The Cloud API call. Guarded three ways
app/api/cron/route.ts         Where pg_cron knocks
lib/queries/notifications.ts  The centre's two reads
lib/actions/notifications.ts  Marking read
app/(app)/notifications/      The centre itself
```

`notify()` never throws. A notification that fails must not roll back the
assignment or the stage change that caused it — the work is the record, the
message is a courtesy.

---

## When something is wrong

**Nobody is getting anything.** Check `select run_notification_cron();` returns
`posted to …` rather than `not configured` — if it is the latter, run
`npm run cron:setup`. Then check `cron.job_run_details` for the last runs.

**A rule stopped firing.** Look at `is_enabled` in Admin → Settings first;
that is the likeliest answer and someone can turn it off by accident.

**Messages arrive at the wrong hour.** Something is comparing UTC. Everything
scheduled must go through `isRuleDue()` / `istDayRange()`, which are tested for
exactly this.

**The badge is wrong.** It is `getUnreadCount()` in the app layout, computed per
request. A stale one means a `revalidatePath` was missed after a write.
