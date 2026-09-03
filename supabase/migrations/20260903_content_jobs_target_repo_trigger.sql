-- Belt-and-suspenders: even an INSERT that omits target_repo (old Workers,
-- PostgREST sending NULL) must not fail NOT NULL. Default column + trigger.

ALTER TABLE public.content_jobs
  ALTER COLUMN target_repo SET DEFAULT 'caseworks';

UPDATE public.content_jobs
SET target_repo = 'caseworks'
WHERE target_repo IS NULL OR btrim(target_repo) = '';

CREATE OR REPLACE FUNCTION public.content_jobs_ensure_target_repo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.target_repo IS NULL OR btrim(NEW.target_repo) = '' THEN
    NEW.target_repo := 'caseworks';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_jobs_ensure_target_repo ON public.content_jobs;
CREATE TRIGGER trg_content_jobs_ensure_target_repo
  BEFORE INSERT OR UPDATE ON public.content_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.content_jobs_ensure_target_repo();
