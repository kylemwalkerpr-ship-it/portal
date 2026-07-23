-- Content Studio: durable debug / activity log per job
-- Safe to re-run

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS event_log JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.content_jobs.event_log IS
  'Array of StudioLogEntry-like objects: {id, ts, level, source, message, detail?}';

CREATE INDEX IF NOT EXISTS idx_content_jobs_event_log_gin
  ON public.content_jobs USING gin (event_log);
