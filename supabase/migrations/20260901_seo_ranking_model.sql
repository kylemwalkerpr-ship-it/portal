-- ============================================================================
-- 20260901_seo_ranking_model.sql
--
-- SEO RANKING MODEL PERSISTENCE (seo-ranking-model-v1)
--
-- Stores model outputs and provenance ONLY — nothing here asserts that a field
-- is a search-engine ranking factor. Every row is auditable and immutable:
--   seo_ranking_scores     — composite family scores per topic/page/plan
--   seo_forecast_runs      — 30/60/90-day projections with explicit assumptions
--   seo_reward_events      — outcome ledger: shipped-page deltas → reward credit
--   seo_model_calibration  — bounded weight recalibration history (the dynamism)
--
-- Safe to re-run. Mirrors conventions in 20260813_backlink_engine.sql and
-- 20260815_seo_intelligence.sql (RLS open, NOTIFY pgrst at the end).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seo_ranking_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'topic',
  subject_key TEXT NOT NULL UNIQUE,
  topic TEXT NOT NULL,
  normalized_topic TEXT NOT NULL,
  url TEXT,
  country TEXT,
  stage TEXT,
  intent_primary TEXT,
  intent_subtype TEXT,
  families JSONB NOT NULL DEFAULT '{}'::jsonb,
  total NUMERIC(5,2) NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  forecast JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommended_actions TEXT[] NOT NULL DEFAULT '{}',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ranking_scores_model
  ON public.seo_ranking_scores (model_version, total DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_scores_topic
  ON public.seo_ranking_scores (normalized_topic, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_scores_cell
  ON public.seo_ranking_scores (stage, country, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ranking_scores_computed
  ON public.seo_ranking_scores (computed_at DESC);

ALTER TABLE public.seo_ranking_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SEO ranking scores full access" ON public.seo_ranking_scores;
CREATE POLICY "SEO ranking scores full access" ON public.seo_ranking_scores
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.seo_forecast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT NOT NULL,
  topic TEXT NOT NULL,
  subject_key TEXT NOT NULL DEFAULT '',
  horizon_days INT NOT NULL CHECK (horizon_days IN (30, 60, 90)),
  projected_position NUMERIC(6,2) NOT NULL,
  projected_impressions NUMERIC(12,0) NOT NULL DEFAULT 0,
  projected_clicks NUMERIC(12,0) NOT NULL DEFAULT 0,
  probability_top10 NUMERIC(4,3) NOT NULL DEFAULT 0,
  assumptions TEXT[] NOT NULL DEFAULT '{}',
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_runs_topic
  ON public.seo_forecast_runs (topic, horizon_days, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecast_runs_created
  ON public.seo_forecast_runs (created_at DESC);
-- Daily cron dedupe: one row per (topic, subject, horizon, day).
CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_runs_daily
  ON public.seo_forecast_runs (topic, subject_key, horizon_days, run_date);

ALTER TABLE public.seo_forecast_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SEO forecast runs full access" ON public.seo_forecast_runs;
CREATE POLICY "SEO forecast runs full access" ON public.seo_forecast_runs
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.seo_reward_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT NOT NULL,
  page_url TEXT NOT NULL,
  topic TEXT,
  action TEXT NOT NULL,
  delta_impressions NUMERIC(12,0) NOT NULL DEFAULT 0,
  delta_clicks NUMERIC(12,0) NOT NULL DEFAULT 0,
  delta_position NUMERIC(6,2) NOT NULL DEFAULT 0,
  reward NUMERIC(4,3) NOT NULL DEFAULT 0,
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_events_page
  ON public.seo_reward_events (page_url, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_events_action
  ON public.seo_reward_events (action, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_events_observed
  ON public.seo_reward_events (observed_at DESC);

ALTER TABLE public.seo_reward_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SEO reward events full access" ON public.seo_reward_events;
CREATE POLICY "SEO reward events full access" ON public.seo_reward_events
  FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.seo_model_calibration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version TEXT NOT NULL,
  weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  events_count INT NOT NULL DEFAULT 0,
  note TEXT,
  recalibrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_calibration_model
  ON public.seo_model_calibration (model_version, recalibrated_at DESC);

ALTER TABLE public.seo_model_calibration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SEO model calibration full access" ON public.seo_model_calibration;
CREATE POLICY "SEO model calibration full access" ON public.seo_model_calibration
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.seo_ranking_scores IS
  'Composite ranking model outputs per topic/page/plan. Provenance only — never presented as a Google ranking factor.';
COMMENT ON TABLE public.seo_forecast_runs IS
  '30/60/90-day projections with explicit assumptions; projections are internal decision support.';
COMMENT ON TABLE public.seo_reward_events IS
  'Outcome ledger: observed deltas from shipped pages credited to action families for model recalibration.';
COMMENT ON TABLE public.seo_model_calibration IS
  'Immutable history of bounded weight recalibration — the audit trail of the model dynamism.';

NOTIFY pgrst, 'reload schema';
