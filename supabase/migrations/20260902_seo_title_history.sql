-- ============================================================================
-- 20260902_seo_title_history.sql
--
-- TITLE LAB PERSISTENCE
--
-- Deterministic CTR title candidates + scores ("TitleLab",
-- lib/seoEngine/titleLab.ts) are logged here per mission/cluster so the studio
-- can compare the chosen title against the scored shortlist and never regress
-- to template-filler titles ("Updated Requirements and Guidance for 2026").
--
-- Safe to re-run. Mirrors conventions in 20260902_seo_llm_fanout.sql.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seo_title_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id TEXT,
  cluster_id TEXT,
  title TEXT NOT NULL,
  score NUMERIC,
  breakdown JSONB,
  chosen BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  impressions_at_ship BIGINT,
  clicks_at_ship BIGINT,
  ctr_after_ship NUMERIC,
  calibrated BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_seo_title_history_mission
  ON public.seo_title_history (mission_id, created_at DESC);

COMMENT ON TABLE public.seo_title_history IS
  'Scored CTR title candidates produced by lib/seoEngine/titleLab.ts (advisory, deterministic). ctr_after_ship feeds recalibrateTitleScorer.';

COMMENT ON COLUMN public.seo_title_history.ctr_after_ship IS
  'Measured CTR after the page shipped (GSC-match backfill); the daily cron recalibrates the TitleLab bucket weights from rows carrying this value.';