-- Adds the missing `progress` column to `orders`.
--
-- The app was built around a stored progress percentage: the attorney/consultant
-- progress control (PATCH /api/attorney/orders/[id]/progress) writes it, and the
-- student/attorney/consultant dashboards SELECT it (with a status-based fallback
-- when unset). The column was never present in the table, so every explicit
-- SELECT naming `progress` 500s with "column orders.progress does not exist".
-- (The earlier delivery_deadline alias fix unmasked this — PostgREST reports one
-- missing column at a time.)
--
-- Nullable integer, no default: NULL means "progress not explicitly set" so the
-- application's status-based fallback still applies for untouched orders. The
-- write path validates 0–100.
--
-- Idempotent / safe to re-run.

alter table public.orders
  add column if not exists progress integer;
