-- ============================================================
-- The escalation Settings already promised.
--
-- `app_settings.verification_escalation_hours` has existed since the first
-- seed, is editable from Admin -> Settings, and its help text says "how long
-- an unreachable verification call waits before both admins are told".
-- Nothing told them: there was no rule, no template and no job. This adds the
-- two rows; lib/notifications/jobs.ts adds the job.
--
-- Forward-only and additive, like every migration here.
-- ============================================================

insert into notification_templates (key, channel, body_preview, variables, is_approved) values
  ('verification_unreachable',
   'whatsapp',
   'No answer on the verification call for {{customer_name}} after {{hours}} hours. Rep: {{rep_name}}.',
   '["customer_name","hours","rep_name"]',
   false)
on conflict (key) do nothing;

-- threshold_value stays NULL on purpose. The number of hours is already
-- app_settings.verification_escalation_hours, which admins edit under
-- "How it works" — putting it here as well would be two controls for one
-- number, and the day they disagree is the day nobody can say what the
-- system will do. A null threshold also keeps the spinner off this rule in
-- the Notifications tab, so there is visibly one place to change it.
insert into notification_rules
  (trigger_key, template_key, timing_type, offset_minutes, daily_at_time, weekly_day, recipient_type, recipient_role, threshold_value) values
  ('verification_unreachable_escalation','verification_unreachable','daily_at',null,'09:00',null,'role','admin',null)
on conflict (trigger_key) do nothing;
