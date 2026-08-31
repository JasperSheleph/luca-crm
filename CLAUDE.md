# LUCA Elevators CRM

A lightweight CRM for a ~10-person lift company in Tamil Nadu, covering **lead
capture through to Won**. Next.js (App Router) + Supabase + Tailwind.

Read this first, then [`docs/PROGRESS.md`](docs/PROGRESS.md) for where the build
actually is. The full specification is [`LUCA-CRM-BUILD.md`](LUCA-CRM-BUILD.md);
where it disagrees with `docs/PROGRESS.md`, PROGRESS is right and the spec has
not caught up yet.

---

## Where we are

**Steps 1–3 of the ten-step build order are done, and step 8 (notifications) is
built ahead of order. Step 4 is still next, and still the one that matters.**

1,073 real Meta leads are live in Supabase. Sign in as `9000000001` (or
`admin@luca.test`) with `LucaDemo2026!` — the mobile number works as a login.

Step 4 is the CRM Manager's work queue, and it is **not a new screen.** It
extends `/deals` with saved presets and an oldest-first sort instead of building
the `/queue` route the spec asks for. A second list beside Deals would repeat the
`/admin/leads` mistake, and `/deals` already answers two of the five buckets as
filters. The reasoning is in [`docs/PROGRESS.md`](docs/PROGRESS.md).

What still has to be true: **logging a call is one interaction.** RNR is 30% of
~440 leads a month, and it happens in the lead slide-over without a page load.
Worth timing once against a spreadsheet cell before building further.

Notifications are wired but the schedule is **not live** — `npm run db:push`
then `npm run cron:setup`. See [`docs/NOTIFICATIONS.md`](docs/NOTIFICATIONS.md).

---

## Two constraints behind every decision

1. **LUCA has no technical staff.** Anything they might want to change is a
   database row editable from Admin → Settings, never a code change. If a
   request means editing a `.tsx` file, check whether it should have been a row.
2. **There is no full-time maintainer.** No dependency that needs version
   upkeep. "Where do I change X?" must stay obvious six months from now.

---

## Rules that cause real damage

Each of these has already cost hours. They are not hypothetical.

**One database, shared by every machine and branch.** There is no per-branch
database. Git isolates code and nothing about schema, so two branches each
applying a migration leaves the database agreeing with neither, and the app then
fails in ways that read as code bugs. Migrations are **forward-only** — never
edit one that has been applied. Run `npm run db:status` after every pull. See
[`docs/WORKING-ON-TWO-MACHINES.md`](docs/WORKING-ON-TWO-MACHINES.md).

**Never run `npm run build` while `next dev` is running.** They share `.next`,
and the production build overwrites the dev server's chunks. The symptom is a
page that renders but where nothing is clickable.

**A client component must not import a runtime value from `lib/queries/*`.**
Doing so drags `next/headers` into the browser bundle and breaks every page.
`tsc` passes anyway — TypeScript cannot see the server/client boundary. Import
types with `import type`, and put shared constants in `lib/domain/*`, which has
no database imports.

**Do not wrap a client component using `useSearchParams()` in `<Suspense>` on a
dynamic route.** The boundary is only needed for statically rendered routes.
On a dynamic one it leaves the component server-rendered and never hydrated —
rows appear, and no button, filter or checkbox does anything.

**Server actions work without JavaScript.** `form.requestSubmit()` posts and
succeeds on a page that never hydrated, which makes a broken page look healthy.
When verifying, exercise something backed by client state, not just a form.

---

## Working on it

```bash
npm run dev          # http://localhost:3000
npm run dev:lan      # prints the phone URL first, for testing on a device
npm test             # domain unit tests
npm run typecheck
npm run db:status    # what is applied vs what is local
npm run db:push      # apply new migrations
```

`.env.local` is required and gitignored — copy `.env.example` and fill it from
the Supabase dashboard. `data/` holds the customer CSVs and is also gitignored;
the importer tests skip themselves without it.

## Where things live

```
app/            Routes. Rendering only — thin.
components/     Presentational. No DB calls, no business rules.
lib/domain/     Business rules. Pure, no DB, no React, fully tested.
lib/queries/    Every database read.   lib/actions/  Every database write.
lib/notifications/  The engine. notify() is the only way anyone is told anything.
lib/db/         Supabase clients. admin.ts bypasses RLS — read its warning.
supabase/       Migrations and seed data.
```

Every stage transition goes through `lib/domain/stages.ts`. Every permission
check goes through `lib/domain/permissions.ts`. Every notification goes through
`notify()` in `lib/notifications/dispatch.ts`. There is no second path to any of
them, and adding one is how this becomes unmaintainable.

## Working with real customer data

The 1,073 leads are **real people** — real names, real phone numbers. When
testing writes, remove what you created afterwards, and check whose it is before
deleting anything: some activity in there is the owner's own trial of the app,
not test residue.
