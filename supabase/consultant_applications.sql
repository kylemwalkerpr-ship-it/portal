-- =============================================================================
-- consultant_applications.sql
-- Mirrors attorney_applications + attorney_application_events for the
-- consultant intake/review queue. Consultant-specific column substitutions:
--   credential_type   → consultant_type   (individual | firm | student)
--   bar_number        → registration_number (CICC / OISC / OMG / etc.)
--   practice_areas    → specialties (text[])
--   jurisdictions     → kept (still applies to consultants)
--   malpractice_insurance → kept (many consultants carry E&O)
-- Also extends the consultants table with the post-approval mirror columns
-- so the approval flow can write specialties / jurisdictions /
-- registration_number / application_id back to the provider record.
--
-- Safe to re-run (idempotent guards).
-- =============================================================================

-- ─── consultant_applications base ───────────────────────────────────────────
create table if not exists public.consultant_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  consultant_type text not null default 'individual',
  jurisdictions text,
  registration_number text,
  specialties text[] not null default '{}',
  malpractice_insurance text,
  profile_url text,
  capacity text,
  notes text,
  status text not null default 'pending',
  decided_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decision_notes text,
  risk_flags jsonb not null default '[]'::jsonb,
  risk_score numeric(5,2) not null default 0,
  last_reviewed_at timestamptz,
  last_reviewed_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  priority text default 'normal',
  internal_notes text,
  created_at timestamptz not null default now()
);

-- Self-heal columns in case the table was created earlier with a smaller shape.
alter table public.consultant_applications
  add column if not exists profile_id            uuid references public.profiles(id) on delete cascade,
  add column if not exists email                 text,
  add column if not exists full_name             text,
  add column if not exists phone                 text,
  add column if not exists consultant_type       text default 'individual',
  add column if not exists jurisdictions         text,
  add column if not exists registration_number   text,
  add column if not exists specialties           text[] not null default '{}',
  add column if not exists malpractice_insurance text,
  add column if not exists profile_url           text,
  add column if not exists capacity              text,
  add column if not exists notes                 text,
  add column if not exists status                text default 'pending',
  add column if not exists decided_at            timestamptz,
  add column if not exists decided_by            uuid references public.profiles(id) on delete set null,
  add column if not exists decision_notes        text,
  add column if not exists risk_flags            jsonb        not null default '[]'::jsonb,
  add column if not exists risk_score            numeric(5,2) not null default 0,
  add column if not exists last_reviewed_at      timestamptz,
  add column if not exists last_reviewed_by      uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_to           uuid references public.profiles(id) on delete set null,
  add column if not exists priority              text default 'normal',
  add column if not exists internal_notes        text;

-- ─── Check constraints ──────────────────────────────────────────────────────
do $$
begin
  alter table public.consultant_applications drop constraint if exists consultant_applications_status_check;
  alter table public.consultant_applications add constraint consultant_applications_status_check
    check (status in ('pending','approved','declined','waitlist','withdrawn'));
exception when others then null;
end $$;

do $$
begin
  alter table public.consultant_applications drop constraint if exists consultant_applications_type_check;
  alter table public.consultant_applications add constraint consultant_applications_type_check
    check (consultant_type in ('individual','firm','student'));
exception when others then null;
end $$;

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists consultant_apps_status_idx       on public.consultant_applications (status, created_at desc);
create index if not exists consultant_apps_created_idx      on public.consultant_applications (created_at desc);
create index if not exists consultant_apps_decided_idx      on public.consultant_applications (decided_at desc) where decided_at is not null;
create index if not exists consultant_apps_priority_idx     on public.consultant_applications (priority, created_at desc) where status = 'pending';
create index if not exists consultant_apps_assigned_idx     on public.consultant_applications (assigned_to) where assigned_to is not null;
create index if not exists consultant_apps_risk_idx         on public.consultant_applications (risk_score desc) where status = 'pending';
create index if not exists consultant_apps_email_idx        on public.consultant_applications (email);
create index if not exists consultant_apps_profile_idx      on public.consultant_applications (profile_id);

create extension if not exists pg_trgm;
create index if not exists consultant_apps_specialties_gin  on public.consultant_applications using gin (specialties);
-- jurisdictions is text here (mirrors attorney shape) — gin trigram instead of array gin.
create index if not exists consultant_apps_jurisdictions_trgm on public.consultant_applications using gin (jurisdictions gin_trgm_ops);

