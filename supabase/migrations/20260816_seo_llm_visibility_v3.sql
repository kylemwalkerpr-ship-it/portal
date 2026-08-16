-- ============================================================================
-- 20260816_seo_llm_visibility_v3.sql
--
-- LLM VISIBILITY AUDIT — MULTI-ENGINE MATRIX + COMPETITIVE DELTA
--
-- Upgrades the prompt-audit table so each row can carry the structured,
-- multi-engine share-of-voice matrix: per-engine breakdown (engines_json),
-- the competitive delta (who beat us per query), answer format, model
-- confidence, parser flags, and the per-query share-of-voice fraction.
--
-- Safe to re-run. Mirrors conventions in 20260810_seo_engine_v2.sql and
-- 20260902_seo_llm_fanout.sql.
-- ============================================================================

ALTER TABLE public.seo_llm_visibility
  ADD COLUMN IF NOT EXISTS competitor_domains TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS answer_format TEXT,
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS flags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS share_of_voice NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS top_competitor TEXT,
  ADD COLUMN IF NOT EXISTS competitor_share NUMERIC(4, 3),
  ADD COLUMN IF NOT EXISTS engines_json JSONB;

CREATE INDEX IF NOT EXISTS idx_seo_llm_vis_top_competitor
  ON public.seo_llm_visibility (top_competitor);

COMMENT ON COLUMN public.seo_llm_visibility.competitor_domains IS
  'Non-estate domains the answer engines cited instead of (or ahead of) the estate.';
COMMENT ON COLUMN public.seo_llm_visibility.answer_format IS
  'The answer''s dominant format: direct_answer | list | table | paragraph | definition.';
COMMENT ON COLUMN public.seo_llm_visibility.confidence IS
  '0-1 model self-reported confidence for the answer (evidence guard).';
COMMENT ON COLUMN public.seo_llm_visibility.flags IS
  'Parser/evidence flags: malformed_json, engine_error:*, no_sources, low_confidence, …';
COMMENT ON COLUMN public.seo_llm_visibility.share_of_voice IS
  '0-1 fraction of successful engines that cited the estate for this query.';
COMMENT ON COLUMN public.seo_llm_visibility.top_competitor IS
  'The non-estate domain cited by the most engines (competitive delta).';
COMMENT ON COLUMN public.seo_llm_visibility.competitor_share IS
  '0-1 fraction of engines that cited the top competitor.';
COMMENT ON COLUMN public.seo_llm_visibility.engines_json IS
  'Full per-engine breakdown of the multi-engine matrix run.';
