-- ============================================================
-- Row Level Security
-- The Supabase project has "expose new tables" OFF and "automatic RLS" ON, so
-- tables fail closed by default. This makes that explicit in code.
--
-- Reps see ONLY their own deals. Verify by logging in as a rep and confirming
-- another rep's deal returns zero rows — not a hidden UI element.
-- ============================================================

alter table users                 enable row level security;
alter table customers             enable row level security;
alter table deals                 enable row level security;
alter table deal_stage_history    enable row level security;
alter table assignments           enable row level security;
alter table activities            enable row level security;
alter table appointments          enable row level security;
alter table visits                enable row level security;
alter table visit_verifications   enable row level security;
alter table quotes                enable row level security;
alter table attachments           enable row level security;
alter table list_values           enable row level security;
alter table app_settings          enable row level security;
alter table notification_templates enable row level security;
alter table notification_rules    enable row level security;

-- Server-only. RLS ON with NO policies at all: unreachable via the Data API,
-- reachable exclusively with the service role key. inbound_leads_raw holds
-- names, phones and emails for thousands of real people, and the anon key is
-- public by design — it ships in the browser bundle.
alter table inbound_leads_raw enable row level security;
alter table audit_log         enable row level security;
alter table notifications_log enable row level security;

-- ---------- users ----------
create policy users_read_self on users for select
  using (id = auth.uid() or is_staff());
create policy users_admin_write on users for all
  using (is_admin()) with check (is_admin());

-- ---------- deals ----------
create policy deals_read on deals for select
  using (is_staff() or rep_owner_id = auth.uid());
create policy deals_insert on deals for insert
  with check (is_staff());
create policy deals_update on deals for update
  using (is_staff() or rep_owner_id = auth.uid())
  with check (is_staff() or rep_owner_id = auth.uid());
create policy deals_delete on deals for delete using (is_admin());

-- ---------- customers ----------
-- A rep may read a customer only through a deal he owns.
create policy customers_read on customers for select
  using (
    is_staff()
    or exists (select 1 from deals d where d.customer_id = customers.id
               and d.rep_owner_id = auth.uid())
  );
create policy customers_staff_write on customers for all
  using (is_staff()) with check (is_staff());

-- ---------- child tables: scoped through the parent deal ----------
-- One shape, applied to every table hanging off deals.
do $$
declare t text;
begin
  foreach t in array array[
    'deal_stage_history','assignments','activities','appointments',
    'visits','visit_verifications','quotes','attachments'
  ] loop
    execute format($f$
      create policy %1$s_read on %1$I for select
        using (
          is_staff()
          or exists (select 1 from deals d where d.id = %1$I.deal_id
                     and d.rep_owner_id = auth.uid())
        );
    $f$, t);

    execute format($f$
      create policy %1$s_insert on %1$I for insert
        with check (
          is_staff()
          or exists (select 1 from deals d where d.id = %1$I.deal_id
                     and d.rep_owner_id = auth.uid())
        );
    $f$, t);
  end loop;
end $$;

-- activities is append-only: no update, no delete policy, for anyone.
-- deal_stage_history and assignments are likewise append-only.

-- Staff may correct appointments, visits, verifications and quotes; a rep may
-- update only rows on his own deals.
do $$
declare t text;
begin
  foreach t in array array['appointments','visits','visit_verifications','quotes','attachments'] loop
    execute format($f$
      create policy %1$s_update on %1$I for update
        using (
          is_staff()
          or exists (select 1 from deals d where d.id = %1$I.deal_id
                     and d.rep_owner_id = auth.uid())
        );
    $f$, t);
  end loop;
end $$;

-- ---------- config tables: everyone reads, admin writes ----------
do $$
declare t text;
begin
  foreach t in array array['list_values','app_settings','notification_templates','notification_rules'] loop
    execute format('create policy %1$s_read on %1$I for select to authenticated using (true);', t);
    execute format('create policy %1$s_admin_write on %1$I for all using (is_admin()) with check (is_admin());', t);
  end loop;
end $$;
