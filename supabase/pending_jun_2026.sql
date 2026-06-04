-- Consolidated pending migrations as of 2026-06-04.
-- Idempotent — safe to re-run.
--
-- Covers the two agent-batched features that were merged without their DDL:
--   * Country-of-origin tracking (commit e9c7edd)
--   * Loyalty wallet ledger      (commit 08425b2)
--
-- All other recent admin work (tickets refactor, order kanban, analytics
-- schema fixes, financials, drawer enrichment, template downloads) uses
-- pre-existing columns and self-heals on absence — no DDL needed.

-- ── Country-of-origin tracking ────────────────────────────────────────────────
-- portalAuth.ts already self-heals on missing columns, so the app never 500s
-- before this runs. Once these land, country detection persists across sessions
-- and powers the admin Users tab country filter + sort.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country_code  text,
  ADD COLUMN IF NOT EXISTS country_source text;

CREATE INDEX IF NOT EXISTS profiles_country_code_idx
  ON public.profiles (country_code)
  WHERE country_code IS NOT NULL;

COMMENT ON COLUMN public.profiles.country_code   IS 'ISO-3166-1 alpha-2 country of origin (e.g. KE, US, CA). Populated by IP detection on first authed call or by the profile settings picker.';
COMMENT ON COLUMN public.profiles.country_source IS 'How country_code was set: ''ip'' (cf-ipcountry backfill) or ''user'' (profile picker).';

-- ── Loyalty wallet ledger indexes ─────────────────────────────────────────────
-- loyaltyWallet.ts aggregates wallet_transactions by metadata->>'kind' and
-- orders by client_id+status. Both tables are unindexed for these access paths
-- and the loyalty UI currently does a full scan per drawer open. These two
-- indexes turn that into an index range scan.
--
-- The wallet index is partial (WHERE clause) so it only stores loyalty_credit
-- rows; cheap to maintain even at high transaction volume.

CREATE INDEX IF NOT EXISTS wallet_tx_loyalty_idx
  ON public.wallet_transactions ((metadata->>'kind'))
  WHERE metadata->>'kind' = 'loyalty_credit';

CREATE INDEX IF NOT EXISTS orders_client_status_total_idx
  ON public.orders (client_id, status);
