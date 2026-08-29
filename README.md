# LUCA Elevators CRM

Lead capture through to Won, for a lift company in Tamil Nadu and Puducherry.

Next.js (App Router) + TypeScript · Supabase (Postgres, Auth, Storage, RLS) · Tailwind.
The only external service is the WhatsApp Cloud API, behind a feature flag — the
app is fully functional without it.

**Start with [`CLAUDE.md`](CLAUDE.md)** for orientation and the rules that bite,
then [`docs/PROGRESS.md`](docs/PROGRESS.md) for what is built and what is next.

The specification lives in [`LUCA-CRM-BUILD.md`](LUCA-CRM-BUILD.md); the company
background and the reasoning behind each decision in
[`LUCA-CRM-CONTEXT.md`](LUCA-CRM-CONTEXT.md). Where the spec disagrees with
`docs/PROGRESS.md`, PROGRESS is right — it records the decisions that came out
of actually using the thing.

---

## Running it

```bash
npm install
npm run dev
```

Requires `.env.local` at the repo root — copy `.env.example` and fill it in from
Supabase → Project Settings → API Keys. **Never commit it**; `.gitignore` covers
`.env.*`.

| Command | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Domain unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Apply migrations to Supabase |
| `npm run users:seed` | Create the initial user accounts |

## Database

Migrations live in `supabase/migrations/` and run in filename order.

```bash
npm run db:status   # what is applied
npm run db:push     # apply anything new
npm run users:seed  # create the mock accounts
```

Both scripts read `SUPABASE_DB_URL` from `.env.local` and pass it straight to
the CLI, so **`supabase link` is not needed** — which matters here, because the
project sits in LUCA's Supabase organisation and the local CLI is signed in as
a different account.

Two things about that URL, both of which cost an hour to find:

- **Use the pooler host, not the direct one.** `db.<ref>.supabase.co` is
  IPv6-only and unreachable from a machine without IPv6 egress. The working
  host is `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>`.
- **Percent-encode the password.** It contains an `@`, and a bare one makes the
  URI parse the remainder as the hostname — with a confusing error, not a
  clear one.

### Grants are not automatic

The project has **"Automatically expose new tables" OFF**, so a table created by
a migration has privileges for nobody — the service role included — and every
query returns `42501 permission denied`. GRANT and RLS are separate controls:
GRANT decides whether a role may touch the table at all, RLS decides which rows
it then sees. **Any new table needs an explicit grant** in a migration; see
`20260828120500_grants.sql`. This is deliberate, so a table fails closed.

## Mock accounts

Three accounts, one per role, all with the password `LucaDemo2026!`:

| Email | Role | Lands on |
|---|---|---|
| `admin@luca.test` | Admin | `/admin/dashboard` |
| `crmmanager@luca.test` | CRM Manager | `/queue` |
| `salesrep@luca.test` | Sales Rep | `/today` |

These are for validating the build before the demo. `.test` is a reserved TLD
that cannot receive mail, and accounts are created with `email_confirm`, so
**nothing is ever emailed to anyone**. Real accounts for Vishal, Vaishali,
Jennifer and the reps get created from Admin → Users at go-live, once LUCA has
seen the demo and confirmed who should have what.

## How the code is organised

The rule that matters: **a React component never touches the database, and
business rules never touch React.**

```
app/            Routes. Rendering and layout only — thin.
components/     Presentational. No DB calls, no business rules.
lib/
  db/           Supabase clients. admin.ts bypasses RLS — read its warning.
  queries/      Every database read.  One file per entity.
  actions/      Every database write.  One file per entity.
  domain/       Business rules. Pure functions, no DB, no React, fully tested.
  integrations/ whatsapp.ts — the only code that calls an external service.
  config/       design-tokens.ts
supabase/       Migrations and seed data.
tests/          Unit tests for lib/domain. That is deliberately all that is tested.
docs/           SCHEMA, DEPLOYMENT, MAKING-CHANGES, ADMIN-GUIDE.
```

Every stage transition goes through `lib/domain/stages.ts`. Every permission
check goes through `lib/domain/permissions.ts`. There is no second path to
either — that is what keeps "where do I change X?" answerable six months later.

## Two things to know before changing anything

**Anything LUCA might want to change is a database row, not code.** Dropdown
values, loss reasons, city aliases, budget bands, assignment mode, notification
timings — all editable from Admin → Settings. If a change request means editing
a `.tsx` file, check whether it should have been a row.

**Values are deactivated, never deleted.** A list value referenced by fifty
historical deals silently breaks reporting if it disappears. There is no delete
button anywhere, by design.

## Working from more than one machine

Both machines share **one Supabase database** — git isolates your code, not your
schema, so two branches applying migrations at once will quietly leave the
database agreeing with neither. Run `npm run db:status` after every pull, and
see [docs/WORKING-ON-TWO-MACHINES.md](docs/WORKING-ON-TWO-MACHINES.md) before
touching a migration from a second machine.

## Node version

`.nvmrc` pins what to develop on; `engines` states the floor Next 16 needs
(20.9). No upper bound is set on purpose — the version that actually constrains
this project is whatever Hostinger offers, which is still unconfirmed. Pin it in
both places once it is known.

## Data files

The Meta export and the legacy tracker live in `data/`, which is **gitignored**.
They hold names, phone numbers and email addresses for roughly 2,800 real
people and do not belong in version control, private repository or not.
