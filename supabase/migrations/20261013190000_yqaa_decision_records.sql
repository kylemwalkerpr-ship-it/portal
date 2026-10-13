-- Versioned, privacy-minimized decision telemetry. No visitor text, contact data,
-- evidence excerpts, or raw prompts are stored in this table.
create table if not exists public.yqaa_decision_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  record_version integer not null check (record_version = 1),
  policy_version text not null check (length(policy_version) between 1 and 80),
  rubric_version text not null check (length(rubric_version) between 1 and 80),
  channel text not null check (channel in ('dm','public','support')),
  interaction_hash text not null check (interaction_hash ~ '^[a-f0-9]{64}$'),
  provider_hash text check (provider_hash is null or provider_hash ~ '^[a-f0-9]{64}$'),
  category_hash text check (category_hash is null or category_hash ~ '^[a-f0-9]{64}$'),
  posture text not null check (posture in ('EDUCATE','DISCOVER','EMPATHIZE','COMMERCE','NEGOTIATE','ESCALATE_PROVIDER','HANDOFF_SUPPORT','ABSTAIN')),
  negotiation_action text check (negotiation_action is null or negotiation_action in ('QUOTE','ACCEPT','MEET_MIDDLE','DOWNSCOPE','HOLD_VALUE','ESCALATE_PROVIDER')),
  escalated boolean not null,
  reason_codes text[] not null default '{}',
  evidence_ids text[] not null default '{}',
  shadow_rubric text check (shadow_rubric is null or length(shadow_rubric) <= 80),
  constraint yqaa_decision_reason_count check (cardinality(reason_codes) <= 16),
  constraint yqaa_decision_evidence_count check (cardinality(evidence_ids) <= 12)
);

create index if not exists yqaa_decision_records_created_channel_idx
  on public.yqaa_decision_records (created_at desc, channel, policy_version);

alter table public.yqaa_decision_records enable row level security;
alter table public.yqaa_decision_records force row level security;
revoke all on table public.yqaa_decision_records from public, anon, authenticated;
grant select, insert on table public.yqaa_decision_records to service_role;
