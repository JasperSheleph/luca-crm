-- ============================================================
-- deal_list_view — everything the deals list and work queue need, in one read.
--
-- security_invoker = on is what makes this safe: the view runs as the caller,
-- so the RLS policies on `deals` still apply and a rep still sees only their
-- own rows. Without it a view is a hole straight through RLS.
-- ============================================================

create extension if not exists pg_trgm;

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
  (select count(*)           from activities a where a.deal_id = d.id) as activity_count

from deals d
join customers c        on c.id = d.customer_id
left join list_values src on src.id = d.source_id
left join users crm      on crm.id = d.crm_owner_id
left join users rep      on rep.id = d.rep_owner_id;

grant select on deal_list_view to authenticated, service_role;

-- Search hits this on every keystroke in the deals list.
create index if not exists customers_search_idx
  on customers using gin (
    (lower(coalesce(name,'') || ' ' || coalesce(phone_normalized,''))) gin_trgm_ops
  );
