-- Backlink provider (DataForSEO) snapshots for the Master SEO Engine links
-- subsystem. Safe to re-run. backlinks_json is forever nullable — rows without
-- a snapshot simply keep the l_* measurement slots dark.
ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS backlinks_json JSONB,
  ADD COLUMN IF NOT EXISTS backlinks_fetched_at TIMESTAMPTZ;
COMMENT ON COLUMN public.content_jobs.backlinks_json IS 'DataForSEO per-URL backlink snapshot (summary + sampled links) consumed by the Master SEO Engine';
COMMENT ON COLUMN public.content_jobs.backlinks_fetched_at IS 'Last time the backlink snapshot was fetched from the provider';
