-- Migration: add competing_urls column to content_jobs for cannibalization detection.
-- The radar/coverage map populates this when the admin selects a topic that overlaps
-- existing estate pages; the gate and repair consume it downstream.

ALTER TABLE content_jobs
ADD COLUMN IF NOT EXISTS competing_urls JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN content_jobs.competing_urls IS
  'Competing estate pages from the coverage map (array of {url, title, primaryKeyword}). Used by the quality gate and deterministic repair for cannibalization detection.';
