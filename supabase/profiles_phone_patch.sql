-- =============================================================================
-- profiles_phone_patch.sql
-- Ensures the contact + verification columns the Settings → Profile and
-- Security tabs expect actually exist on public.profiles. Safe to re-run.
-- =============================================================================

alter table public.profiles
  add column if not exists phone                 text,
  add column if not exists phone_verified         boolean not null default false,
  add column if not exists phone_verified_at      timestamptz,
  add column if not exists two_factor_enabled     boolean not null default false,
  add column if not exists timezone               text,
  add column if not exists language               text default 'en',
  add column if not exists avatar_url             text,
  add column if not exists address_line1          text,
  add column if not exists address_line2          text,
  add column if not exists city                   text,
  add column if not exists postal_code            text,
  add column if not exists country                text;

create index if not exists profiles_phone_idx on public.profiles (phone) where phone is not null;

notify pgrst, 'reload schema';
