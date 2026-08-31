-- ============================================================
-- Step 8 — the notification engine's database side.
--
-- Three things:
--   1. an idempotency key on notifications_log, so a repeated cron tick is a
--      no-op instead of a second message;
--   2. job_config, holding the two values the DATABASE needs to call the app
--      (its URL and the shared secret) and that no migration can know;
--   3. the pg_cron schedule that drives every timed notification.
--
-- Hostinger has no scheduler and a Node timer dies with the process, so the
-- clock lives in the database. See docs/NOTIFICATIONS.md.
-- ============================================================

-- ---------- 1. idempotency ----------
alter table notifications_log add column if not exists dedupe_key text;

-- Deliberately NOT a partial index. Postgres treats NULLs as distinct in a
-- unique index, so event-driven rows (which pass no key, because a lead really
-- can be assigned twice) never collide, while a scheduled row's key collides
-- with itself exactly once. A partial index would also work but could not be
-- named in `on conflict (dedupe_key)` without repeating its WHERE clause,
-- which supabase-js has no way to send.
create unique index if not exists notifications_log_dedupe_key_key
  on notifications_log (dedupe_key);

-- For the centre's list, which orders by sent_at with no read_at filter. The
-- existing (user_id, read_at, sent_at desc) index cannot serve that sort —
-- read_at sits between the two columns the query actually uses — but it does
-- serve the unread badge, so both earn their keep.
create index if not exists notifications_log_user_recent
  on notifications_log (user_id, sent_at desc);

-- ---------- 2. what the database needs to reach the app ----------
-- NOT app_settings. That table is readable by every authenticated user and the
-- anon key ships in the browser bundle, so a shared secret in it is a public
-- secret. This table gets no grant to authenticated at all, exactly like
-- audit_log and inbound_leads_raw.
create table if not exists job_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table job_config enable row level security;

-- Explicit, not inherited. `alter default privileges` in the grants migration
-- would cover service_role here, but a table whose privileges are implicit is
-- exactly the thing that has already cost this project hours — so it is
-- spelled out, and the absence of any grant to authenticated is deliberate and
-- visible rather than merely omitted.
grant select, insert, update on job_config to service_role;
-- Deliberately absent: any grant to anon or authenticated. This table holds
-- the cron secret, and the anon key ships in the browser bundle.
-- No policies either: service_role bypasses RLS, everyone else has no way in.

comment on table job_config is
  'app_url and cron_secret, for the pg_cron job. Populated by `npm run cron:setup`, never by a migration — a secret committed to git is not a secret.';

-- ---------- 3. the schedule ----------
-- Everything below is defensive on purpose. A migration that half-applies is
-- the worst outcome for this project (one shared database, forward-only), so a
-- Postgres without pg_cron available still applies this file cleanly and just
-- does not schedule anything.
do $do$
begin
  execute 'create extension if not exists pg_cron';
  execute 'create extension if not exists pg_net';
exception when others then
  raise notice 'pg_cron/pg_net unavailable (%). Timed notifications will not run until they are enabled in the Supabase dashboard, then this migration is re-run.', sqlerrm;
end
$do$;

-- Wrapped in a function rather than inlined into cron.schedule so that an
-- admin can test the whole path with `select run_notification_cron();` and see
-- the request id come back, instead of waiting fifteen minutes to find out.
create or replace function run_notification_cron() returns text as $fn$
declare
  url    text;
  secret text;
begin
  select value into url    from job_config where key = 'app_url';
  select value into secret from job_config where key = 'cron_secret';

  if url is null or secret is null then
    return 'not configured — run `npm run cron:setup`';
  end if;

  perform net.http_post(
    url     := rtrim(url, '/') || '/api/cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  return 'posted to ' || rtrim(url, '/') || '/api/cron';
end
$fn$ language plpgsql security definer set search_path = public, net, extensions;

-- security definer means this function reads job_config — and the cron secret
-- in it — as its owner. Nobody but the scheduler should be able to make the
-- database fire an authenticated HTTP request, so every application role is
-- revoked explicitly. cron.schedule runs it as its owner, which still can.
revoke execute on function run_notification_cron() from public;
revoke execute on function run_notification_cron() from anon, authenticated, service_role;

do $do$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'Skipping cron.schedule — pg_cron/pg_net not installed.';
    return;
  end if;

  -- Re-runnable: replace the job rather than stacking a second one.
  if exists (select 1 from cron.job where jobname = 'luca-notifications') then
    perform cron.unschedule('luca-notifications');
  end if;

  -- Every 15 minutes. isRuleDue() tolerates 10 minutes of lateness, so a rule
  -- set to 09:00 fires on the 09:00 tick and the dedupe key absorbs the rest.
  -- Finer than this buys nothing: none of these messages is urgent to the
  -- minute, and the appointment reminder is a 2-hour warning.
  perform cron.schedule('luca-notifications', '*/15 * * * *', 'select run_notification_cron()');
end
$do$;
