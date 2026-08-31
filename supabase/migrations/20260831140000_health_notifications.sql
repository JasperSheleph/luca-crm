-- ============================================================
-- Health, extended for the notification engine.
--
-- system_health() already counted failed sends — step 9 anticipated step 8.
-- What it could not answer is the question an admin actually has when nothing
-- is arriving: *is the schedule even running?* That needs job_config and
-- cron.job_run_details, neither of which `authenticated` can read, so it has
-- to be answered in here alongside the rest.
--
-- `create or replace`, not an edit to 20260830140000_health.sql. Migrations
-- are forward-only; the applied one stays exactly as it was applied.
-- ============================================================

create or replace function public.system_health()
returns json
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $fn$
declare
  db_bytes      bigint;
  store_bytes   bigint;
  failed_jobs   bigint;
  notif_24h     bigint;
  cron_ready    boolean := false;
  cron_last     timestamptz;
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

  -- The positive signal. Zero failures means nothing when nothing was sent.
  select count(*)
    into notif_24h
    from notifications_log
   where sent_at > now() - interval '24 hours';

  -- Has `npm run cron:setup` been run? Without both rows the scheduled job
  -- fires on time and returns 'not configured', which looks like silence.
  select count(*) = 2
    into cron_ready
    from job_config
   where key in ('app_url', 'cron_secret');

  -- pg_cron may not be installed on this database at all, and asking then is
  -- an error rather than a null. The health page must never be the thing that
  -- breaks, so this degrades to "unknown".
  begin
    execute $q$
      select max(d.start_time)
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
       where j.jobname = 'luca-notifications'
    $q$ into cron_last;
  exception when others then
    cron_last := null;
  end;

  return json_build_object(
    'database_bytes',    db_bytes,
    'storage_bytes',     store_bytes,
    'failed_jobs_24h',   failed_jobs,
    'notifications_24h', notif_24h,
    'cron_configured',   cron_ready,
    'cron_last_run',     cron_last
  );
end;
$fn$;

-- Not automatic — "Automatically expose new tables" is off on this project, so
-- a function without this is invisible to every role including service_role.
revoke all on function public.system_health() from public;
grant execute on function public.system_health() to authenticated, service_role;
