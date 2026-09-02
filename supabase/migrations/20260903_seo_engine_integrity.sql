-- ============================================================================
-- 20260903_seo_engine_integrity.sql
--
-- Idempotency + integrity hardening from the 2026-09-02 engine audit:
--   1. seo_reward_events.dedupe_key — DB-level idempotency so daily/weekly
--      reward passes can never double-credit the same observed outcome.
--   2. seo_cluster_plans.status CHECK widened with 'shipped' / 'rejected' —
--      the planner writes those lifecycle states but the original CHECK only
--      allowed planned/briefed/launched/done/skipped, so every lifecycle
--      update silently failed inside best-effort try/catch blocks.
--   3. seo_interlinks.updated_at — the engine reads/searches this column
--      (loadPersistedCell) but no migration ever created it; the select
--      errored and the persisted-graph inspector returned empty forever.
--
-- Idempotent: safe to re-run. Mirrors conventions in the other engine
-- migrations (open RLS, NOTIFY pgrst at the end).
-- ============================================================================

-- ── 1. Reward-event idempotency ─────────────────────────────────────────────
ALTER TABLE public.seo_reward_events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_events_dedupe
  ON public.seo_reward_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ── 2. Cluster-plan lifecycle statuses ──────────────────────────────────────
-- The auto-generated default name is `seo_cluster_plans_status_check`; drop it
-- if present, then install a named constraint that includes the states the
-- planner actually writes ('shipped', 'rejected').
ALTER TABLE public.seo_cluster_plans DROP CONSTRAINT IF EXISTS seo_cluster_plans_status_check;
ALTER TABLE public.seo_cluster_plans
  ADD CONSTRAINT seo_cluster_plans_status_check
  CHECK (status IN ('planned', 'briefed', 'launched', 'done', 'skipped', 'shipped', 'rejected'));

-- ── 3. Interlink updated_at (read by loadPersistedCell) ─────────────────────
ALTER TABLE public.seo_interlinks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_seo_interlinks_updated_at ON public.seo_interlinks;
CREATE OR REPLACE FUNCTION public.set_seo_interlinks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER set_seo_interlinks_updated_at
  BEFORE UPDATE ON public.seo_interlinks
  FOR EACH ROW EXECUTE FUNCTION public.set_seo_interlinks_updated_at();

NOTIFY pgrst, 'reload schema';