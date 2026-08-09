-- ============================================================================
-- 20260902_seo_llm_fanout.sql
--
-- LLM VISIBILITY FAN-OUT AUDIT BANK
--
-- Extends seo_llm_visibility with cluster provenance so the audit bank can
-- cover fan-out sub-queries per top cluster (FAQ questions + GSC related terms
-- + the primary term) and the results can be attributed back to the cluster
-- that produced them. Those measured citations feed the ranking model's aeoGeo
-- family (evidence-led, never guessed).
--
-- Safe to re-run. Mirrors conventions in 20260810_seo_engine_v2.sql.
-- ============================================================================

ALTER TABLE public.seo_llm_visibility
  ADD COLUMN IF NOT EXISTS fan_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cluster_id TEXT,
  ADD COLUMN IF NOT EXISTS source_field TEXT; -- 'primary' | 'faq' | 'related'

CREATE INDEX IF NOT EXISTS idx_seo_llm_vis_fanout
  ON public.seo_llm_visibility (fan_out, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_llm_vis_cluster
  ON public.seo_llm_visibility (cluster_id, created_at DESC);

COMMENT ON COLUMN public.seo_llm_visibility.fan_out IS
  'True when this audit is a fan-out sub-query from a cluster plan (not a top-level estate query).';
COMMENT ON COLUMN public.seo_llm_visibility.cluster_id IS
  'Cluster plan id that generated this fan-out audit (for aeoGeo family attribution).';
COMMENT ON COLUMN public.seo_llm_visibility.source_field IS
  'Which part of the cluster produced the query: primary | faq | related.';
