-- ============================================================
-- Seed data — all admin-editable from Admin -> Settings afterwards.
-- Idempotent: safe to re-run.
-- ============================================================

-- ---------- list_values ----------
insert into list_values (list_type, value, label, sort_order) values
  -- lead_source
  ('lead_source','meta_ads','Meta Ads',10),
  ('lead_source','website_quiz','Website Quiz',20),
  ('lead_source','website_contact_form','Website Contact Form',30),
  ('lead_source','phone_call','Phone Call',40),
  ('lead_source','referral','Referral',50),
  ('lead_source','indiamart','IndiaMART',60),
  ('lead_source','walk_in','Walk-in',70),
  ('lead_source','csv_import','CSV Import',80),
  ('lead_source','legacy_tracker','Legacy Tracker',90),

  -- call_disposition. RNR is FIRST and stays first: it is 30% of all outcomes
  -- and must be the fastest option to pick. Do not re-sort this list.
  ('call_disposition','rnr','RNR (ring no response)',10),
  ('call_disposition','connected_interested','Connected - Interested',20),
  ('call_disposition','connected_not_interested','Connected - Not interested',30),
  ('call_disposition','switched_off','Switched off',40),
  ('call_disposition','wrong_number','Wrong number',50),
  ('call_disposition','budget_constraint','Budget constraint',60),
  ('call_disposition','just_exploring','Just exploring',70),
  ('call_disposition','planning_later','Planning later',80),
  ('call_disposition','language_barrier','Language barrier',90),
  ('call_disposition','duplicate_enquiry','Duplicate enquiry',100),
  ('call_disposition','call_back_later','Call back later',110),
  ('call_disposition','not_reachable','Not reachable',120),

  -- not_pursued_reason
  ('not_pursued_reason','budget_too_low','Budget too low',10),
  ('not_pursued_reason','duplicate_enquiry','Duplicate enquiry',20),
  ('not_pursued_reason','invalid_number','Invalid number',30),
  ('not_pursued_reason','spam_or_test','Spam or test entry',40),
  ('not_pursued_reason','only_researching','Only researching',50),
  ('not_pursued_reason','vendor_or_competitor','Vendor or competitor',60),
  ('not_pursued_reason','no_lift_requirement','No lift requirement',70),
  ('not_pursued_reason','outside_service_area','Outside service area',80),

  -- loss_reason
  ('loss_reason','price_too_high','Price too high',10),
  ('loss_reason','went_with_competitor','Went with competitor',20),
  ('loss_reason','project_postponed','Project postponed',30),
  ('loss_reason','site_not_feasible','Site not feasible',40),
  ('loss_reason','budget_unavailable','Budget unavailable',50),
  ('loss_reason','no_response_after_quote','No response after quote',60),
  ('loss_reason','plans_changed','Plans changed',70),
  ('loss_reason','spec_not_offered','Spec not offered',80),

  -- qualification lists
  ('property_type','residential','Residential',10),
  ('property_type','commercial','Commercial',20),
  ('property_type','semi_commercial','Semi-commercial',30),
  ('property_type','other','Other',40),

  ('building_subtype','individual_house','Individual house',10),
  ('building_subtype','apartment','Apartment',20),
  ('building_subtype','villa','Villa',30),

  ('lift_mechanism','hydraulic','Hydraulic',10),
  ('lift_mechanism','hydraulic_industrial','Hydraulic Industrial',20),
  ('lift_mechanism','mrl','MRL',30),
  ('lift_mechanism','traction','Traction',40),

  ('construction_status','under_construction','Under construction',10),
  ('construction_status','existing','Existing',20),

  ('space_available','yes','Yes',10),
  ('space_available','no','No',20),
  ('space_available','not_sure','Not sure',30)
on conflict (list_type, value) do nothing;

