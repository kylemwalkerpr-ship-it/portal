-- Durable idempotency and provider-attempt claims for manual and scheduled P11 audits.
-- Existing visibility observations remain valid: command linkage is nullable.

create table if not exists public.seo_llm_audit_commands (
  id uuid primary key default gen_random_uuid(),
  actor_scope text not null,
  actor_profile_id uuid references public.profiles(id),
  idempotency_key text not null,
  request_hash text not null,
  request_json jsonb not null,
  status text not null default 'admitted' check (status in ('admitted', 'running', 'completed', 'failed', 'blocked_indeterminate')),
  run_id uuid not null unique,
  result_json jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (actor_scope, idempotency_key),
  check (char_length(actor_scope) between 1 and 220),
  check (
    (actor_profile_id is not null and actor_scope = 'profile:' || actor_profile_id::text)
    or (actor_profile_id is null and actor_scope like 'system:%')
  )
);

create table if not exists public.seo_llm_audit_provider_claims (
  command_id uuid not null references public.seo_llm_audit_commands(id),
  query_ordinal integer not null check (query_ordinal >= 0),
  provider_pin text not null,
  status text not null default 'claimed' check (status in ('claimed', 'completed', 'failed', 'indeterminate')),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  result_json jsonb,
  error text,
  primary key (command_id, query_ordinal, provider_pin)
);

alter table public.seo_llm_visibility
  add column if not exists command_id uuid references public.seo_llm_audit_commands(id),
  add column if not exists query_ordinal integer;

alter table public.seo_llm_visibility
  drop constraint if exists seo_llm_visibility_command_ordinal_pair_check;
alter table public.seo_llm_visibility
  add constraint seo_llm_visibility_command_ordinal_pair_check check (
    (command_id is null and query_ordinal is null)
    or (command_id is not null and query_ordinal is not null and query_ordinal >= 0)
  );

create unique index if not exists uq_seo_llm_visibility_command_ordinal
  on public.seo_llm_visibility (command_id, query_ordinal)
  where command_id is not null;

alter table public.seo_llm_audit_commands enable row level security;
alter table public.seo_llm_audit_provider_claims enable row level security;

drop policy if exists "Service role full access" on public.seo_llm_audit_commands;
create policy "Service role full access" on public.seo_llm_audit_commands
  for all to service_role using (true) with check (true);
drop policy if exists "Service role full access" on public.seo_llm_audit_provider_claims;
create policy "Service role full access" on public.seo_llm_audit_provider_claims
  for all to service_role using (true) with check (true);

revoke all privileges on table public.seo_llm_audit_commands from public, anon, authenticated;
revoke all privileges on table public.seo_llm_audit_provider_claims from public, anon, authenticated;
grant all privileges on table public.seo_llm_audit_commands to service_role;
grant all privileges on table public.seo_llm_audit_provider_claims to service_role;

comment on table public.seo_llm_audit_commands is
  'Idempotent authenticated and scheduled P11 audit commands; service-role persistence only.';
comment on table public.seo_llm_audit_provider_claims is
  'Durable claim-before-call ledger; a claimed attempt is never invoked again automatically.';
