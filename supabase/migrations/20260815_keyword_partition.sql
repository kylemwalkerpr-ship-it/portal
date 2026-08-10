-- Keyword partition: short vs long-tail, ≥5 short + ≥4 long-tail, deterministic from related_terms.
-- All columns additive so existing rows remain readable and the migration is reversible.

-- ── seo_cluster_plans carries the partition so the planner can assert coverage ─────────
ALTER TABLE public.seo_cluster_plans
  ADD COLUMN IF NOT EXISTS short_keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS long_tail_keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keyword_partition_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS keyword_partition_source TEXT DEFAULT 'word_count_v1';

COMMENT ON COLUMN public.seo_cluster_plans.short_keywords
  IS 'Head terms (<=3 words) sliced from related_terms. Required minimum: 5 per plan.';
COMMENT ON COLUMN public.seo_cluster_plans.long_tail_keywords
  IS 'Long-tail terms (>=4 words) sliced from related_terms. Required minimum: 4 per plan.';
COMMENT ON COLUMN public.seo_cluster_plans.keyword_partition_source
  IS 'Version of the partitioner used (e.g. word_count_v1, model_v1).';

CREATE INDEX IF NOT EXISTS seo_cluster_plans_partition_generated_at_idx
  ON public.seo_cluster_plans (keyword_partition_generated_at DESC NULLS LAST);

-- ── content_jobs carries the per-draft required coverage so the gate can block ships ──
ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS required_short_keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS required_long_tail_keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS keyword_coverage JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.content_jobs.required_short_keywords
  IS 'Snapshot of plan.short_keywords persisted at content-job creation. Gate verifies each is used at least once.';
COMMENT ON COLUMN public.content_jobs.required_long_tail_keywords
  IS 'Snapshot of plan.long_tail_keywords persisted at content-job creation. Gate verifies each is used at least once.';
COMMENT ON COLUMN public.content_jobs.keyword_coverage
  IS 'Per-job keyword coverage report: { short: {term: count}, longTail: {...}, density: {...} }';

CREATE INDEX IF NOT EXISTS content_jobs_required_short_keywords_gin
  ON public.content_jobs USING GIN (required_short_keywords);
CREATE INDEX IF NOT EXISTS content_jobs_required_long_tail_keywords_gin
  ON public.content_jobs USING GIN (required_long_tail_keywords);

-- ── Backfill: re-partition existing rows so the dashboard stays useful ──────────────────
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT cluster_id, related_terms
    FROM public.seo_cluster_plans
    WHERE keyword_partition_generated_at IS NULL
  LOOP
    WITH partitioned AS (
      SELECT
        array_agg(t) FILTER (WHERE array_length(string_to_array(t, ' '), 1) <= 3) AS short_kws,
        array_agg(t) FILTER (WHERE array_length(string_to_array(t, ' '), 1) >= 4) AS long_kws
      FROM unnest(rec.related_terms) AS t
      WHERE length(t) > 2
    )
    UPDATE public.seo_cluster_plans
    SET
      short_keywords = COALESCE(partitioned.short_kws, '{}'),
      long_tail_keywords = COALESCE(partitioned.long_kws, '{}'),
      keyword_partition_generated_at = now(),
      keyword_partition_source = 'word_count_v1_backfill'
    FROM partitioned
    WHERE seo_cluster_plans.cluster_id = rec.cluster_id;
  END LOOP;
END $$;
