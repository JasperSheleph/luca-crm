-- ============================================================
-- Grants
--
-- The project has "Automatically expose new tables" OFF, so a freshly created
-- table has no privileges for anyone and fails closed. That is the behaviour we
-- want; it also means every table has to be opened deliberately, here.
--
-- GRANT and RLS are different things and both must be right:
--   GRANT decides whether a role may touch the table at all
--   RLS   decides which rows it then sees
-- A table with RLS policies but no grant is invisible; a table with grants but
-- no RLS is wide open. Neither is safe on its own.
-- ============================================================

-- ---------- anon: nothing, ever ----------
-- The pre-login role. It needs the /auth endpoints and no table whatsoever.
-- Deliberately absent: any grant to anon.

-- ---------- service_role: everything ----------
-- Server-only, bypasses RLS by design. Used by the inbound endpoint, the CSV
-- importers and the cron route — the three places with no signed-in user.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Future tables reach service_role automatically; they must NOT reach
-- authenticated automatically, so a new table stays closed until opened below.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- ---------- authenticated: scoped, with RLS filtering rows ----------
grant usage on schema public to authenticated;

-- Read/write records. RLS restricts reps to their own deals.
grant select, insert, update on
  customers, deals, appointments, visits, visit_verifications, quotes, attachments
  to authenticated;

-- Only an admin deletes a deal, and only the deals_delete policy allows it.
grant delete on deals to authenticated;

-- APPEND-ONLY. No update, no delete — not for admins either.
-- These carry no update/delete policy on purpose; withholding the grant as well
-- means a mistake in a policy still cannot rewrite history.
grant select, insert on activities, deal_stage_history, assignments to authenticated;

-- Config. Everyone reads; RLS narrows writes to admins.
grant select, insert, update on
  list_values, app_settings, notification_templates, notification_rules
  to authenticated;

-- Users. RLS shows a rep only their own row and narrows writes to admins.
grant select, insert, update, delete on users to authenticated;

-- Sequences behind every bigserial the app inserts into.
grant usage, select on sequence
  activities_id_seq, deal_stage_history_id_seq, assignments_id_seq,
  list_values_id_seq, visit_verifications_id_seq
  to authenticated;

-- ---------- server-only tables ----------
-- inbound_leads_raw and audit_log get NO grant to authenticated. They hold raw
-- payloads with names, phones and emails for thousands of real people, and the
-- anon key ships in the browser bundle.
-- Deliberately absent: any grant to authenticated on those two.

-- notifications_log is the exception. The spec files it as server-only, but it
-- also requires an in-app notification centre, and a user has to be able to
-- read their own notifications for that to exist. Reading is opened here and
-- scoped by policy to the recipient; writing stays service_role only.
grant select, update (read_at) on notifications_log to authenticated;

create policy notifications_read_own on notifications_log for select
  using (user_id = auth.uid());

create policy notifications_mark_read on notifications_log for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
