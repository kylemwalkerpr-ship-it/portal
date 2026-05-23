-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace · profiles.username
--
-- Adds an SEO-friendly username on profiles so attorney/consultant public URLs
-- become /providers/<username> instead of /providers/<uuid>. The slug is the
-- unique identifier used in canonical URLs, share links, and view-profile
-- routes from gig detail pages.
--
-- - Lowercase, 3–32 chars, [a-z0-9-_] with no leading/trailing dash.
-- - Unique (case-sensitive in storage; CHECK enforces lowercase already).
-- - Nullable initially so existing attorneys aren't blocked from existing.
--   The gig-publish path enforces it as a hard requirement going forward.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.profiles
  add column if not exists username text;

do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_schema = 'public' and constraint_name = 'profiles_username_check'
  ) then
    alter table public.profiles
      add constraint profiles_username_check
      check (
        username is null
        or username ~ '^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])$'
      );
  end if;
end$$;

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

create index if not exists profiles_username_lookup_idx
  on public.profiles (username);
