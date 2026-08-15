-- Migration: add competing_snippets column to content_jobs.
-- Feeds the Master SEO Engine's SERP-consensus baseline (competitiveBaseline)
-- with real competitor page snippets instead of the deterministic floor. The
-- Discover/Research stage populates this; the re-audit fix loop and the
-- /api/seo-engine/master route consume it via jobToMasterEngineInput.

ALTER TABLE content_jobs
ADD COLUMN IF NOT EXISTS competing_snippets JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN content_jobs.competing_snippets IS
  'SERP competitor page snippets (array of strings) used to derive the engine''s competitive baseline. Populated by the Discover/Research stage; consumed by the reviewer fix loop and the master-engine route.';
