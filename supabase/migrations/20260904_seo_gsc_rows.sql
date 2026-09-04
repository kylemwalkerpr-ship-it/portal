-- Persist GSC Search Analytics as query × page rows (Phase 1 $0 SEO engine).
-- Unique window: one row per property + query + page + date range.

CREATE TABLE IF NOT EXISTS public.seo_gsc_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_url text NOT NULL,
  query text NOT NULL,
  page text NOT NULL,
  clicks integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  position numeric NOT NULL DEFAULT 0,
  country text NULL,
  device text NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seo_gsc_rows_unique_window UNIQUE (site_url, query, page, start_date, end_date)
);

CREATE INDEX IF NOT EXISTS seo_gsc_rows_impressions
  ON public.seo_gsc_rows (site_url, impressions DESC);

ALTER TABLE public.seo_gsc_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seo_gsc_rows full access" ON public.seo_gsc_rows;
CREATE POLICY "seo_gsc_rows full access" ON public.seo_gsc_rows
  FOR ALL
  USING (true)
  WITH CHECK (true);
