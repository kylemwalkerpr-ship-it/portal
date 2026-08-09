-- SEO intelligence nexus — evidence lineage, predictive snapshots, and queue lineage.
-- This stores model outputs and provenance; it does not assert that any field is
-- a search-engine ranking factor. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.seo_intelligence_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key TEXT NOT NULL UNIQUE,
  model_version TEXT NOT NULL,
  topic TEXT NOT NULL,
  normalized_topic TEXT NOT NULL,
  play TEXT NOT NULL,
  opportunity_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0,
  freshness NUMERIC(4,3) NOT NULL DEFAULT 0,
  rankability NUMERIC(4,3) NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasons TEXT[] NOT NULL DEFAULT '{}',
  regeneration_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_intelligence_snapshot_topic
  ON public.seo_intelligence_snapshots (snapshot_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_intelligence_topic
  ON public.seo_intelligence_snapshots (normalized_topic, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_intelligence_eligible
  ON public.seo_intelligence_snapshots (regeneration_eligible, opportunity_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_intelligence_created
  ON public.seo_intelligence_snapshots (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seo_intelligence_last_seen
  ON public.seo_intelligence_snapshots (last_seen_at DESC);

ALTER TABLE public.seo_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "SEO intelligence full access" ON public.seo_intelligence_snapshots;
CREATE POLICY "SEO intelligence full access" ON public.seo_intelligence_snapshots
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS source_job_id UUID REFERENCES public.content_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lineage JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regeneration_reason TEXT,
  ADD COLUMN IF NOT EXISTS regeneration_mode TEXT;

CREATE INDEX IF NOT EXISTS idx_content_jobs_source_lineage
  ON public.content_jobs (source_job_id, created_at DESC)
  WHERE source_job_id IS NOT NULL;

COMMENT ON COLUMN public.content_jobs.lineage IS
  'Evidence and queue lineage snapshot: model version, source job, signal ids, and regeneration context.';
COMMENT ON COLUMN public.content_jobs.regeneration_reason IS
  'Operator-readable reason for regeneration; never inferred as a ranking guarantee.';
COMMENT ON COLUMN public.content_jobs.regeneration_mode IS
  'new, refresh, expand, resume, or manual.';

NOTIFY pgrst, 'reload schema';
