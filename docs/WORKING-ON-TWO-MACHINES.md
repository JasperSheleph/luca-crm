# Working from two machines

Two laptops, one repository, one database. The code side is ordinary git. The
database side is where this gets dangerous, so read that section before you
touch a migration.

---

## The one thing that will bite you

**Both machines share a single Supabase database.** There is no per-branch
database on the free tier. Git isolates your *code*; it isolates nothing about
your *schema*.

So this happens easily:

```
Mac A   branch step-4-queue     adds a column, runs db:push
Mac B   branch rep-view         adds a different column, runs db:push
        -> the database now has both, but neither branch's code expects both
        -> whichever branch you check out, the app disagrees with the schema
```

Nothing warns you. The app just starts failing in ways that look like code bugs.

### The rule

**Only one machine changes the schema at a time, and migrations are
forward-only.** In practice:

- Decide which machine owns schema work for a given piece of work
- The other machine pulls, runs `npm run db:status`, and never runs `db:push`
  until the first is merged
- Never edit or delete an applied migration. Write a new one that corrects it —
  a migration already applied to the shared database cannot be taken back by
  editing the file

`npm run db:status` lists what is applied remotely against what exists locally.
Run it after every `git pull`. If it shows a remote migration you do not have
locally, the other machine has pushed schema — pull before doing anything else.

### Migration filenames

Names are timestamps, so two machines creating migrations in the same minute
can collide. Use a full `YYYYMMDDHHMMSS` and glance at
`supabase/migrations/` before naming a new one.

---

## Ordinary branch workflow

Nothing exotic. Each machine works on its own branch and merges through `main`.

```bash
# starting a piece of work
git pull origin main
git checkout -b step-4-queue

# ... work, commit ...

git push -u origin step-4-queue
```

Merge into `main` when the work is done and checks pass, then on the other
machine:

```bash
git checkout main && git pull origin main
npm install          # in case dependencies changed
npm run db:status    # in case schema changed
```

Keep branches short-lived. The longer two branches live beside one shared
database, the more likely the schema drifts away from one of them.

---

## Git worktrees, if you want two branches open on one machine

Separate from the two-laptop question: `git worktree` gives you a second
checkout of the *same* clone in another folder, so two branches can be open at
once without stashing.

```bash
git worktree add ../luca-crm-queue step-4-queue
cd ../luca-crm-queue
```

Two things to know:

- Each worktree needs its own `npm install` and its own `.env.local` — neither
  is tracked, so neither is shared between them
- Two dev servers cannot both use port 3000. Start the second with
  `PORT=3001 npm run dev`
- They still share the one database. The rule above applies just as much

Remove one with `git worktree remove ../luca-crm-queue`.

---

## What does not travel through git

Recreate these on any new machine or worktree:

| | |
|---|---|
| `.env.local` | The Supabase keys and `SUPABASE_DB_URL`. Copy `.env.example` and fill it from the Supabase dashboard, or AirDrop the file. **Never** through git, chat or email |
| `data/` | The Meta and tracker CSVs. Only needed to re-run an import — the importer tests skip themselves when the file is absent, so `npm test` still passes without it |
| `node_modules/` | `npm install` |

---

## Node version

`.nvmrc` pins the version both machines should develop on, so behaviour matches.
`engines` in `package.json` states the real floor — Next 16 needs 20.9 or newer.

There is deliberately no upper bound: the version that actually constrains this
project is whatever Hostinger offers, and that is still unconfirmed. Once it is
known, pin it here and in `.nvmrc` so nobody builds against something the host
cannot run.

---

## Phone testing

`allowedDevOrigins` in `next.config.ts` lists the laptop addresses allowed to
load dev resources. Each machine has its own LAN address; if the new one is
outside the existing wildcard, add it.

```bash
npm run dev:lan    # prints this machine's phone URL before starting
```

Development only — Next ignores it in a production build.
