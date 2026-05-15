-- =============================================================================
-- orders_currency_patch.sql
-- Adds optional billing/refund columns the student billing ledger expects.
-- Safe to re-run.
-- =============================================================================

alter table public.orders
  add column if not exists currency             text default 'usd',
  add column if not exists refund_status        text,
  add column if not exists refunded_at          timestamptz,
  add column if not exists refunded_amount      numeric(12,2) default 0,
  add column if not exists wallet_credit_amount numeric(12,2) default 0;

-- Backfill currency for existing orders
update public.orders set currency = 'usd' where currency is null;

notify pgrst, 'reload schema';
