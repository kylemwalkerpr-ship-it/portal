-- ============================================================================
-- 20260817_seo_content_semantic_v1.sql
--
-- CONTENT QUALITY (Subsystem A) + SEMANTIC/NLP (Subsystem H) MODULES
--
-- Per-page typed columns on content_jobs for the two LLM judgment modules.
-- These are SEPARATE subsystems from the citation share-of-voice module, so
-- they get their own typed columns (never reused / overloaded into
-- seo_llm_visibility.engines_json).
--
-- The spec-named columns are preserved verbatim; the extra columns
-- (composite score, top-competitor depth/coverage, model_used, scored_at)
-- are required by the wiring (a composite feeds scoreMaster) and the
-- validation checklist (truthful model provenance + a TTL to skip re-scoring).
--
-- Safe to re-run.
-- ============================================================================

ALTER TABLE public.content_jobs
  -- ── Content Quality (Subsystem A) ───────────────────────────────────────
  ADD COLUMN IF NOT EXISTS content_quality_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS content_depth_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS content_gap_missing_subtopics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_top_competitor TEXT,
  ADD COLUMN IF NOT EXISTS content_top_competitor_depth NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS content_confidence_avg NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS content_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_model_used TEXT,
  ADD COLUMN IF NOT EXISTS content_scored_at TIMESTAMPTZ,
  -- ── Semantic/NLP (Subsystem H) ──────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS semantic_coverage_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS semantic_topical_breadth_score NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS semantic_missing_entities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS semantic_top_competitor TEXT,
  ADD COLUMN IF NOT EXISTS semantic_top_competitor_coverage NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS semantic_confidence_avg NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS semantic_flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS semantic_model_used TEXT,
  ADD COLUMN IF NOT EXISTS semantic_scored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_content_jobs_content_scored
  ON public.content_jobs (content_scored_at);
CREATE INDEX IF NOT EXISTS idx_content_jobs_semantic_scored
  ON public.content_jobs (semantic_scored_at);

COMMENT ON COLUMN public.content_jobs.content_quality_score IS
  '0-1 confidence-weighted composite from the Content Quality LLM module (Subsystem A).';
COMMENT ON COLUMN public.content_jobs.content_depth_score IS
  '0-1 content depth & comprehensiveness vs top competitors (taxonomy item 24).';
COMMENT ON COLUMN public.content_jobs.content_gap_missing_subtopics IS
  'Subtopics top competitors cover that the page lacks (from content_gap_summary).';
COMMENT ON COLUMN public.content_jobs.content_top_competitor IS
  'Strongest competitor URL identified by the Content Quality module.';
COMMENT ON COLUMN public.content_jobs.content_confidence_avg IS
  '0-1 average confidence across the scored Content Quality variables.';
COMMENT ON COLUMN public.content_jobs.content_flags IS
  'Content Quality flags: malformed_json | thin_content_risk | cannibalization_risk | engine_error:* | …';
COMMENT ON COLUMN public.content_jobs.content_model_used IS
  'Actual provider:model that produced the Content Quality judgment (provenance).';
COMMENT ON COLUMN public.content_jobs.semantic_coverage_score IS
  '0-1 confidence-weighted composite from the Semantic/NLP LLM module (Subsystem H).';
COMMENT ON COLUMN public.content_jobs.semantic_topical_breadth_score IS
  '0-1 topical authority breadth (taxonomy item 466).';
COMMENT ON COLUMN public.content_jobs.semantic_missing_entities IS
  'Entities competitors cover that the page lacks (from entity_gap_summary).';
COMMENT ON COLUMN public.content_jobs.semantic_confidence_avg IS
  '0-1 average confidence across the scored Semantic/NLP variables.';
COMMENT ON COLUMN public.content_jobs.semantic_flags IS
  'Semantic/NLP flags: malformed_json | low_entity_coverage | text_only_judgment | …';
COMMENT ON COLUMN public.content_jobs.semantic_model_used IS
  'Actual provider:model that produced the Semantic/NLP judgment (provenance).';
