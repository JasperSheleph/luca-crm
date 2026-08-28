-- ============================================================
-- Helper functions
-- ============================================================

-- Strips the "p:" prefix used in their Meta and tracker exports, plus spaces,
-- dashes and brackets. Mirrored in lib/domain/phone.ts — tests/phone.test.ts
-- asserts the two agree. Change both or neither.
create or replace function normalize_phone(raw text) returns text as $$
declare digits text;
begin
  if raw is null then return null; end if;
  digits := regexp_replace(raw, '[^0-9]', '', 'g');
  if digits = '' then return null; end if;
  if length(digits) > 10 and left(digits,2) = '91' then
    digits := right(digits, 10);
  end if;
  -- Indians routinely write the STD trunk prefix: 09566114558.
  if length(digits) = 11 and left(digits,1) = '0' then
    digits := right(digits, 10);
  end if;
  if length(digits) <> 10 then return '+' || digits; end if;
  return '+91' || digits;
end;
$$ language plpgsql immutable;

-- security definer so it bypasses RLS on `users`. Without that, the admin-read
-- policy on `users` calls this function, which reads `users`, which re-evaluates
-- the policy — infinite recursion. `set search_path` is mandatory on every
-- security definer function: without it a caller can shadow `users`.
create or replace function current_user_role() returns user_role as $$
  select role from users where id = auth.uid();
$$ language sql stable security definer set search_path = public;

create or replace function is_admin() returns boolean as $$
  select current_user_role() = 'admin';
$$ language sql stable;

create or replace function is_staff() returns boolean as $$
  select current_user_role() in ('admin','crm_manager');
$$ language sql stable;

-- Budget band reads thresholds from app_settings.
-- NOT a generated column — generated columns must be immutable, and these
-- thresholds are admin-editable.
create or replace function budget_band(amount numeric) returns text as $$
declare bands jsonb; b jsonb;
begin
  if amount is null then return null; end if;
  select value into bands from app_settings where key = 'budget_bands';
  if bands is null then return null; end if;
  for b in select * from jsonb_array_elements(bands) loop
    if amount < (b->>'max')::numeric then return b->>'label'; end if;
  end loop;
  return (bands -> -1) ->> 'label';
end;
$$ language plpgsql stable;

-- Everything scheduled runs on India time. The Node server may well be UTC and
-- notification_rules.daily_at_time is a bare `time`, so this must be explicit
-- or the 9am and 7pm jobs fire at the wrong hour, silently.
create or replace function now_ist() returns timestamp as $$
  select (now() at time zone 'Asia/Kolkata');
$$ language sql stable;
