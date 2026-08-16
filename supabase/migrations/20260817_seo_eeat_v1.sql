-- ============================================================================
-- 20260817_seo_eeat_v1.sql
--
-- E-E-A-T / TRUST MODULE (Subsystem I)
--
-- Per-page typed columns on content_jobs for the E-E-A-T/Trust LLM judgment
-- module (lib/seoFactory/eeatTrust.ts). This is a SEPARATE subsystem from the
-- citation share-of-voice, Content Quality, and Semantic/NLP modules, so it
-- gets its own typed columns (never reused / overloaded).
--
-- The extra columns beyond the spec-named set (composite score, author
-- expertise score, model_used, scored_at) are required by the wiring (the
-- composite feeds scoreMaster) and the validation checklist (truthful model
-- provenance + a TTL to skip re-scoring).
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS eeat_trust_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS eeat_author_expertise_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS eeat_missing_signals TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eeat_top_competitor TEXT,
  ADD COLUMN IF NOT EXISTS eeat_top_competitor_trust NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS eeat_confidence_avg NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS eeat_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS eeat_model_used TEXT,
  ADD COLUMN IF NOT EXISTS eeat_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_jobs_eeat_scored
  ON public.content_jobs (eeat_scored_at);

COMMENT ON COLUMN public.content_jobs.eeat_trust_score IS
  '0-1 confidence-weighted composite from the E-E-A-T/Trust LLM module (Subsystem I).';
COMMENT ON COLUMN public.content_jobs.eeat_author_expertise_score IS
  '0-1 author expertise quality (taxonomy item 532) — the headline Expertise signal.';
COMMENT ON COLUMN public.content_jobs.eeat_missing_signals IS
  'Trust signals competitors demonstrate that the page lacks (from trust_gap_summary).';
COMMENT ON COLUMN public.content_jobs.eeat_top_competitor IS
  'Most trustworthy competitor URL identified by the E-E-A-T module.';
COMMENT ON COLUMN public.content_jobs.eeat_top_competitor_trust IS
  '0-1 overall trust score of the top competitor (or null if unknown).';
COMMENT ON COLUMN public.content_jobs.eeat_confidence_avg IS
  '0-1 average confidence across the scored E-E-A-T variables.';
COMMENT ON COLUMN public.content_jobs.eeat_flags IS
  'E-E-A-T flags: malformed_json | low_trust | misinformation_risk | missing_disclaimer | engine_error:* | …';
COMMENT ON COLUMN public.content_jobs.eeat_model_used IS
  'Actual provider:model that produced the E-E-A-T judgment (provenance).';
