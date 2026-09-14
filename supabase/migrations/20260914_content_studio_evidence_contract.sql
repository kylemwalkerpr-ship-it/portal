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

alter table public.content_studio_evidence_items enable row level security;
alter table public.content_studio_writing_contracts enable row level security;
alter table public.content_studio_stage_events enable row level security;

revoke all on table public.content_studio_evidence_items from public, anon, authenticated;
revoke all on table public.content_studio_writing_contracts from public, anon, authenticated;
revoke all on table public.content_studio_stage_events from public, anon, authenticated;

grant select, insert, update, delete on table public.content_studio_evidence_items to service_role;
grant select, insert, update on table public.content_studio_writing_contracts to service_role;
grant select, insert on table public.content_studio_stage_events to service_role;

create or replace function public.content_studio_reject_contract_mutation()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.payload is distinct from old.payload or new.contract_hash is distinct from old.contract_hash) then
    raise exception 'writing contracts are immutable; insert a new version';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'writing contracts cannot be deleted';
  end if;
  return new;
end;
$$;

drop trigger if exists content_studio_writing_contracts_immutable on public.content_studio_writing_contracts;
create trigger content_studio_writing_contracts_immutable
  before update or delete on public.content_studio_writing_contracts
  for each row execute function public.content_studio_reject_contract_mutation();

create unique index if not exists content_jobs_opportunity_reservation_idx
  on public.content_jobs (opportunity_id)
  where opportunity_id is not null
    and status in ('draft','queued','generating','review','approved','shipping');
