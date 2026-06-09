-- orders_status_reconcile.sql
--
-- ROOT CAUSE: order creation has been failing 100% of the time (the `orders`
-- table has 0 rows, ever). Two problems on the table:
--
--   1. Two conflicting status CHECK constraints from two different order models
--      coexisted — `orders_status_check` and `orders_status_fiverr_check` — whose
--      allowed value sets barely overlapped (only 'cancelled' passed both). So no
--      order with a real lifecycle status ('created', 'pending', …) could ever be
--      inserted, and createPaidOrder threw on every checkout (offers, gigs,
--      template fill-to-pay).
--   2. The `payment_method` column the checkout writes does not exist.
--
-- This migration reconciles the table to the app's canonical order vocabulary
-- (see STATUS_TO_COLUMN in components/design/admin-orders.jsx) and adds the
-- missing column. Idempotent — safe to run more than once.

-- 1. Drop the legacy / conflicting status constraints.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_fiverr_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 2. Re-add a single status CHECK covering every status the app reads or writes.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'pending', 'queued', 'created', 'new',
    'active', 'in_progress', 'working',
    'delivered', 'awaiting_client', 'client_review',
    'revision_requested', 'under_review', 'in_review',
    'approved', 'completed', 'released', 'closed', 'paid',
    'refunded', 'cancelled', 'canceled',
    'disputed', 'chargeback', 'frozen'
  ));

-- 3. Add the missing payment_method column the checkout writes.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
