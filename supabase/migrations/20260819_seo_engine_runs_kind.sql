-- Allow the weekly forecast→reward cron to record seo_engine_runs rows.
-- The original CHECK only permitted knowledge|plan|daily|manual; TypeScript
-- already inserts kind='forecast-reward' and those writes were silently dropped.

ALTER TABLE public.seo_engine_runs DROP CONSTRAINT IF EXISTS seo_engine_runs_kind_check;
ALTER TABLE public.seo_engine_runs
  ADD CONSTRAINT seo_engine_runs_kind_check
  CHECK (kind IN ('knowledge', 'plan', 'daily', 'manual', 'forecast-reward'));
