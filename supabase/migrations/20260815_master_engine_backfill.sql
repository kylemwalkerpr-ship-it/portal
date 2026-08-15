-- Master SEO Engine scores persisted per job so the Track ledger can show the
-- layered composite + grade without re-running the engine on every render.
-- Safe to re-run. All columns nullable — unscored rows just show '—'.
ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS master_engine_score INTEGER,
  ADD COLUMN IF NOT EXISTS master_engine_grade TEXT,
  ADD COLUMN IF NOT EXISTS master_engine_json JSONB,
  ADD COLUMN IF NOT EXISTS master_engine_fetched_at TIMESTAMPTZ;
COMMENT ON COLUMN public.content_jobs.master_engine_score IS 'Master SEO Engine composite (0-100)';
COMMENT ON COLUMN public.content_jobs.master_engine_grade IS 'Master SEO Engine letter grade (A-F)';
COMMENT ON COLUMN public.content_jobs.master_engine_json IS 'Full Master SEO Engine report (subsystems, deltas, risks, recommendations, prediction, coverage)';
COMMENT ON COLUMN public.content_jobs.master_engine_fetched_at IS 'When the engine last scored this job';
