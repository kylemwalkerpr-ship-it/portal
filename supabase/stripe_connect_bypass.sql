-- ══════════════════════════════════════════════════════════════════════════════
-- DEPRECATED — Stripe Connect is no longer in use. The columns and indexes
-- below were created by an earlier migration. They are left in the database
-- for backward compatibility. This file is kept for reference only. Do NOT
-- run it on a fresh database.
-- ══════════════════════════════════════════════════════════════════════════════
/*
-- Adds an admin-controlled bypass for the Stripe Connect onboarding gate.
-- When `stripe_bypass = true`, the consultant or attorney is treated as
-- onboarded for the purpose of:
--   • Letting attorneys send paid offers
--   • Letting consultants be assigned paid orders without a connected account
-- It does NOT override Stripe transfer behavior — a connected account is still
-- required for an actual payout, but the bypass lets ops onboard a panelist
-- and let them work while the Connect account is being verified.

alter table consultants
  add column if not exists stripe_bypass boolean not null default false;

alter table attorneys
  add column if not exists stripe_bypass boolean not null default false;

create index if not exists consultants_stripe_bypass_idx on consultants (stripe_bypass);
create index if not exists attorneys_stripe_bypass_idx on attorneys (stripe_bypass);
*/
