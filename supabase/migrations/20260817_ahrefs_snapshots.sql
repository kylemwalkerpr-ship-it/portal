-- Ahrefs Site Audit snapshots ingested by the Master Engine.
CREATE TABLE IF NOT EXISTS public.seo_ahrefs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  crawl_date TEXT,
  date_compared TEXT,
  health_score NUMERIC,
  health_score_compared NUMERIC,
  cs_open INTEGER NOT NULL DEFAULT 0,
  total_open INTEGER NOT NULL DEFAULT 0,
  issues JSONB NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_seo_ahrefs_fetched ON public.seo_ahrefs_snapshots (fetched_at DESC);

ALTER TABLE public.seo_ahrefs_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Engine ahrefs full access" ON public.seo_ahrefs_snapshots;
CREATE POLICY "Engine ahrefs full access" ON public.seo_ahrefs_snapshots FOR ALL USING (true) WITH CHECK (true);
