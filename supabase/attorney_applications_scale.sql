-- =============================================================================
-- attorney_applications_scale.sql
-- Future-proofs the attorney_applications table for Fiverr-scale review queues.
-- Safe to re-run (all idempotent guards).
-- =============================================================================

-- ─── Columns the admin queue relies on ──────────────────────────────────────
alter table public.attorney_applications
  add column if not exists status                  text default 'pending',
  add column if not exists decided_at              timestamptz,
  add column if not exists decided_by              uuid references public.profiles(id) on delete set null,
  add column if not exists decision_notes          text,
  add column if not exists risk_flags              jsonb        not null default '[]'::jsonb,
  add column if not exists risk_score              numeric(5,2) not null default 0,
  add column if not exists last_reviewed_at        timestamptz,
  add column if not exists last_reviewed_by        uuid references public.profiles(id) on delete set null,
  add column if not exists assigned_to             uuid references public.profiles(id) on delete set null,
  add column if not exists priority                text default 'normal',
  add column if not exists internal_notes          text;

-- ─── Status check (idempotent) ──────────────────────────────────────────────
do $$
begin
  alter table public.attorney_applications drop constraint if exists attorney_applications_status_check;
  alter table public.attorney_applications add constraint attorney_applications_status_check
    check (status in ('pending','approved','declined','waitlist','withdrawn'));
exception when others then null;
end $$;

-- ─── Indexes ────────────────────────────────────────────────────────────────
create index if not exists attorney_apps_status_idx       on public.attorney_applications (status, created_at desc);
create index if not exists attorney_apps_created_idx      on public.attorney_applications (created_at desc);
create index if not exists attorney_apps_decided_idx      on public.attorney_applications (decided_at desc) where decided_at is not null;
create index if not exists attorney_apps_priority_idx     on public.attorney_applications (priority, created_at desc) where status = 'pending';
create index if not exists attorney_apps_assigned_idx     on public.attorney_applications (assigned_to) where assigned_to is not null;
create index if not exists attorney_apps_risk_idx         on public.attorney_applications (risk_score desc) where status = 'pending';

-- Full-text search across name, email, bar number, jurisdictions, practice areas
create extension if not exists pg_trgm;
create index if not exists attorney_apps_fts_idx on public.attorney_applications using gin (
  to_tsvector('simple',
    coalesce(full_name,'') || ' ' ||
    coalesce(email,'') || ' ' ||
    coalesce(bar_number,'') || ' ' ||
    coalesce(jurisdictions,'') || ' ' ||
    coalesce(practice_areas,'')
  )
);

-- ─── Audit log table ────────────────────────────────────────────────────────
create table if not exists public.attorney_application_events (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.attorney_applications(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  event_type      text not null,
  from_status     text,
  to_status       text,
  notes           text,
  metadata        jsonb default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists attorney_app_events_app_idx on public.attorney_application_events (application_id, created_at desc);

-- ─── Stats RPC ──────────────────────────────────────────────────────────────
create or replace function public.attorney_applications_stats()
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
    from public.attorney_applications
  ),
  decision_time as (
    select avg(extract(epoch from (decided_at - created_at))) as avg_seconds
    from public.attorney_applications
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
    from public.attorney_applications
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

grant execute on function public.attorney_applications_stats() to anon, authenticated, service_role;

-- ─── Auto-flag risk indicators ──────────────────────────────────────────────
-- Cheap heuristic — admins can override. Flags include:
--   no_bar_number, no_insurance, free_email, missing_jurisdictions,
--   missing_practice_areas, suspicious_profile_url.
create or replace function public.compute_attorney_application_risk(app_id uuid)
returns void
language plpgsql
as $$
declare
  v record;
  flags jsonb := '[]'::jsonb;
  score numeric(5,2) := 0;
begin
  select * into v from public.attorney_applications where id = app_id;
  if not found then return; end if;

  if v.bar_number is null or length(trim(v.bar_number)) = 0 then
    flags := flags || '"no_bar_number"'::jsonb;  score := score + 30;
  end if;

  if v.malpractice_insurance is null or length(trim(v.malpractice_insurance)) = 0 then
    flags := flags || '"no_insurance"'::jsonb;   score := score + 20;
  end if;

  if v.email ~* '@(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|zoho)\.' then
    flags := flags || '"free_email"'::jsonb;     score := score + 10;
  end if;

  if v.jurisdictions is null or length(trim(v.jurisdictions)) = 0 then
    flags := flags || '"missing_jurisdictions"'::jsonb; score := score + 15;
  end if;

  if v.practice_areas is null or length(trim(v.practice_areas)) = 0 then
    flags := flags || '"missing_practice_areas"'::jsonb; score := score + 10;
  end if;

  if v.profile_url is not null and v.profile_url !~* '^https?://' then
    flags := flags || '"suspicious_profile_url"'::jsonb; score := score + 5;
  end if;

  update public.attorney_applications
     set risk_flags = flags,
         risk_score = least(score, 100)
   where id = app_id;
end $$;

-- Trigger to recompute on insert / update of relevant cols
create or replace function public.trg_compute_attorney_risk()
returns trigger language plpgsql as $$
begin
  perform public.compute_attorney_application_risk(new.id);
  return null;
end $$;

drop trigger if exists attorney_apps_risk_trigger on public.attorney_applications;
create trigger attorney_apps_risk_trigger
  after insert or update of bar_number, malpractice_insurance, email, jurisdictions, practice_areas, profile_url
  on public.attorney_applications
  for each row execute procedure public.trg_compute_attorney_risk();

-- Backfill existing rows
do $$
declare r record;
begin
  for r in select id from public.attorney_applications loop
    perform public.compute_attorney_application_risk(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
