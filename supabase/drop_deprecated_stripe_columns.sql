-- ══════════════════════════════════════════════════════════════════════════════
-- drop_deprecated_stripe_columns.sql
--
-- Drops deprecated Stripe-specific columns that were part of the old Stripe
-- Connect integration and Stripe payment link catalogue. These columns have
-- been superseded by the canonical_ledger + wallet payment flow and the
-- current escrow system.
--
-- Idempotent — safe to re-run. Uses DROP COLUMN IF EXISTS throughout.
--
-- Tables affected:
--   services       — 6 columns (stripe_product_id, stripe_price_id_*,
--                     stripe_payment_link_*, stripe_payment_link_url)
--   consultants    — 2 columns + 1 index
--   attorneys      — 2 columns + 1 index
--   attorney_offers — 1 column (attorney_stripe_account_id)
--
-- Columns NOT dropped (still in active use):
--   orders.stripe_payment_intent_id   — used by gig/payment flow
--   orders.stripe_transfer_id         — used by escrow system
--   consultants/attorneys.stripe_bypass — admin-controlled bypass flag
--   consultant_offers/attorney_offers.stripe_session_id — used by inquiries
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── services table (payment link catalogue) ───────────────────────────────
alter table public.services
  drop column if exists stripe_product_id,
  drop column if exists stripe_price_id_usd,
  drop column if exists stripe_payment_link_usd,
  drop column if exists stripe_price_id_cad,
  drop column if exists stripe_payment_link_cad,
  drop column if exists stripe_payment_link_url;

-- ─── consultants table (Stripe Connect) ─────────────────────────────────────
drop index if exists public.consultants_stripe_account_id_idx;

alter table public.consultants
  drop column if exists stripe_account_id,
  drop column if exists stripe_onboarding_complete;

-- ─── attorneys table (Stripe Connect) ───────────────────────────────────────
drop index if exists public.attorneys_stripe_account_idx;

alter table public.attorneys
  drop column if exists stripe_account_id,
  drop column if exists stripe_onboarding_complete;

-- ─── attorney_offers table (Stripe Connect reference) ───────────────────────
alter table public.attorney_offers
  drop column if exists attorney_stripe_account_id;

-- Confirmation notice
do $$
begin
  raise notice 'Deprecated Stripe columns dropped successfully.';
end $$;
