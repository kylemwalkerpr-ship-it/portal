-- YQAA provider pricing preferences and durable approval decisions.
-- Additive only. This file is tracked for normal migration review and is not
-- applied by this coding task.

create table if not exists public.provider_pricing_preferences (
  provider_id uuid primary key references public.profiles(id) on delete cascade,
  negotiation_enabled boolean not null default true,
  auto_accept_pct numeric(5,2),
  flex_pct numeric(5,2),
  approval_band_pct numeric(5,2),
  max_auto_concessions integer,
  prefer_accept boolean not null default false,
  hourly_rate_cents integer,
  min_effective_rate_cents integer,
  min_floor_cents integer,
  updated_at timestamptz not null default now(),
  constraint provider_pricing_preferences_ranges_check check (
    (auto_accept_pct is null or auto_accept_pct between 0 and 100) and
    (flex_pct is null or flex_pct between 0 and 100) and
    (approval_band_pct is null or approval_band_pct between 0 and 100) and
    (max_auto_concessions is null or max_auto_concessions between 0 and 10) and
    (hourly_rate_cents is null or hourly_rate_cents > 0) and
    (min_effective_rate_cents is null or min_effective_rate_cents > 0) and
    (min_floor_cents is null or min_floor_cents >= 100)
  )
);
alter table public.provider_pricing_preferences add column if not exists negotiation_enabled boolean not null default true;
alter table public.provider_pricing_preferences add column if not exists auto_accept_pct numeric(5,2);
alter table public.provider_pricing_preferences add column if not exists flex_pct numeric(5,2);
alter table public.provider_pricing_preferences add column if not exists approval_band_pct numeric(5,2);
alter table public.provider_pricing_preferences add column if not exists max_auto_concessions integer;
alter table public.provider_pricing_preferences add column if not exists prefer_accept boolean not null default false;
alter table public.provider_pricing_preferences add column if not exists hourly_rate_cents integer;
alter table public.provider_pricing_preferences add column if not exists min_effective_rate_cents integer;
alter table public.provider_pricing_preferences add column if not exists min_floor_cents integer;
alter table public.provider_pricing_preferences add column if not exists updated_at timestamptz not null default now();
alter table public.provider_pricing_preferences enable row level security;
drop policy if exists provider_pricing_preferences_own_row on public.provider_pricing_preferences;
create policy provider_pricing_preferences_own_row on public.provider_pricing_preferences
  for all to authenticated using (auth.uid() = provider_id) with check (auth.uid() = provider_id);
grant select, insert, update, delete on public.provider_pricing_preferences to authenticated;
grant select, insert, update, delete on public.provider_pricing_preferences to service_role;

