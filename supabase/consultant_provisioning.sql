-- Ensure the consultants table exists with the columns the portal expects.
-- This migration is idempotent and safe to run repeatedly.

create table if not exists consultants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table consultants add column if not exists profile_id uuid references profiles(id) on delete cascade;
alter table consultants add column if not exists email text;
alter table consultants add column if not exists full_name text;
alter table consultants add column if not exists bio text;
alter table consultants add column if not exists available boolean default true;
alter table consultants add column if not exists notif_prefs jsonb default '{"orders":true,"messages":true,"payments":true}'::jsonb;
alter table consultants add column if not exists auto_withdraw boolean default false;
create unique index if not exists consultants_profile_id_idx on consultants(profile_id) where profile_id is not null;
create index if not exists consultants_email_idx on consultants(email);
-- Stripe columns (stripe_account_id, stripe_onboarding_complete) were dropped
-- by drop_deprecated_stripe_columns.sql. The ADD COLUMN lines and the
-- consultants_stripe_account_id_idx index have been removed.

-- Backfill: create a consultants row for any existing profile that has role=consultant
-- but no matching consultants record yet. Safe to re-run.
insert into consultants (profile_id, email, full_name)
select p.id, p.email, p.full_name
from profiles p
where p.role = 'consultant'
  and not exists (
    select 1 from consultants c
    where c.profile_id = p.id
       or (c.email is not null and c.email = p.email)
  );