-- ---------- app_settings ----------
insert into app_settings (key, value, description) values
  ('lead_assignment_mode', '"auto_single"',
   'auto_single | round_robin | manual. How new leads are distributed to CRM Managers.'),

  ('budget_bands',
   '[{"label":"Under 6L","max":600000},{"label":"6-8L","max":800000},{"label":"8-12L","max":1200000},{"label":"Above 12L","max":999999999}]',
   'Thresholds for budget_band(). Editable; read at query time, not baked into a column.'),

  ('required_fields_for_appointment',
   '["floors","property_type_id","construction_status_id","space_available_id"]',
   'Blocks qualifying -> appointment_scheduled until these are filled. The ONLY qualification gate.'),

  ('service_area_cities',
   '["chennai","coimbatore","madurai","salem","tiruchirappalli","tirupur","vellore","puducherry","erode","hosur","kanchipuram","nagercoil","tuticorin","krishnagiri","tiruvannamalai","sivakasi","thanjavur","dindigul"]',
   'Tamil Nadu + Puducherry. ~60% of leads are outside Chennai — outstation is normal business, never a warning state.'),

  ('city_aliases',
   '{"trichy":"tiruchirappalli","madras":"chennai","cbe":"coimbatore","pondy":"puducherry","pondicherry":"puducherry","tuty":"tuticorin","thoothukudi":"tuticorin","kovai":"coimbatore","chennai ":"chennai","covai":"coimbatore","tirunelveli":"tirunelveli","thirunelveli":"tirunelveli","nellai":"tirunelveli","trichy ":"tiruchirappalli","tiruchi":"tiruchirappalli","trichirappalli":"tiruchirappalli"}',
   'Their data holds 281 distinct city spellings in the Meta file and 522 in the tracker, for ~30 real cities. Extend here, never in code.'),

  ('rep_initials_map', '{}',
   'Legacy tracker RP column: initials -> user id. e.g. {"JN":"<uuid>","NV":"<uuid>"}. Fill before running Importer B.'),

  ('quote_followup_days', '[3,7,14]', 'Days after Quote Sent to nudge, if no response.'),
  ('verification_escalation_hours', '48', 'Hours an unreachable verification waits before escalating to admins.'),
  ('whatsapp_enabled', 'false', 'Master switch. The notification engine is fully functional with this off — everything still writes to notifications_log and the in-app centre.'),
  ('timezone', '"Asia/Kolkata"', 'All scheduled jobs and daily_at_time comparisons use this. Do not change.')
on conflict (key) do nothing;

-- ---------- notification templates (text is LOCKED — Meta approves each body) ----------
insert into notification_templates (key, channel, body_preview, variables, is_approved) values
  ('lead_assigned','whatsapp','New lead assigned: {{customer_name}}, {{city}}. Source: {{source}}.','["customer_name","city","source"]',false),
  ('appointment_tomorrow','whatsapp','Reminder: site visit tomorrow at {{time}} — {{customer_name}}, {{city}}.','["time","customer_name","city"]',false),
  ('appointment_approaching','whatsapp','Site visit in 2 hours: {{customer_name}}, {{address}}.','["customer_name","address"]',false),
  ('next_action_overdue','whatsapp','{{count}} deals have an overdue next action.','["count"]',false),
  ('visit_awaiting_verification','whatsapp','Visit marked complete by {{rep_name}} for {{customer_name}} — verification call pending.','["rep_name","customer_name"]',false),
  ('verification_failed','whatsapp','ALERT: {{customer_name}} says no visit took place. Deal frozen. Rep: {{rep_name}}.','["customer_name","rep_name"]',false),
  ('deal_won','whatsapp','Won: {{customer_name}}, {{amount}}. Advance received.','["customer_name","amount"]',false),
  ('daily_summary','whatsapp','Today: {{new_leads}} new, {{calls}} calls, {{visits}} visits, {{won}} won.','["new_leads","calls","visits","won"]',false),
  ('uncontacted_leads','whatsapp','{{count}} leads have gone uncontacted for more than {{days}} days.','["count","days"]',false)
on conflict (key) do nothing;

-- ---------- notification rules (admins change on/off, timing, recipient, threshold) ----------
-- daily_at_time is ALWAYS Asia/Kolkata. See now_ist().
insert into notification_rules
  (trigger_key, template_key, timing_type, offset_minutes, daily_at_time, weekly_day, recipient_type, recipient_role, threshold_value) values
  ('lead_assigned','lead_assigned','immediate',null,null,null,'deal_owner',null,null),
  ('appointment_tomorrow','appointment_tomorrow','daily_at',null,'19:00',null,'deal_owner',null,null),
  ('appointment_approaching','appointment_approaching','offset',-120,null,null,'deal_owner',null,null),
  ('next_action_overdue','next_action_overdue','daily_at',null,'09:00',null,'deal_owner',null,null),
  ('visit_awaiting_verification','visit_awaiting_verification','immediate',null,null,null,'role','crm_manager',null),
  ('verification_failed','verification_failed','immediate',null,null,null,'role','admin',null),
  ('deal_won','deal_won','immediate',null,null,null,'role','admin',null),
  ('daily_summary','daily_summary','daily_at',null,'19:00',null,'role','admin',null),
  ('uncontacted_leads','uncontacted_leads','weekly_at',null,'09:00',1,'role','admin',7)
on conflict (trigger_key) do nothing;
