-- ─────────────────────────────────────────────────────────────────────────────
-- Marketplace · consultant rich-profile columns + intake resume state
--
-- 1) Adds the rich profile columns to consultants so the marketplace can
--    present a consultant the same way it presents an attorney: headshot,
--    tagline, intro, jurisdictions, practice areas, specialties, languages,
--    education, timezone, years of experience, starting price, free consult
--    toggle, video intro.
--
-- 2) Adds profiles.intake_last_step so the intake wizard knows which step
--    the user was on last visit and resumes there instead of step 1.
-- ─────────────────────────────────────────────────────────────────────────────

alter table if exists public.consultants
  add column if not exists headshot_url        text,
  add column if not exists headshot_path       text,
  add column if not exists tagline             text,
  add column if not exists intro               text,
  add column if not exists jurisdictions       text,
  add column if not exists practice_areas      text,
  add column if not exists specialties         text[] not null default '{}'::text[],
  add column if not exists languages           text[] not null default '{}'::text[],
  add column if not exists education           text,
  add column if not exists timezone            text,
  add column if not exists years_experience    integer,
  add column if not exists starting_price      integer,
  add column if not exists offers_free_consult boolean,
  add column if not exists video_intro_url     text;

alter table if exists public.profiles
  add column if not exists intake_last_step integer not null default 0;

create index if not exists consultants_marketplace_idx
  on public.consultants (available, starting_price);
