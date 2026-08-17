-- ============================================================================
-- 20260817_seo_local_v1.sql
--
-- LOCAL SEO MODULE (Subsystem J — Local SEO Signals)
--
-- Per-page typed columns on content_jobs for the Local SEO LLM judgment
-- module (lib/seoFactory/localSeo.ts). This is a SEPARATE subsystem from the
-- citation share-of-voice, Content Quality, Semantic/NLP, E-E-A-T and
-- Competitive Gap modules, so it gets its own typed columns (never reused /
-- overloaded).
--
-- The extra columns beyond the spec-named set (GBP score, NAP score,
-- model_used, scored_at) are required by the wiring (the composite feeds
-- scoreMaster via e_local_llm) and the validation checklist (truthful model
-- provenance + a TTL to skip re-scoring).
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS local_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS local_gbp_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS local_nap_consistency_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS local_missing_signals TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS local_top_competitor TEXT,
  ADD COLUMN IF NOT EXISTS local_top_competitor_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS local_confidence_avg NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS local_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS local_model_used TEXT,
  ADD COLUMN IF NOT EXISTS local_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_jobs_local_scored
  ON public.content_jobs (local_scored_at);

COMMENT ON COLUMN public.content_jobs.local_score IS
  '0-1 confidence-weighted composite from the Local SEO LLM module (Subsystem J).';
COMMENT ON COLUMN public.content_jobs.local_gbp_score IS
  '0-1 Google Business Profile completeness from the Local SEO LLM module (taxonomy item 576).';
COMMENT ON COLUMN public.content_jobs.local_nap_consistency_score IS
  '0-1 Name/Address/Phone consistency from the Local SEO LLM module (taxonomy item 584).';
COMMENT ON COLUMN public.content_jobs.local_missing_signals IS
  'Local signals competitors demonstrate that the page lacks (from local_gap_summary).';
COMMENT ON COLUMN public.content_jobs.local_top_competitor IS
  'Strongest local competitor URL identified by the Local SEO module.';
COMMENT ON COLUMN public.content_jobs.local_top_competitor_score IS
  '0-1 overall local-visibility standing of the top competitor (or null if unknown).';
COMMENT ON COLUMN public.content_jobs.local_confidence_avg IS
  '0-1 average confidence across the scored Local SEO variables.';
COMMENT ON COLUMN public.content_jobs.local_flags IS
  'Local SEO flags: malformed_json | weak_local_presence | missing_contact_info | engine_error:* | …';
COMMENT ON COLUMN public.content_jobs.local_model_used IS
  'Actual provider:model that produced the Local SEO judgment (provenance).';
