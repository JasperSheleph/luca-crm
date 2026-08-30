-- ============================================================
-- deal_list_view — add latest_quote_sent_at.
--
-- The work queue's "quotes sent with no response past SLA" bucket had nothing
-- to compare against: the view exposed latest_quote_amount but no date, so
-- "past SLA" was unanswerable without a second query per row.
--
-- quotes.sent_at already exists (20260828120000_schema.sql); this only surfaces
-- the latest one per deal, matching how last_activity_at already works.
--
-- create or replace requires the existing columns in the existing order with
-- the same types, and permits new ones only at the end — so the whole
-- definition is restated below and latest_quote_sent_at is appended last.
-- Editing the original migration is not an option: it is already applied.
-- ============================================================

create or replace view deal_list_view
with (security_invoker = on) as
select
  d.id,
  d.stage,
  d.created_at,
  d.first_contacted_at,
  d.next_action_at,
  d.next_action_note,
  d.nurture_wake_at,
  d.city,
  d.city_normalized,
  d.is_outstation,
  d.is_repeat,
  d.invalid_phone,
  d.campaign_name,
  d.budget_amount,
  d.latest_quote_amount,
  d.visit_verification_status,
  d.crm_owner_id,
  d.rep_owner_id,
  d.source_id,
  d.customer_id,

  c.name             as customer_name,
  c.phone_normalized as customer_phone,

  src.label          as source_label,
  crm.name           as crm_owner_name,
  rep.name           as rep_owner_name,

  budget_band(d.budget_amount) as budget_band,

  -- One column the search box can match against, so "9566" and "muru" both
  -- work without the caller composing an OR across two joined tables.
  lower(coalesce(c.name, '') || ' ' || coalesce(c.phone_normalized, '')) as search_text,

  (select max(a.occurred_at) from activities a where a.deal_id = d.id) as last_activity_at,
  (select count(*)           from activities a where a.deal_id = d.id) as activity_count,

  -- Null until a quote is actually sent. A quote row that exists but was never
  -- sent must not put the deal in the SLA bucket, so this reads sent_at rather
  -- than created_at.
  (select max(q.sent_at) from quotes q where q.deal_id = d.id) as latest_quote_sent_at

from deals d
join customers c        on c.id = d.customer_id
left join list_values src on src.id = d.source_id
left join users crm      on crm.id = d.crm_owner_id
left join users rep      on rep.id = d.rep_owner_id;

grant select on deal_list_view to authenticated, service_role;
