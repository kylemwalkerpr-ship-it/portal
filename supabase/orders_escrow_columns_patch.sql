-- =============================================================================
-- orders_escrow_columns_patch.sql
-- Ensures every escrow column the admin escrow API expects exists on
-- public.orders. Safe to re-run.
-- =============================================================================

alter table public.orders
  add column if not exists escrow_amount               numeric(12,2) default 0,
  add column if not exists escrow_released_amount      numeric(12,2) default 0,
  add column if not exists escrow_refunded_amount      numeric(12,2) default 0,
  add column if not exists auto_release_eligible_at    timestamptz,
  add column if not exists escrow_disputed_at          timestamptz,
  add column if not exists escrow_dispute_reason       text,
  add column if not exists escrow_frozen_at            timestamptz,
  add column if not exists escrow_frozen_reason        text;

-- Backfill escrow_amount = total_amount for held orders that lack a value
update public.orders
   set escrow_amount = coalesce(total_amount, 0)
 where (escrow_amount is null or escrow_amount = 0)
   and escrow_status = 'held';

create index if not exists orders_auto_release_idx
  on public.orders (auto_release_eligible_at)
  where escrow_status = 'held' and auto_release_eligible_at is not null;

notify pgrst, 'reload schema';