-- ─── Audit log table ────────────────────────────────────────────────────────
create table if not exists public.consultant_application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.consultant_applications(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  event_type      text not null,
  from_status     text,
  to_status       text,
  notes           text,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists consultant_app_events_app_idx on public.consultant_application_events (application_id, created_at desc);

-- ─── consultants table extensions (for the approval mirror write) ───────────
alter table if exists public.consultants
  add column if not exists application_id      uuid references public.consultant_applications(id) on delete set null,
  add column if not exists registration_number text;
-- specialties already exists (text[]) on consultants — see marketplace_consultant_intake.
-- jurisdictions also exists (text, deprecated but writable) — see consultant_role_refactor.

create index if not exists consultants_application_idx on public.consultants(application_id);

-- ─── Stats RPC ──────────────────────────────────────────────────────────────
create or replace function public.consultant_applications_stats()
returns jsonb
language sql
stable
as $$
  with totals as (
    select
      count(*)                                          as total,
      count(*) filter (where status = 'pending')         as pending,
      count(*) filter (where status = 'approved')        as approved,
      count(*) filter (where status = 'declined')        as declined,
      count(*) filter (where status = 'waitlist')        as waitlist,
      count(*) filter (where created_at >= now() - interval '7 days')   as last_7d,
      count(*) filter (where created_at >= now() - interval '30 days')  as last_30d,
      count(*) filter (where status = 'pending' and risk_score >= 50)   as high_risk_pending,
      count(*) filter (where status = 'pending' and created_at < now() - interval '7 days') as aged_pending
    from public.consultant_applications
  ),
  decision_time as (
    select avg(extract(epoch from (decided_at - created_at))) as avg_seconds
    from public.consultant_applications
    where decided_at is not null and created_at is not null
  ),
  approval_rate as (
    select case
      when count(*) filter (where status in ('approved','declined')) = 0 then 0
      else round(
        100.0 * count(*) filter (where status = 'approved')
             / count(*) filter (where status in ('approved','declined'))
      , 1)
    end as pct
    from public.consultant_applications
    where decided_at >= now() - interval '90 days'
  )
  select jsonb_build_object(
    'total',              totals.total,
    'pending',            totals.pending,
    'approved',           totals.approved,
    'declined',           totals.declined,
    'waitlist',           totals.waitlist,
    'last_7d',            totals.last_7d,
    'last_30d',           totals.last_30d,
    'high_risk_pending',  totals.high_risk_pending,
    'aged_pending',       totals.aged_pending,
    'avg_decision_hours', round((coalesce(decision_time.avg_seconds, 0) / 3600)::numeric, 1),
    'approval_rate_pct',  approval_rate.pct
  )
  from totals, decision_time, approval_rate;
$$;

grant execute on function public.consultant_applications_stats() to anon, authenticated, service_role;

-- ─── Auto-flag risk indicators ──────────────────────────────────────────────
create or replace function public.compute_consultant_application_risk(app_id uuid)
returns void
language plpgsql
as $$
declare
  v record;
  flags jsonb := '[]'::jsonb;
  score numeric(5,2) := 0;
begin
  select * into v from public.consultant_applications where id = app_id;
  if not found then return; end if;

  if v.registration_number is null or length(trim(v.registration_number)) = 0 then
    flags := flags || '"no_registration_number"'::jsonb;  score := score + 25;
  end if;

  if v.malpractice_insurance is null or length(trim(v.malpractice_insurance)) = 0 then
    flags := flags || '"no_insurance"'::jsonb;            score := score + 15;
  end if;

  if v.email ~* '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|zoho)\.' then
    flags := flags || '"free_email"'::jsonb;              score := score + 10;
  end if;

  if v.jurisdictions is null or length(trim(v.jurisdictions)) = 0 then
    flags := flags || '"missing_jurisdictions"'::jsonb;   score := score + 15;
  end if;

  if v.specialties is null or array_length(v.specialties, 1) is null then
    flags := flags || '"missing_specialties"'::jsonb;     score := score + 10;
  end if;

  if v.profile_url is not null and v.profile_url !~* '^https?://' then
    flags := flags || '"suspicious_profile_url"'::jsonb;  score := score + 5;
  end if;

  update public.consultant_applications
     set risk_flags = flags,
         risk_score = least(score, 100)
   where id = app_id;
end $$;

create or replace function public.trg_compute_consultant_risk()
returns trigger language plpgsql as $$
begin
  perform public.compute_consultant_application_risk(new.id);
  return null;
end $$;

drop trigger if exists consultant_apps_risk_trigger on public.consultant_applications;
create trigger consultant_apps_risk_trigger
  after insert or update of registration_number, malpractice_insurance, email, jurisdictions, specialties, profile_url
  on public.consultant_applications
  for each row execute procedure public.trg_compute_consultant_risk();

-- Backfill existing rows (no-op on first run).
do $$
declare r record;
begin
  for r in select id from public.consultant_applications loop
    perform public.compute_consultant_application_risk(r.id);
  end loop;
end $$;

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Mirror attorney_applications: RLS enabled but no policies — service-role-only
-- (admin API routes use the service-role client, which bypasses RLS).
alter table public.consultant_applications        enable row level security;
alter table public.consultant_application_events  enable row level security;

notify pgrst, 'reload schema';
