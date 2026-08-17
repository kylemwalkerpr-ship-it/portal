-- ============================================================================
-- 20260817_seo_competitive_v1.sql
--
-- COMPETITIVE GAP MODULE (Subsystem O — SERP / Competitive Intelligence)
--
-- Per-page typed columns on content_jobs for the Competitive Gap LLM judgment
-- module (lib/seoFactory/competitiveGap.ts). This is a SEPARATE subsystem from
-- the citation share-of-voice, Content Quality, Semantic/NLP and E-E-A-T
-- modules, so it gets its own typed columns (never reused / overloaded).
--
-- The extra columns beyond the spec-named set (composite score, overall
-- position, model_used, scored_at) are required by the wiring (the composite
-- feeds scoreMaster) and the validation checklist (truthful model provenance
-- + a TTL to skip re-scoring).
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS competitive_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS competitive_overall_position NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS competitive_missing_edges TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitive_top_competitor TEXT,
  ADD COLUMN IF NOT EXISTS competitive_top_competitor_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS competitive_confidence_avg NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS competitive_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS competitive_model_used TEXT,
  ADD COLUMN IF NOT EXISTS competitive_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_jobs_competitive_scored
  ON public.content_jobs (competitive_scored_at);

COMMENT ON COLUMN public.content_jobs.competitive_score IS
  '0-1 confidence-weighted composite from the Competitive Gap LLM module (Subsystem O).';
COMMENT ON COLUMN public.content_jobs.competitive_overall_position IS
  '0-1 overall competitive position vs the SERP set (taxonomy item 762).';
COMMENT ON COLUMN public.content_jobs.competitive_missing_edges IS
  'Competitive edges the SERP leaders hold that the page lacks (from competitive_gap_summary).';
COMMENT ON COLUMN public.content_jobs.competitive_top_competitor IS
  'Strongest competitor URL identified by the Competitive Gap module.';
COMMENT ON COLUMN public.content_jobs.competitive_top_competitor_score IS
  '0-1 overall competitive standing of the top competitor (or null if unknown).';
COMMENT ON COLUMN public.content_jobs.competitive_confidence_avg IS
  '0-1 average confidence across the scored Competitive Gap variables.';
COMMENT ON COLUMN public.content_jobs.competitive_flags IS
  'Competitive Gap flags: malformed_json | lagging_competition | no_competitors_scored | engine_error:* | …';
COMMENT ON COLUMN public.content_jobs.competitive_model_used IS
  'Actual provider:model that produced the Competitive Gap judgment (provenance).';
