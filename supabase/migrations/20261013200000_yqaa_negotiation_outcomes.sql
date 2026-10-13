-- Additive, service-only YQAA outcome and human-review evidence ledger.
-- Events are derived exclusively from YQAA offers and provider approval state.
-- No conversation text, contact data, prices, or transcript URLs are copied.

-- Sequence gaps after rolled-back transactions are harmless; every committed
-- source transition still gets its own durable, globally ordered identity.
create sequence if not exists public.yqaa_negotiation_outcomes_order_seq;

create table if not exists public.yqaa_negotiation_outcomes (
  id uuid primary key default gen_random_uuid(),
  event_order bigint not null unique,
  occurred_at timestamptz not null default clock_timestamp(),
  source_kind text not null check (source_kind in ('offer','provider_approval')),
  source_id uuid not null,
  state text not null check (state in ('pending','processing','accepted','paid','declined','expired','cancelled','approved','invalidated')),
  event_key text not null unique,
  constraint yqaa_negotiation_outcomes_key_len check (length(event_key) between 1 and 180)
);
create index if not exists yqaa_negotiation_outcomes_time_idx
  on public.yqaa_negotiation_outcomes (occurred_at desc, event_order desc, source_kind, state);
alter table public.yqaa_negotiation_outcomes enable row level security;
alter table public.yqaa_negotiation_outcomes force row level security;
revoke all on table public.yqaa_negotiation_outcomes from public, anon, authenticated;
grant select, insert on table public.yqaa_negotiation_outcomes to service_role;
drop policy if exists yqaa_negotiation_outcomes_service_only on public.yqaa_negotiation_outcomes;
create policy yqaa_negotiation_outcomes_service_only on public.yqaa_negotiation_outcomes
  for all to service_role using (true) with check (true);

create table if not exists public.yqaa_review_submissions (
  id uuid primary key default gen_random_uuid(),
  decision_record_id uuid not null references public.yqaa_decision_records(id) on delete restrict,
  reviewer_profile_id uuid not null references public.profiles(id) on delete restrict,
  human_safe boolean not null,
  is_critical boolean not null,
  reviewer_qualification_claim text not null check (length(trim(reviewer_qualification_claim)) between 3 and 240),
  provenance_ref text not null check (provenance_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'),
  qualification_verified_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique (decision_record_id, reviewer_profile_id),
  check (qualification_verified_at is null)
);
create index if not exists yqaa_review_submissions_case_idx
  on public.yqaa_review_submissions (decision_record_id, created_at);
alter table public.yqaa_review_submissions enable row level security;
alter table public.yqaa_review_submissions force row level security;
revoke all on table public.yqaa_review_submissions from public, anon, authenticated;
grant select, insert on table public.yqaa_review_submissions to service_role;
drop policy if exists yqaa_review_submissions_service_only on public.yqaa_review_submissions;
create policy yqaa_review_submissions_service_only on public.yqaa_review_submissions
  for all to service_role using (true) with check (true);

create or replace function public.capture_yqaa_offer_outcome()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_order bigint;
begin
  begin
    if new.yqaa_idempotency_key is null then return new; end if;
    if tg_op = 'INSERT' or old.status is distinct from new.status then
      v_event_order := nextval('public.yqaa_negotiation_outcomes_order_seq');
      insert into public.yqaa_negotiation_outcomes(event_order, source_kind, source_id, state, event_key)
      values (v_event_order, 'offer', new.id, new.status,
        'offer:' || new.id::text || ':' || v_event_order::text || ':' || new.status);
    end if;
  exception when others then
    raise warning 'YQAA offer outcome capture failed; source status remains authoritative';
  end;
  return new;
end;
$$;
drop trigger if exists offers_capture_yqaa_outcome on public.offers;
create trigger offers_capture_yqaa_outcome
  after insert or update of status on public.offers
  for each row execute function public.capture_yqaa_offer_outcome();
revoke all on function public.capture_yqaa_offer_outcome() from public, anon, authenticated;
grant execute on function public.capture_yqaa_offer_outcome() to service_role;

create or replace function public.capture_yqaa_approval_outcome()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_event_order bigint;
begin
  begin
    if tg_op = 'INSERT' or old.status is distinct from new.status then
      v_event_order := nextval('public.yqaa_negotiation_outcomes_order_seq');
      insert into public.yqaa_negotiation_outcomes(event_order, source_kind, source_id, state, event_key)
      values (v_event_order, 'provider_approval', md5(new.conversation_id::text || ':' || new.request_id::text || ':' || new.version::text)::uuid, new.status,
        'approval:' || new.conversation_id::text || ':' || new.request_id::text || ':' || new.version::text || ':' || v_event_order::text || ':' || new.status);
    end if;
  exception when others then
    raise warning 'YQAA provider approval outcome capture failed; source status remains authoritative';
  end;
  return new;
end;
$$;
drop trigger if exists yqaa_approvals_capture_outcome on public.yqaa_pricing_approvals;
create trigger yqaa_approvals_capture_outcome
  after insert or update of status on public.yqaa_pricing_approvals
  for each row execute function public.capture_yqaa_approval_outcome();
revoke all on function public.capture_yqaa_approval_outcome() from public, anon, authenticated;
grant execute on function public.capture_yqaa_approval_outcome() to service_role;

comment on table public.yqaa_negotiation_outcomes is
  'Idempotent state events from YQAA offer and provider approval rows only; service-role access.';
comment on table public.yqaa_review_submissions is
  'Append-only structured human review intake. Qualification claims remain unverified and are excluded from gold metrics.';
