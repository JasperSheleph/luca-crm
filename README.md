# LUCA Elevators CRM

Lead capture through to Won, for a lift company in Tamil Nadu and Puducherry.

Next.js (App Router) + TypeScript · Supabase (Postgres, Auth, Storage, RLS) · Tailwind.
The only external service is the WhatsApp Cloud API, behind a feature flag — the
app is fully functional without it.

The specification lives in [`LUCA-CRM-BUILD.md`](LUCA-CRM-BUILD.md); the company
background and the reasoning behind each decision in
[`LUCA-CRM-CONTEXT.md`](LUCA-CRM-CONTEXT.md).

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

## First-time database setup

Migrations live in `supabase/migrations/` and run in filename order. Applying
them needs the **database password** (Supabase → Project Settings → Database),
which is a different thing from the API keys in `.env.local`.

```bash
npx supabase link --project-ref lsmkjudvlnrcdkisoekj
npm run db:push
npm run users:seed
```

`link` prompts for the password once and caches it in `supabase/.temp/`, which is
gitignored. After that, `npm run db:push` applies any new migration on its own.

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

## Data files

The Meta export and the legacy tracker live in `data/`, which is **gitignored**.
They hold names, phone numbers and email addresses for roughly 2,800 real
people and do not belong in version control, private repository or not.
