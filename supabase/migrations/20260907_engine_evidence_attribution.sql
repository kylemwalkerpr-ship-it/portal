-- ============================================================================
-- 20260907_engine_evidence_attribution.sql
--
-- Minimal additive columns for the 2026-09-07 evidence/attribution gaps:
--
--   1. seo_gate_runs.mandatory                 — authoritative YMYL-critical
--      mandatory-evidence verdict (applicable/met/missing), so ship.ts can
--      hold on ONE missing required item and gate runs surface the reason.
--   2. seo_reward_events.{query,window_start,window_end,baseline_clicks,
--      improvement_credited,observation_label}
--      — stable per-(page,query,window) cron attribution. The dedupe_key still
--      encodes the observation identity (never the run date); these columns
--      make the window + baseline auditable without decoding the key.
--
-- Additive + idempotent; mirrors 20260903_seo_engine_integrity.sql.
-- ============================================================================

ALTER TABLE public.seo_gate_runs
  ADD COLUMN IF NOT EXISTS mandatory JSONB DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.seo_gate_runs.mandatory IS
  'Authoritative mandatory-evidence verdict {applicable, met, missing[]} for YMYL-critical drafts.';

ALTER TABLE public.seo_reward_events
  ADD COLUMN IF NOT EXISTS query TEXT;
ALTER TABLE public.seo_reward_events
  ADD COLUMN IF NOT EXISTS window_start DATE;
ALTER TABLE public.seo_reward_events
  ADD COLUMN IF NOT EXISTS window_end DATE;
ALTER TABLE public.seo_reward_events
  ADD COLUMN IF NOT EXISTS baseline_clicks NUMERIC(12,0);
ALTER TABLE public.seo_reward_events
  ADD COLUMN IF NOT EXISTS improvement_credited BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.seo_reward_events
  ADD COLUMN IF NOT EXISTS observation_label TEXT;

CREATE INDEX IF NOT EXISTS idx_reward_events_window
  ON public.seo_reward_events (page_url, query, window_start, window_end);

COMMENT ON COLUMN public.seo_reward_events.query IS
  'Exact query of the page+query observation (null = non-GSC credit).';
COMMENT ON COLUMN public.seo_reward_events.window_start IS
  'Start of the explicit, disjoint observation window this reward measures.';
COMMENT ON COLUMN public.seo_reward_events.window_end IS
  'End of the explicit observation window this reward measures.';
COMMENT ON COLUMN public.seo_reward_events.baseline_clicks IS
  'Clicks from the prior disjoint window used as the improvement baseline (null = none measured).';
COMMENT ON COLUMN public.seo_reward_events.improvement_credited IS
  'True only when a baseline existed and the measured change was positive.';
COMMENT ON COLUMN public.seo_reward_events.observation_label IS
  'Stable action identity for the observation without inventing gains.';

NOTIFY pgrst, 'reload schema';