create table if not exists public.yqaa_pricing_approvals (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  request_id uuid not null,
  version integer not null check (version > 0),
  provider_id uuid not null references public.profiles(id) on delete cascade,
  price_cents integer not null check (price_cents >= 100),
  scope_hash text not null check (length(scope_hash) between 1 and 160),
  gig_id uuid references public.gigs(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','declined','invalidated')),
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  consumed_at timestamptz,
  primary key (conversation_id, request_id, version)
);
create index if not exists yqaa_pricing_approvals_provider_pending_idx
  on public.yqaa_pricing_approvals (provider_id, created_at desc) where status = 'pending';
alter table public.yqaa_pricing_approvals enable row level security;
revoke all on public.yqaa_pricing_approvals from public, anon, authenticated;
grant select, insert, update, delete on public.yqaa_pricing_approvals to service_role;
drop policy if exists yqaa_pricing_approvals_service_only on public.yqaa_pricing_approvals;
create policy yqaa_pricing_approvals_service_only on public.yqaa_pricing_approvals
  for all to service_role using (true) with check (true);

-- Preference edits invalidate outstanding decisions because their pricing
-- context has changed. A provider must review a fresh request/version.
create or replace function public.invalidate_yqaa_pricing_approvals_on_preference_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.yqaa_pricing_approvals set status = 'invalidated', resolved_at = clock_timestamp()
   where provider_id = new.provider_id and status in ('pending','approved');
  return new;
end;
$$;
drop trigger if exists provider_pricing_preferences_invalidate_approvals on public.provider_pricing_preferences;
create trigger provider_pricing_preferences_invalidate_approvals
  after update on public.provider_pricing_preferences
  for each row execute function public.invalidate_yqaa_pricing_approvals_on_preference_change();
revoke all on function public.invalidate_yqaa_pricing_approvals_on_preference_change() from public, anon, authenticated;
grant execute on function public.invalidate_yqaa_pricing_approvals_on_preference_change() to service_role;

-- The existing commit_yqaa_reply RPC updates conversation metadata atomically.
-- This trigger materializes every new approval request in that same transaction.
create or replace function public.materialize_yqaa_pricing_approval_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_provider uuid;
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
begin
  if coalesce((v_meta->>'ai_pricing_approval_pending')::boolean, false) is not true
     or nullif(v_meta->>'ai_pricing_approval_request_id', '') is null
     or nullif(v_meta->>'ai_pricing_approval_scope_hash', '') is null
     or coalesce((v_meta->>'ai_pricing_approval_price_cents')::integer, 0) < 100 then
    return new;
  end if;
  select p.id into v_provider from public.profiles p
   where p.id in (new.participant_a, new.participant_b)
     and lower(p.role) in ('attorney','consultant');
  if v_provider is null then return new; end if;
  update public.yqaa_pricing_approvals set status = 'invalidated', resolved_at = clock_timestamp()
   where conversation_id = new.id and status in ('pending','approved')
     and request_id <> (v_meta->>'ai_pricing_approval_request_id')::uuid;
  insert into public.yqaa_pricing_approvals (
    conversation_id, request_id, version, provider_id, price_cents, scope_hash, gig_id
  ) values (
    new.id,
    (v_meta->>'ai_pricing_approval_request_id')::uuid,
    greatest(1, coalesce((v_meta->>'ai_pricing_approval_version')::integer, 1)),
    v_provider,
    (v_meta->>'ai_pricing_approval_price_cents')::integer,
    v_meta->>'ai_pricing_approval_scope_hash',
    nullif(v_meta->>'ai_pricing_approval_gig_id', '')::uuid
  ) on conflict (conversation_id, request_id, version) do nothing;
  return new;
end;
$$;
drop trigger if exists conversations_materialize_yqaa_pricing_approval on public.conversations;
create trigger conversations_materialize_yqaa_pricing_approval
  after update of metadata on public.conversations
  for each row execute function public.materialize_yqaa_pricing_approval_request();
revoke all on function public.materialize_yqaa_pricing_approval_request() from public, anon, authenticated;
grant execute on function public.materialize_yqaa_pricing_approval_request() to service_role;

create or replace function public.resolve_yqaa_pricing_approval(
  p_conversation_id uuid, p_request_id uuid, p_version integer,
  p_provider_id uuid, p_decision text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row public.yqaa_pricing_approvals%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_decision not in ('approved','declined') or p_version < 1 then
    raise exception 'invalid approval decision' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.conversations c
     where c.id = p_conversation_id
       and p_provider_id in (c.participant_a, c.participant_b)
       and exists (select 1 from public.profiles p where p.id = p_provider_id and lower(p.role) in ('attorney','consultant'))
  ) then raise exception 'provider conversation scope mismatch' using errcode = '42501'; end if;
  perform 1 from public.conversations c where c.id = p_conversation_id for update;
  select * into v_row from public.yqaa_pricing_approvals a
   where a.conversation_id = p_conversation_id and a.request_id = p_request_id
     and a.version = p_version and a.provider_id = p_provider_id for update;
  if not found then raise exception 'approval request not found' using errcode = 'P0002'; end if;
  if v_row.status = 'pending' and not exists (
    select 1 from public.conversations c
     where c.id = p_conversation_id
       and coalesce(c.metadata->>'ai_pricing_approval_pending', 'false') = 'true'
       and c.metadata->>'ai_pricing_approval_request_id' = p_request_id::text
       and coalesce((c.metadata->>'ai_pricing_approval_version')::integer, 1) = p_version
       and coalesce((c.metadata->>'ai_pricing_approval_price_cents')::integer, 0) = v_row.price_cents
       and c.metadata->>'ai_pricing_approval_scope_hash' = v_row.scope_hash
       and nullif(c.metadata->>'ai_pricing_approval_gig_id', '') is not distinct from v_row.gig_id::text
  ) then
    raise exception 'approval request is no longer current' using errcode = '40001';
  end if;
  if v_row.status <> 'pending' then
    if v_row.status = p_decision then
      return jsonb_build_object('status', v_row.status, 'version', v_row.version, 'price_cents', v_row.price_cents, 'scope_hash', v_row.scope_hash, 'replayed', true);
    end if;
    raise exception 'approval request already resolved' using errcode = '40001';
  end if;
  update public.yqaa_pricing_approvals set status = p_decision, resolved_by = p_provider_id, resolved_at = clock_timestamp()
   where conversation_id = p_conversation_id and request_id = p_request_id and version = p_version;
  update public.conversations set metadata =
    (coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'ai_pricing_approval_status', p_decision,
      'ai_pricing_approval_resolved_at', clock_timestamp(),
      'ai_pricing_approval_resolved_version', p_version
    )) || case
      when p_decision = 'approved'
       and coalesce(metadata->>'ai_mode', 'auto') = 'paused'
       and coalesce(metadata->>'ai_pricing_approval_pending', 'false') = 'true'
       and coalesce(metadata->>'ai_mode_set_by', '') = ''
       and coalesce(metadata->>'ai_paused_reason', '') = ''
      then jsonb_build_object('ai_mode', 'auto', 'ai_escalated_at', null, 'ai_escalation_reason', null)
      else '{}'::jsonb
    end,
    updated_at = clock_timestamp() where id = p_conversation_id;
  return jsonb_build_object('status', p_decision, 'version', p_version, 'price_cents', v_row.price_cents, 'scope_hash', v_row.scope_hash, 'replayed', false);
