-- P0-1 live verification: persisted live-check columns on content_jobs
-- Safe to re-run. live_* is forever nullable; old rows stay valid.
ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS live_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS live_status TEXT CHECK (live_status IN ('verified','noindex','fetch_failed','needs_review')),
  ADD COLUMN IF NOT EXISTS live_http_status INTEGER,
  ADD COLUMN IF NOT EXISTS live_word_count INTEGER,
  ADD COLUMN IF NOT EXISTS live_audit_score INTEGER,
  ADD COLUMN IF NOT EXISTS live_human_score INTEGER,
  ADD COLUMN IF NOT EXISTS live_has_noindex BOOLEAN;
COMMENT ON COLUMN public.content_jobs.live_verified_at IS 'P0-1 liveVerify: last successful fetch time for canonicalUrl';
