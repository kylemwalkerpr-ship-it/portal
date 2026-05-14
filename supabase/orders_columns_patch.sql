-- =============================================================================
-- orders_columns_patch.sql
-- Ensures every column the admin orders API expects exists on public.orders.
-- Safe to run multiple times — all ADD COLUMN IF NOT EXISTS.
-- Run this if you see "column orders.X does not exist" errors anywhere.
-- =============================================================================

alter table public.orders
  add column if not exists order_number             text,
  add column if not exists order_sequence           integer,
  add column if not exists escrow_status            varchar(50)  default 'held',
  add column if not exists payout_status            varchar(50)  default 'pending',
  add column if not exists platform_fee_amount      integer      default 0,
  add column if not exists consultant_payout_amount integer      default 0,
  add column if not exists stripe_payment_intent_id varchar(255),
  add column if not exists stripe_transfer_id       varchar(255),
  add column if not exists offer_id                 uuid references public.offers(id) on delete set null,
  add column if not exists attorney_id              uuid,
  add column if not exists amount_paid              integer,
  add column if not exists net_payout               integer,
  add column if not exists delivery_deadline        timestamptz,
  add column if not exists cancelled_at             timestamptz,
  add column if not exists cancelled_by             uuid references public.profiles(id) on delete set null,
  add column if not exists refunded_at              timestamptz,
  add column if not exists refunded_amount          numeric(12,2),
  add column if not exists refund_method            text check (refund_method is null or refund_method in ('original_payment','wallet')),
  add column if not exists refund_id                text,
  add column if not exists refund_status            text,
  add column if not exists revision_reason          text,
  add column if not exists status_updated_at        timestamptz  not null default now();

-- Backfill payout_status for older rows that may have been NULL
update public.orders
   set payout_status = 'pending'
 where payout_status is null;

-- Backfill escrow_status for older rows that may have been NULL
update public.orders
   set escrow_status = 'held'
 where escrow_status is null;

-- ─── Indexes the admin orders/payouts/escrow APIs rely on ──────────────────
create index if not exists orders_payout_status_idx on public.orders (payout_status);
create index if not exists orders_escrow_status_idx_simple on public.orders (escrow_status);
create index if not exists orders_status_updated_at_idx on public.orders (status_updated_at desc);

-- Force PostgREST to refresh its schema cache so the new columns are visible
notify pgrst, 'reload schema';