end;
$$;
revoke all on function public.resolve_yqaa_pricing_approval(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_yqaa_pricing_approval(uuid, uuid, integer, uuid, text) to service_role;

create or replace function public.invalidate_yqaa_pricing_approval(
  p_conversation_id uuid, p_request_id uuid, p_version integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.yqaa_pricing_approvals set status = 'invalidated', resolved_at = clock_timestamp()
   where conversation_id = p_conversation_id and request_id = p_request_id and version = p_version
     and status in ('pending','approved');
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;
revoke all on function public.invalidate_yqaa_pricing_approval(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.invalidate_yqaa_pricing_approval(uuid, uuid, integer) to service_role;

-- If a YQAA offer is produced after an approval, this same offer transaction
-- must consume the exact durable approval. The application also checks scope
-- before constructing the offer; this trigger closes the replay/race window.
create or replace function public.consume_yqaa_pricing_approval_for_offer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_conversation_id uuid;
  v_conversation public.conversations%rowtype;
  v_request_id uuid;
  v_version integer;
  v_approval public.yqaa_pricing_approvals%rowtype;
begin
  if new.yqaa_idempotency_key is null then return new; end if;
  begin
    v_conversation_id := split_part(new.yqaa_idempotency_key, ':', 2)::uuid;
  exception when others then return new;
  end;
  select * into v_conversation from public.conversations c where c.id = v_conversation_id for update;
  if not found then return new; end if;
  begin
    v_request_id := nullif(v_conversation.metadata->>'ai_pricing_approval_request_id', '')::uuid;
    v_version := greatest(1, coalesce((v_conversation.metadata->>'ai_pricing_approval_version')::integer, 1));
  exception when others then return new;
  end;
  if v_request_id is null then return new; end if;
  select * into v_approval from public.yqaa_pricing_approvals a
   where a.conversation_id = v_conversation_id and a.request_id = v_request_id
     and a.version = v_version and a.provider_id = new.sender_id for update;
  if not found or v_approval.status <> 'approved' then return new; end if;
  if v_approval.price_cents <> new.price
     or v_approval.scope_hash is distinct from v_conversation.metadata->>'ai_pricing_approval_scope_hash'
     or v_approval.gig_id is distinct from nullif(v_conversation.metadata->>'ai_pricing_approval_gig_id', '')::uuid then
    raise exception 'YQAA offer does not match the approved quote' using errcode = '42501';
  end if;
  -- A previously used approval is no longer authority. The application may
  -- still produce a later offer under ordinary adaptive-pricing rules.
  if v_approval.consumed_at is not null then return new; end if;
  update public.yqaa_pricing_approvals set consumed_at = clock_timestamp()
   where conversation_id = v_conversation_id and request_id = v_request_id and version = v_version
     and status = 'approved' and consumed_at is null;
  if not found then
    raise exception 'YQAA pricing approval has already been consumed' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists offers_consume_yqaa_pricing_approval on public.offers;
create trigger offers_consume_yqaa_pricing_approval
  before insert on public.offers for each row execute function public.consume_yqaa_pricing_approval_for_offer();
revoke all on function public.consume_yqaa_pricing_approval_for_offer() from public, anon, authenticated;
grant execute on function public.consume_yqaa_pricing_approval_for_offer() to service_role;
