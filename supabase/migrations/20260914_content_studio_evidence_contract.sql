-- Content Studio evidence contract (additive, historical-job compatible)
-- Do not overload content_jobs.status with every dimension.

alter table if exists public.content_jobs
  add column if not exists opportunity_id text,
  add column if not exists contract_id text,
  add column if not exists contract_version integer,
  add column if not exists contract_hash text,
  add column if not exists evidence_hash text,
  add column if not exists execution_stage text,
  add column if not exists publication_phase text,
  add column if not exists expected_revision_marker text,
  add column if not exists requested_model text,
  add column if not exists actual_model text;

create table if not exists public.content_studio_evidence_items (
  id text primary key,
  run_id text not null,
  job_id uuid,
  source_kind text not null,
  source_url text,
  publisher text,
  observed_at timestamptz not null,
  jurisdiction text,
  locale text,
  category_ids text[] not null default '{}',
  query text,
  observation text not null,
  excerpt text,
  content_hash text,
  confidence text not null default 'unverified',
  verification text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists content_studio_evidence_items_job_idx
  on public.content_studio_evidence_items (job_id, observed_at desc);

create table if not exists public.content_studio_writing_contracts (
  contract_id text primary key,
  job_id uuid,
  contract_version integer not null,
  contract_hash text not null,
  opportunity_id text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists content_studio_writing_contracts_job_version_idx
  on public.content_studio_writing_contracts (job_id, contract_version)
  where job_id is not null;

create table if not exists public.content_studio_stage_events (
  id bigserial primary key,
  job_id uuid,
  from_stage text,
  to_stage text not null,
  actor text not null,
  reason text,
  input_hash text,
  output_hash text,
  attempt integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists content_studio_stage_events_job_idx
  on public.content_studio_stage_events (job_id, created_at desc);
