-- Pesapal P0 / P0.5 payment settings, quote ledger and FX-rate schema.
-- PROPOSED ONLY. Apply through the approved Supabase workflow after a backup.

create table public.payment_provider_settings (
  provider text primary key,
  enabled boolean not null default false,
  retired boolean not null default false,
  test_mode_owner_only boolean not null default true,
  test_allowlist uuid[] not null default '{}',
  priority integer not null default 100 check (priority >= 0),
  is_default boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (not is_default or (enabled and not retired))
);
create unique index payment_provider_settings_one_default
  on public.payment_provider_settings (is_default) where is_default;

create table public.payment_method_settings (
  provider text not null references public.payment_provider_settings(provider) on delete cascade,
  method text not null,
  enabled boolean not null default false,
  currencies char(3)[],
  countries char(2)[],
  priority integer not null default 100 check (priority >= 0),
  min_amount_minor bigint,
  max_amount_minor bigint,
  primary key (provider, method),
  check (min_amount_minor is null or min_amount_minor >= 0),
  check (max_amount_minor is null or max_amount_minor >= 0),
  check (min_amount_minor is null or max_amount_minor is null or min_amount_minor <= max_amount_minor)
);

create table public.payment_global_settings (
  singleton boolean primary key default true check (singleton),
  country_default_routing_enabled boolean not null default false,
  fx_markup_bps integer not null default 0 check (fx_markup_bps >= 0),
  version bigint not null default 1 check (version > 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table public.payment_settings_audit (
  id bigserial primary key,
  actor_profile_id uuid not null,
  actor_role text not null,
  action text not null,
  target text not null,
  before jsonb,
  after jsonb,
  reason text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  merchant_reference text not null unique,
  gateway text not null check (gateway in ('pesapal', 'nmi', 'authorizenet', 'manual')),
  order_id uuid references public.orders(id),
  template_order_id text,
  wallet_topup_id uuid,
  profile_id uuid not null references public.profiles(id),
  source_type text not null,
  source_id text not null,
  source_payload jsonb not null default '{}'::jsonb,
  purpose text not null check (purpose in ('order', 'template', 'wallet_topup', 'offer', 'template_fill')),
  status text not null default 'created' check (status in (
    'created', 'submitted', 'pending', 'processing', 'completed', 'failed', 'invalid', 'cancelled', 'expired',
    'refund_requested', 'refunded', 'refund_rejected', 'reversed'
  )),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null,
  base_amount_usd_minor bigint not null check (base_amount_usd_minor > 0),
  charge_currency char(3) not null,
  charge_amount_minor bigint not null check (charge_amount_minor > 0),
  fx_rate numeric(18, 10) not null default 1 check (fx_rate > 0),
  fx_rate_source text,
  fx_rate_fetched_at timestamptz,
  fx_markup_bps integer not null default 0 check (fx_markup_bps >= 0),
  quote_expires_at timestamptz,
  settings_version bigint not null default 1,
  provider_tracking_id text unique,
  confirmation_code text,
  payment_method text,
  payment_account_masked text,
  provider_status_code integer,
  last_status_raw jsonb,
  refund_amount_minor bigint,
  refund_status text,
  refund_window_expires_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  next_poll_at timestamptz,
  poll_count integer not null default 0 check (poll_count >= 0)
);
create index payment_attempts_status_poll_idx on public.payment_attempts (status, next_poll_at);
create index payment_attempts_gateway_created_idx on public.payment_attempts (gateway, created_at desc);

create table public.payment_ledger_entries (
  id bigserial primary key,
  attempt_id uuid not null references public.payment_attempts(id),
  entry_type text not null check (entry_type in ('capture', 'refund', 'reversal', 'fee', 'adjustment')),
  amount_minor bigint not null,
  currency char(3) not null,
  amount_usd_minor bigint not null,
  provider_ref text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, entry_type, provider_ref)
);

create table public.fx_rates (
  base char(3) not null,
  quote char(3) not null,
  rate numeric(18, 10) not null check (rate > 0),
  source text not null,
  fetched_at timestamptz not null,
  primary key (base, quote, fetched_at),
  check (base <> quote)
);
create index fx_rates_latest_idx on public.fx_rates (base, quote, fetched_at desc);

create or replace function public.reject_fx_rate_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'fx_rates is append-only';
end;
$$;
create trigger fx_rates_append_only
before update or delete on public.fx_rates
for each row execute function public.reject_fx_rate_mutation();

-- Seed the existing processor behavior. Pesapal is registered but disabled and owner-test-only.
insert into public.payment_provider_settings (provider, enabled, test_mode_owner_only, priority, is_default)
values
  ('nmi', true, false, 10, true),
  ('authorizenet', true, false, 20, false),
  ('manual', true, false, 100, false),
  ('pesapal', false, true, 200, false);

insert into public.payment_method_settings (provider, method, enabled, currencies, priority)
values
  ('nmi', 'card', true, array['USD']::char(3)[], 10),
  ('authorizenet', 'card', true, array['USD']::char(3)[], 20),
  ('manual', 'wallet', true, array['USD']::char(3)[], 30),
  ('manual', 'invoice', true, array['USD']::char(3)[], 100),
  ('pesapal', 'card', false, array['USD', 'GBP']::char(3)[], 200),
  ('pesapal', 'mpesa', false, array['USD', 'GBP']::char(3)[], 210),
  ('pesapal', 'airtel', false, array['USD', 'GBP']::char(3)[], 220);

insert into public.payment_global_settings (singleton, country_default_routing_enabled, fx_markup_bps, version)
values (true, false, 0, 1);

-- The established orders_status_check vocabulary is extended for the safe
-- no-charge fallback. This migration is proposed and must be reviewed against
-- live constraints before application.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders drop constraint if exists orders_status_fiverr_check;
alter table public.orders add constraint orders_status_check check (status in (
  'pending', 'queued', 'created', 'new', 'active', 'in_progress', 'working',
  'delivered', 'awaiting_client', 'client_review', 'revision_requested',
  'under_review', 'in_review', 'approved', 'completed', 'released', 'closed',
  'paid', 'refunded', 'cancelled', 'canceled', 'disputed', 'chargeback', 'frozen',
  'pending_invoice'
));

-- Audit writes for settings changes are generated by row triggers. The RPC sets
-- transaction-local actor metadata so the trigger remains the source of truth.
create or replace function public.capture_payment_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_role text;
  v_reason text;
  v_ip text;
  v_agent text;
  v_before jsonb;
  v_after jsonb;
  v_target text;
  v_action text;
begin
  v_actor := nullif(current_setting('app.payment_actor_profile_id', true), '')::uuid;
  v_role := coalesce(nullif(current_setting('app.payment_actor_role', true), ''), current_user);
  v_reason := nullif(current_setting('app.payment_change_reason', true), '');
  v_ip := nullif(current_setting('app.payment_actor_ip', true), '');
  v_agent := nullif(current_setting('app.payment_actor_user_agent', true), '');

  if tg_op = 'INSERT' then
    v_before := null;
    v_after := to_jsonb(new);
  elsif tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after := null;
  else
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    if tg_table_name = 'payment_global_settings'
       and (v_before - 'version' - 'updated_at' - 'updated_by') = (v_after - 'version' - 'updated_at' - 'updated_by') then
      return new;
    end if;
  end if;

  if tg_table_name = 'payment_method_settings' then
    v_target := coalesce(v_after->>'provider', v_before->>'provider') || ':' || coalesce(v_after->>'method', v_before->>'method');
  elsif tg_table_name = 'payment_provider_settings' then
    v_target := coalesce(v_after->>'provider', v_before->>'provider');
  else
    v_target := 'global';
  end if;
  v_action := lower(tg_table_name || '_' || tg_op);

  insert into public.payment_settings_audit (actor_profile_id, actor_role, action, target, before, after, reason, ip, user_agent)
  values (
    coalesce(v_actor, coalesce(nullif(coalesce(v_after->>'updated_by', v_before->>'updated_by'), '')::uuid, '00000000-0000-0000-0000-000000000000'::uuid)),
    v_role,
    v_action,
    v_target,
    v_before,
    v_after,
    v_reason,
    v_ip::inet,
    v_agent
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger payment_provider_settings_audit
after insert or update or delete on public.payment_provider_settings
for each row execute function public.capture_payment_settings_audit();
create trigger payment_method_settings_audit
after insert or update or delete on public.payment_method_settings
for each row execute function public.capture_payment_settings_audit();
create trigger payment_global_settings_audit
after insert or update or delete on public.payment_global_settings
for each row execute function public.capture_payment_settings_audit();

create or replace function public.reject_payment_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'payment_settings_audit is append-only';
end;
$$;
create trigger payment_settings_audit_append_only
before update or delete on public.payment_settings_audit
for each row execute function public.reject_payment_audit_mutation();

create or replace function public.reject_payment_ledger_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'payment_ledger_entries is append-only';
end;
$$;
create trigger payment_ledger_entries_append_only
before update or delete on public.payment_ledger_entries
for each row execute function public.reject_payment_ledger_mutation();

-- Atomic owner PATCH: optimistic version check, row updates and trigger audit
-- writes share one transaction. Application code validates registry values.
create or replace function public.apply_payment_settings_patch(
  p_expected_version bigint,
  p_actor_profile_id uuid,
  p_actor_role text,
  p_reason text,
  p_provider_changes jsonb default '[]'::jsonb,
  p_method_changes jsonb default '[]'::jsonb,
  p_global_changes jsonb default '{}'::jsonb,
  p_actor_ip text default null,
  p_actor_user_agent text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version bigint;
  v_next_version bigint;
  v_change jsonb;
  v_provider text;
  v_test_allowlist uuid[];
begin
  select version into v_current_version
  from public.payment_global_settings
  where singleton = true
  for update;
  if v_current_version is null then raise exception 'payment_global_settings row missing'; end if;
  if v_current_version <> p_expected_version then
    raise exception 'payment_settings_version_conflict' using errcode = 'P0001';
  end if;
  v_next_version := v_current_version + 1;

  perform set_config('app.payment_actor_profile_id', p_actor_profile_id::text, true);
  perform set_config('app.payment_actor_role', p_actor_role, true);
  perform set_config('app.payment_change_reason', p_reason, true);
  perform set_config('app.payment_actor_ip', coalesce(p_actor_ip, ''), true);
  perform set_config('app.payment_actor_user_agent', coalesce(p_actor_user_agent, ''), true);

  for v_change in select value from jsonb_array_elements(coalesce(p_provider_changes, '[]'::jsonb)) loop
    v_provider := v_change->>'provider';
    if coalesce((v_change->>'retired')::boolean, false) then
      if coalesce((v_change->>'enabled')::boolean, true) then
        raise exception 'provider must be disabled before retirement';
      end if;
      if exists (
        select 1 from public.payment_attempts
        where gateway = v_provider
          and (status in ('created', 'submitted', 'pending', 'refund_requested')
            or (status = 'completed' and refund_window_expires_at > now()))
      ) then
        raise exception 'provider has open or refundable payment attempts';
      end if;
    end if;
    if coalesce((v_change->>'is_default')::boolean, false) then
      update public.payment_provider_settings
      set is_default = false, version = v_next_version, updated_by = p_actor_profile_id, updated_at = now()
      where is_default and provider <> v_provider;
    end if;
    v_test_allowlist := case when v_change ? 'test_allowlist'
      then array(select jsonb_array_elements_text(v_change->'test_allowlist')::uuid)
      else null end;
    update public.payment_provider_settings set
      enabled = coalesce((v_change->>'enabled')::boolean, enabled),
      retired = coalesce((v_change->>'retired')::boolean, retired),
      test_mode_owner_only = coalesce((v_change->>'test_mode_owner_only')::boolean, test_mode_owner_only),
      test_allowlist = coalesce(v_test_allowlist, test_allowlist),
      priority = coalesce((v_change->>'priority')::integer, priority),
      is_default = coalesce((v_change->>'is_default')::boolean, is_default),
      updated_by = p_actor_profile_id,
      updated_at = now(),
      version = v_next_version
    where provider = v_provider;
    if not found then raise exception 'unknown payment provider setting'; end if;
  end loop;

  for v_change in select value from jsonb_array_elements(coalesce(p_method_changes, '[]'::jsonb)) loop
    update public.payment_method_settings set
      enabled = coalesce((v_change->>'enabled')::boolean, enabled),
      currencies = case when v_change ? 'currencies' then
        case when v_change->'currencies' = 'null'::jsonb then null else array(select jsonb_array_elements_text(v_change->'currencies')::char(3)) end
        else currencies end,
      countries = case when v_change ? 'countries' then
        case when v_change->'countries' = 'null'::jsonb then null else array(select jsonb_array_elements_text(v_change->'countries')::char(2)) end
        else countries end,
      priority = coalesce((v_change->>'priority')::integer, priority),
      min_amount_minor = case when v_change ? 'min_amount_minor' then nullif(v_change->>'min_amount_minor', '')::bigint else min_amount_minor end,
      max_amount_minor = case when v_change ? 'max_amount_minor' then nullif(v_change->>'max_amount_minor', '')::bigint else max_amount_minor end
    where provider = v_change->>'provider' and method = v_change->>'method';
    if not found then raise exception 'unknown payment method setting'; end if;
  end loop;

  if coalesce(p_global_changes, '{}'::jsonb) <> '{}'::jsonb then
    update public.payment_global_settings set
      country_default_routing_enabled = coalesce((p_global_changes->>'country_default_routing_enabled')::boolean, country_default_routing_enabled),
      fx_markup_bps = coalesce((p_global_changes->>'fx_markup_bps')::integer, fx_markup_bps),
      version = v_next_version,
      updated_by = p_actor_profile_id,
      updated_at = now()
    where singleton = true;
  else
    update public.payment_global_settings
    set version = v_next_version, updated_by = p_actor_profile_id, updated_at = now()
    where singleton = true;
  end if;

  return v_next_version;
end;
$$;

revoke all on function public.apply_payment_settings_patch(bigint, uuid, text, text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.apply_payment_settings_patch(bigint, uuid, text, text, jsonb, jsonb, jsonb, text, text) to service_role;

-- Mail failures use the existing incident table, with their own typed kind.
alter table public.payment_incidents drop constraint if exists payment_incidents_kind_check;
alter table public.payment_incidents add constraint payment_incidents_kind_check check (kind in (
  'charge_without_order', 'debit_without_order', 'refund_failed', 'earning_credit_failed',
  'payment_settings_alert_failed', 'payment_methods_unavailable'
));

alter table public.payment_provider_settings enable row level security;
alter table public.payment_method_settings enable row level security;
alter table public.payment_global_settings enable row level security;
alter table public.payment_settings_audit enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.payment_ledger_entries enable row level security;
alter table public.fx_rates enable row level security;

revoke all on public.payment_provider_settings, public.payment_method_settings, public.payment_global_settings,
  public.payment_settings_audit, public.payment_attempts, public.payment_ledger_entries, public.fx_rates
  from anon, authenticated;
revoke all on sequence public.payment_settings_audit_id_seq, public.payment_ledger_entries_id_seq from anon, authenticated;
grant all on public.payment_provider_settings, public.payment_method_settings, public.payment_global_settings,
  public.payment_settings_audit, public.payment_attempts, public.payment_ledger_entries, public.fx_rates
  to service_role;
grant usage, select on sequence public.payment_settings_audit_id_seq, public.payment_ledger_entries_id_seq to service_role;

-- ROLLBACK (do not run as part of this task)
-- drop trigger if exists payment_ledger_entries_append_only on public.payment_ledger_entries;
-- drop trigger if exists fx_rates_append_only on public.fx_rates;
-- drop trigger if exists payment_settings_audit_append_only on public.payment_settings_audit;
-- drop trigger if exists payment_global_settings_audit on public.payment_global_settings;
-- drop trigger if exists payment_method_settings_audit on public.payment_method_settings;
-- drop trigger if exists payment_provider_settings_audit on public.payment_provider_settings;
-- drop function if exists public.reject_payment_ledger_mutation();
-- drop function if exists public.reject_fx_rate_mutation();
-- drop function if exists public.reject_payment_audit_mutation();
-- drop function if exists public.capture_payment_settings_audit();
-- drop function if exists public.apply_payment_settings_patch(bigint, uuid, text, text, jsonb, jsonb, jsonb, text, text);
-- alter table public.payment_incidents drop constraint if exists payment_incidents_kind_check;
-- alter table public.payment_incidents add constraint payment_incidents_kind_check check (kind in (
--   'charge_without_order', 'debit_without_order', 'refund_failed', 'earning_credit_failed'
-- ));
-- drop table if exists public.fx_rates;
-- drop table if exists public.payment_ledger_entries;
-- drop table if exists public.payment_attempts;
-- drop table if exists public.payment_settings_audit;
-- drop table if exists public.payment_global_settings;
-- drop table if exists public.payment_method_settings;
-- drop table if exists public.payment_provider_settings;
-- alter table public.orders drop constraint if exists orders_status_check;
-- alter table public.orders drop constraint if exists orders_status_fiverr_check;
-- alter table public.orders add constraint orders_status_check check (status in (
--   'pending', 'queued', 'created', 'new', 'active', 'in_progress', 'working',
--   'delivered', 'awaiting_client', 'client_review', 'revision_requested',
--   'under_review', 'in_review', 'approved', 'completed', 'released', 'closed',
--   'paid', 'refunded', 'cancelled', 'canceled', 'disputed', 'chargeback', 'frozen'
-- ));
