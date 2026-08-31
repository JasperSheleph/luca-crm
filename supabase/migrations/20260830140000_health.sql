-- ============================================================
-- The health page needs two numbers nothing else in the app can read.
--
-- pg_database_size() and the aggregate over storage.objects are not readable
-- by `authenticated`, so this is a security definer function — it runs with the
-- owner's rights. That makes checking the caller mandatory rather than
-- optional: security definer bypasses RLS by design, so the only thing
-- standing between this and any signed-in user is the is_admin() test below.
--
-- Returns bytes only. The percentages are computed against limits held in
-- app_settings, because the limit is a property of the Supabase plan and
-- changes the day LUCA move to Pro — a plan change should be a row edit, not a
-- deploy.
-- ============================================================

create or replace function public.system_health()
returns json
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  db_bytes      bigint;
  store_bytes   bigint;
  failed_jobs   bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can read system health.' using errcode = '42501';
  end if;

  select pg_database_size(current_database()) into db_bytes;

  -- metadata->>'size' is what Supabase records per object. coalesce because a
  -- freshly created bucket has no rows at all, and sum() over none is null.
  select coalesce(sum((metadata->>'size')::bigint), 0)
    into store_bytes
    from storage.objects
   where bucket_id in ('quotes', 'visit-photos');

  -- notifications_log is read-own under RLS, so an admin cannot count anyone
  -- else's failures from the client. It has to be counted in here.
  select count(*)
    into failed_jobs
    from notifications_log
   where status = 'failed'
     and sent_at > now() - interval '24 hours';

  return json_build_object(
    'database_bytes',  db_bytes,
    'storage_bytes',   store_bytes,
    'failed_jobs_24h', failed_jobs
  );
end;
$$;

-- Not automatic — "Automatically expose new tables" is off on this project, so
-- a function without this is invisible to every role including service_role.
revoke all on function public.system_health() from public;
grant execute on function public.system_health() to authenticated, service_role;

-- ---------- settings the health page and dashboard read ----------
-- Defaults are the Supabase FREE tier. Both change at go-live: PROGRESS.md
-- lists Supabase Pro as non-negotiable before launch, and Pro is 8 GB of
-- database and 100 GB of storage. Edit these in Admin → Settings then, not here.
insert into app_settings (key, value, description) values
  ('database_limit_bytes', '536870912',
   'Database allowance for your Supabase plan, in bytes. Free is 512 MB; Pro is 8 GB (8589934592). Only used to show a percentage on the Health page.'),

  ('storage_limit_bytes', '1073741824',
   'File storage allowance for your Supabase plan, in bytes. Free is 1 GB; Pro is 100 GB (107374182400). Only used to show a percentage on the Health page.'),

  ('stalled_deal_days', '21',
   'A deal with nothing logged for this many days counts as stalled on the dashboard.')
on conflict (key) do nothing;
