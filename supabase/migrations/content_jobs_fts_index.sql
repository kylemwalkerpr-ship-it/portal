-- GIN index for full-text search on content_jobs.topic
-- Used by /api/content-studio/jobs textSearch query (english config)
-- Without this index, textSearch does a sequential scan converting each row's
-- topic column to tsvector on the fly, which can exceed Cloudflare Free plan
-- CPU budget (10ms) on large tables.
--
-- Idempotent: safe to re-run.
--
-- Apply via:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/content_jobs_fts_index.sql

CREATE INDEX IF NOT EXISTS idx_content_jobs_topic_fts
  ON public.content_jobs
  USING GIN (to_tsvector('english', topic));
