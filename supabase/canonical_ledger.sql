-- =============================================================================
-- canonical_ledger.sql
--
-- Single source of financial truth across students, attorneys, consultants,
-- and the platform. Every monetary event writes exactly one row per affected
-- profile with direction (debit / credit). The property:
--
--   For every distinct (source_table, source_id) group:
--     SUM(CASE WHEN direction='credit' THEN amount_cents ELSE 0 END) -
--     SUM(CASE WHEN direction='debit'  THEN amount_cents ELSE 0 END) = 0
--
-- i.e. every transaction is balanced. Running balances are computed on write
-- via a window function so they are always consistent.
--
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- ── 1. Main ledger table ─────────────────────────────────────────────────────
create table if not exists public.canonical_ledger (
  id                uuid primary key default gen_random_uuid(),

  -- Subject of this entry (student, attorney, consultant, platform)
  profile_id        uuid references public.profiles(id) on delete cascade,

  -- Counterparty on the other side (nullable for platform-level entries)
  counterparty_id   uuid references public.profiles(id) on delete set null,

  -- Amount (always >= 0; direction determines whether it increases or
  -- decreases the profile's balance).
  amount_cents      integer not null check (amount_cents >= 0),
  currency          text not null default 'usd',

  -- Running balance for profile_id after this entry is applied.
  balance_after_cents integer not null check (balance_after_cents >= 0),

  -- Classification
  entry_type        text not null check (entry_type in (
    'purchase', 'refund', 'topup', 'payout',
    'fee', 'commission', 'adjustment', 'bonus', 'discount',
    'escrow_deposit', 'escrow_release', 'escrow_refund',
    'loyalty_credit', 'chargeback'
  )),

  -- Direction from the perspective of profile_id
  direction         text not null check (direction in ('debit', 'credit')),

  -- Links to source transaction (unique so we never double-import)
  source_table      text,
  source_id         text,

  -- Optional order reference for order-related entries
  order_id          uuid references public.orders(id) on delete set null,

  -- Human-readable
  description       text not null,
  metadata          jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),

  -- Each source row maps to exactly one canonical_ledger entry.
  -- Partial index covers non-null pairs (PG < 15 compatible).
);

-- Table-level unique constraint so ON CONFLICT works in the backfill / API.
-- In PG < 15, multiple (null, null) rows are allowed (null != null).
alter table public.canonical_ledger
  add constraint canonical_ledger_unique_source
  unique (source_table, source_id);

-- ── 2. Indexes ───────────────────────────────────────────────────────────────
create index if not exists canonical_ledger_profile_idx
  on public.canonical_ledger(profile_id, created_at desc);

create index if not exists canonical_ledger_entry_type_idx
  on public.canonical_ledger(entry_type, created_at desc) where entry_type is not null;

create index if not exists canonical_ledger_order_idx
  on public.canonical_ledger(order_id) where order_id is not null;

create index if not exists canonical_ledger_source_idx
  on public.canonical_ledger(source_table, source_id)
  where source_table is not null and source_id is not null;

-- Note: removed time-based partial index (requires IMMUTABLE predicates) —
-- the plain created_at index is sufficient for time-range queries.

create index if not exists canonical_ledger_platform_idx
  on public.canonical_ledger(entry_type, direction, created_at)
  where profile_id is null;

-- ── 3. Helper: get running balance for one or more profiles ──────────────────
create or replace function public.ledger_balance(
  p_profile_ids uuid[] default null,
  p_as_of timestamptz default now()
)
returns table (profile_id uuid, balance_cents bigint)
language sql stable
as $$
  select
    cl.profile_id,
    sum(case when cl.direction = 'credit' then cl.amount_cents else -cl.amount_cents end) as balance_cents
  from public.canonical_ledger cl
  where (p_profile_ids is null or cl.profile_id = any(p_profile_ids))
    and cl.created_at <= p_as_of
  group by cl.profile_id;
$$;

-- ── 4. Helper: aggregated totals by type and period ──────────────────────────
create or replace function public.ledger_totals(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_entry_types text[] default null
)
returns table (
  entry_type   text,
  direction    text,
  total_cents  bigint,
  count        bigint
)
language sql stable
as $$
  select
    cl.entry_type,
    cl.direction,
    sum(cl.amount_cents) as total_cents,
    count(*)::bigint as count
  from public.canonical_ledger cl
  where cl.created_at >= p_from
    and cl.created_at <= p_to
    and (p_entry_types is null or cl.entry_type = any(p_entry_types))
  group by cl.entry_type, cl.direction
  order by cl.entry_type, cl.direction;
$$;

