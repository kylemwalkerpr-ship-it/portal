-- Minimal isolated schema for the actual Studio gate/feed PostgREST calls.
-- This fixture is not a production migration and contains no production data.
create table public.seo_gate_runs (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('plan', 'draft', 'job', 'brief')),
  subject_id text,
  cluster_id text,
  stage text,
  country text,
  score numeric(5, 2) not null,
  passed boolean not null,
  threshold numeric(5, 2) not null,
  by_category jsonb not null default '{}'::jsonb,
  blockers text[] not null default '{}',
  signals jsonb not null default '{}'::jsonb,
  mandatory jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.studio_specialist_signals (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  region text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'queued', 'consumed', 'dismissed')),
  priority integer not null default 3,
  related_job_id uuid,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table public.seo_gate_runs enable row level security;
alter table public.studio_specialist_signals enable row level security;
revoke all on public.seo_gate_runs, public.studio_specialist_signals from anon, authenticated, public;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.seo_gate_runs, public.studio_specialist_signals to service_role;
