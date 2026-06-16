-- =============================================================================
-- drop_all_stripe_columns.sql
--
-- Removes every residual Stripe column (and the stripe_bypass guard trigger +
-- function) across all tables. The platform runs entirely on NMI; no
-- application code referenced any of these columns. Applied to production
-- 2026-06-16 via the Supabase migration runner; committed here for parity on
-- fresh database provisions.
-- =============================================================================

drop trigger if exists attorneys_admin_only_stripe_bypass on public.attorneys;
drop trigger if exists consultants_admin_only_stripe_bypass on public.consultants;
drop function if exists public.prevent_non_admin_stripe_bypass_update() cascade;

alter table public.profiles                drop column if exists stripe_customer_id;
alter table public.attorneys               drop column if exists stripe_bypass;
alter table public.consultants             drop column if exists stripe_bypass;
alter table public.attorney_offers         drop column if exists stripe_session_id;
alter table public.consultant_offers       drop column if exists stripe_session_id;
alter table public.consultant_offers       drop column if exists stripe_payment_intent_id;
alter table public.gig_promotion_campaigns drop column if exists stripe_payment_intent_id;
alter table public.offers                  drop column if exists stripe_payment_intent_id;
alter table public.order_milestones        drop column if exists stripe_transfer_id;
alter table public.orders                  drop column if exists stripe_payment_intent_id;
alter table public.orders                  drop column if exists stripe_transfer_id;
alter table public.refund_ledger           drop column if exists stripe_refund_id;
alter table public.services                drop column if exists stripe_payment_link_id;

notify pgrst, 'reload schema';