-- ── 5. Helper: daily series for charts ───────────────────────────────────────
create or replace function public.ledger_daily_series(
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now()
)
returns table (
  date         date,
  gross_cents  bigint,
  net_cents    bigint,
  fee_cents    bigint,
  refund_cents bigint,
  payout_cents bigint
)
language sql stable
as $$
  with days as (
    select generate_series(p_from::date, p_to::date, '1 day'::interval)::date as dt
  )
  select
    d.dt,
    coalesce(sum(cl.amount_cents) filter (
      where cl.entry_type = 'purchase' and cl.direction = 'credit' and cl.profile_id is null
    ), 0) as gross_cents,  -- platform-side credit from purchases = gross revenue
    coalesce(sum(cl.amount_cents) filter (
      where cl.entry_type = 'fee' and cl.direction = 'credit'
    ), 0) as net_cents,  -- platform fee credits = net take
    coalesce(sum(cl.amount_cents) filter (
      where cl.entry_type = 'fee' and cl.direction = 'debit'
    ), 0) as fee_cents,
    coalesce(sum(cl.amount_cents) filter (
      where cl.entry_type = 'refund'
    ), 0) as refund_cents,
    coalesce(sum(cl.amount_cents) filter (
      where cl.entry_type = 'payout' and cl.direction = 'credit'
    ), 0) as payout_cents
  from days d
  left join public.canonical_ledger cl on cl.created_at::date = d.dt
  group by d.dt
  order by d.dt;
$$;

-- ── 6. Helper: platform-wide summary for Financials Overview ─────────────────
create or replace function public.ledger_platform_summary(
  p_days integer default 30
)
returns jsonb
language plpgsql stable
as $body$
declare
  v_now timestamptz := now();
  v_ago_period timestamptz := v_now - (p_days || ' days')::interval;
  v_ago_prev timestamptz := v_now - ((p_days * 2) || ' days')::interval;
  v_gross_30d bigint;
  v_gross_prev bigint;
  v_refund_30d bigint;
  v_net_take_30d bigint;
  v_payouts_30d bigint;
  v_orders_30d bigint;
  v_refunds_30d bigint;
  v_escrow bigint;
begin
  select
    coalesce(sum(amount_cents) filter (where entry_type in ('purchase','fee','commission') and direction = 'credit' and profile_id is null and created_at >= v_ago_period), 0),
    coalesce(sum(amount_cents) filter (where entry_type = 'refund' and created_at >= v_ago_period), 0),
    coalesce(sum(amount_cents) filter (where entry_type = 'fee' and direction = 'credit' and created_at >= v_ago_period), 0),
    coalesce(sum(amount_cents) filter (where entry_type = 'payout' and direction = 'credit' and created_at >= v_ago_period), 0),
    count(*) filter (where entry_type = 'purchase' and created_at >= v_ago_period),
    count(*) filter (where entry_type = 'refund' and created_at >= v_ago_period),
    coalesce(sum(amount_cents) filter (where entry_type in ('purchase','fee','commission') and direction = 'credit' and profile_id is null and created_at >= v_ago_prev and created_at < v_ago_period), 0)
  into v_gross_30d, v_refund_30d, v_net_take_30d, v_payouts_30d, v_orders_30d, v_refunds_30d, v_gross_prev
  from public.canonical_ledger;

  select coalesce(sum(amount_cents), 0) into v_escrow
  from public.canonical_ledger
  where entry_type = 'escrow_deposit' and direction = 'debit' and profile_id is not null;

  return jsonb_build_object(
    'gross_30d_cents', v_gross_30d,
    'gross_30d_prev_cents', v_gross_prev,
    'net_take_30d_cents', v_net_take_30d,
    'payouts_30d_cents', v_payouts_30d,
    'refund_rate_30d_pct', case when v_orders_30d > 0 then round((v_refunds_30d::numeric / v_orders_30d) * 100, 2) else 0 end,
    'chargeback_dollar_30d_cents', v_refund_30d,
    'outstanding_escrow_cents', v_escrow
  );
end;
$body$;

-- ── 7. Trigger: prevent updates/deletes on the ledger ────────────────────────
create or replace function public.prevent_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'canonical_ledger is append-only — no updates or deletes allowed. Create a corrective entry instead.';
end;
$$;

drop trigger if exists canonical_ledger_immutable on public.canonical_ledger;
create trigger canonical_ledger_immutable
before update or delete on public.canonical_ledger
for each row execute function public.prevent_ledger_mutation();

-- ── 8. Schema cache reload ───────────────────────────────────────────────────
notify pgrst, 'reload schema';
