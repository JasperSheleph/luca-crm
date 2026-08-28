-- ============================================================
-- Mobile number becomes mandatory, unique, and usable to sign in.
--
-- Reps work from phones and know their own number better than an email address
-- they were assigned. Rather than adding Supabase phone auth — which needs a
-- paid SMS provider and a new vendor to keep alive — the login form accepts
-- either identifier and resolves a mobile to the account behind it. Passwords
-- are unchanged.
--
-- That only works if a number identifies exactly one person, hence the unique
-- index. It has to compare NORMALISED numbers, or 9566114558, 09566114558 and
-- +91 95661 4558 would each look like a different user.
-- ============================================================

-- Existing accounts predate the requirement and must be filled before the
-- column can be made NOT NULL. These are the three mock accounts; real staff
-- accounts get created from Admin -> Users after the demo.
update users set phone = '9000000001' where email = 'admin@luca.test'      and phone is null;
update users set phone = '9000000002' where email = 'crmmanager@luca.test' and phone is null;
update users set phone = '9000000003' where email = 'salesrep@luca.test'   and phone is null;

-- Any other account without a number gets a placeholder derived from its row,
-- so the constraint can be applied without destroying data. An admin fixes
-- these from Admin -> Users; they are obvious on sight.
update users u
set phone = '90000' || lpad(missing.rn::text, 5, '0')
from (
  select id, row_number() over (order by created_at) as rn
  from users
  where phone is null
) as missing
where u.id = missing.id;

-- Generated rather than maintained by application code: normalisation then
-- cannot drift between the two writers (the admin screen and the seed script).
-- normalize_phone() is already declared immutable, which a generated column
-- requires.
alter table users
  add column phone_normalized text
  generated always as (normalize_phone(phone)) stored;

-- One number, one person. Without this, two users could share a login
-- identifier and the resolution below would be ambiguous.
create unique index users_phone_normalized_key on users (phone_normalized);

alter table users alter column phone set not null;

comment on column users.phone is
  'Mandatory. Doubles as a sign-in identifier — see signIn() in lib/actions/auth.ts.';
