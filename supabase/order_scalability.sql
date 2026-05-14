-- =============================================================================
-- order_scalability.sql
-- Future-proof the orders system for limitless users.
-- Idempotent — safe to run multiple times.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Full-text search index for admin search
--    Indexes order_number + revision_reason + any text fields admins search on.
-- ---------------------------------------------------------------------------
create index if not exists orders_fts_idx
  on public.orders
  using gin(
    to_tsvector('english',
      coalesce(order_number,'') || ' ' ||
      coalesce(revision_reason,'')
    )
  );

-- order_number is searched by exact-match too — trigram for short queries
-- (requires pg_trgm; create extension if not present)
do $$
begin
  if not exists (
    select 1 from pg_extension where extname = 'pg_trgm'
  ) then
    create extension pg_trgm;
  end if;
exception when others then null;
end $$;

create index if not exists orders_order_number_trgm_idx
  on public.orders
  using gin (order_number gin_trgm_ops)
  where order_number is not null;

-- ---------------------------------------------------------------------------
-- 2. Workload indexes for admin dashboard queries
-- ---------------------------------------------------------------------------

-- Admin queue by status + recency (most common path)
create index if not exists orders_status_created_idx
  on public.orders (status, created_at desc);

-- Escrow management: held vs released, sorted by amount
create index if not exists orders_escrow_status_idx
  on public.orders (escrow_status, status, created_at desc);

-- Payout queue: which orders need transfers
create index if not exists orders_payout_status_idx
  on public.orders (payout_status, created_at desc)
  where payout_status is not null and payout_status <> 'transferred';

-- Per-client lookups (student dashboard, support)
create index if not exists orders_client_created_idx
  on public.orders (client_id, created_at desc)
  where client_id is not null;

-- Per-provider lookups (consultant/attorney dashboard, payouts)
create index if not exists orders_consultant_created_idx
  on public.orders (consultant_id, created_at desc)
  where consultant_id is not null;

create index if not exists orders_attorney_created_idx
  on public.orders (attorney_id, created_at desc)
  where attorney_id is not null;

-- Late delivery detection — orders past deadline that aren't terminal
create index if not exists orders_deadline_idx
  on public.orders (delivery_deadline, status)
  where delivery_deadline is not null
    and status not in ('completed', 'released', 'cancelled', 'refunded');

-- Date-range queries (analytics, reports)
create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

-- Status updated (for SLA tracking — how long since last state change)
create index if not exists orders_status_updated_idx
  on public.orders (status_updated_at desc, status)
  where status not in ('completed', 'released', 'cancelled', 'refunded');

-- Composite: status + provider for provider's open orders view
create index if not exists orders_provider_status_active_idx
  on public.orders (consultant_id, status)
  where consultant_id is not null
    and status not in ('completed', 'released', 'cancelled', 'refunded');

-- ---------------------------------------------------------------------------
-- 3. order_events workload indexes (timeline, audit)
-- ---------------------------------------------------------------------------
create index if not exists order_events_created_idx
  on public.order_events (order_id, created_at desc);

create index if not exists order_events_actor_idx
  on public.order_events (actor_id, created_at desc)
  where actor_id is not null;

-- ---------------------------------------------------------------------------
-- 4. order_items index for service-title joins
-- ---------------------------------------------------------------------------
create index if not exists order_items_order_idx
  on public.order_items (order_id);

-- ---------------------------------------------------------------------------
-- 5. Materialized status counts (optional — refresh on demand)
--    For the summary strip on the admin dashboard at 1M+ orders, a single
--    COUNT(*) per status is faster than scanning all rows. Use SELECT
--    refresh_order_status_counts() from a scheduled job to refresh.
-- ---------------------------------------------------------------------------
create table if not exists public.order_status_counts (
  status        text primary key,
  count         bigint not null default 0,
  total_amount  numeric(18,2) not null default 0,
  last_updated  timestamptz not null default now()
);

create or replace function public.refresh_order_status_counts()
returns void
language plpgsql
as $$
begin
  -- Truncate + repopulate. Use a single transaction so reads see a consistent state.
  delete from public.order_status_counts;
  insert into public.order_status_counts (status, count, total_amount, last_updated)
  select
    status,
    count(*) as count,
    coalesce(sum(total_amount), 0) as total_amount,
    now() as last_updated
  from public.orders
  group by status;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Per-order summary RPC — server-side aggregation for the dashboard
--    Called by the admin orders API. Returns counts/totals across the
--    entire orders table, optionally filtered by date range.
-- ---------------------------------------------------------------------------
create or replace function public.admin_orders_summary(
  p_from timestamptz default null,
  p_to   timestamptz default null
) returns jsonb
language plpgsql
stable
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total',                  count(*),
    'pending',                count(*) filter (where status = 'pending'),
    'queued',                 count(*) filter (where status = 'queued'),
    'created',                count(*) filter (where status = 'created'),
    'in_progress',            count(*) filter (where status = 'in_progress'),
    'under_review',           count(*) filter (where status = 'under_review'),
    'revision_requested',     count(*) filter (where status = 'revision_requested'),
    'completed',              count(*) filter (where status = 'completed'),
    'released',               count(*) filter (where status = 'released'),
    'cancelled',              count(*) filter (where status = 'cancelled'),
    'refunded',               count(*) filter (where status = 'refunded'),
    'escrow_held_count',      count(*) filter (where escrow_status = 'held'),
    'escrow_held_total',      coalesce(sum(total_amount) filter (where escrow_status = 'held'), 0),
    'escrow_released_count',  count(*) filter (where escrow_status = 'released'),
    'escrow_released_total',  coalesce(sum(total_amount) filter (where escrow_status = 'released'), 0),
    'escrow_refunded_count',  count(*) filter (where escrow_status = 'refunded'),
    'payout_pending_count',   count(*) filter (where payout_status = 'pending'),
    'payout_transferred_count', count(*) filter (where payout_status = 'transferred'),
    'payout_failed_count',    count(*) filter (where payout_status = 'failed'),
    'late_count', count(*) filter (
      where delivery_deadline is not null
        and delivery_deadline < now()
        and status not in ('completed', 'released', 'cancelled', 'refunded')
    ),
    'unassigned_count', count(*) filter (
      where consultant_id is null
        and attorney_id is null
        and status not in ('cancelled', 'refunded')
    ),
    'total_gross',            coalesce(sum(total_amount), 0),
    'total_fee',              coalesce(sum(platform_fee_amount), 0),
    'total_payout',           coalesce(sum(consultant_payout_amount), 0)
  )
  into result
  from public.orders
  where (p_from is null or created_at >= p_from)
    and (p_to   is null or created_at <= p_to);

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Schema cache reload
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
