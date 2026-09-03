-- content_jobs.target_repo is NOT NULL with no DEFAULT. Draft Save / claim
-- inserts that omitted it failed with:
--   null value in column "target_repo" of relation "content_jobs" violates not-null constraint
-- Keep NOT NULL (ship still needs a repo) but give a safe default and backfill.

ALTER TABLE public.content_jobs
  ALTER COLUMN target_repo SET DEFAULT 'caseworks';

UPDATE public.content_jobs
SET target_repo = 'caseworks'
WHERE target_repo IS NULL OR btrim(target_repo) = '';

ALTER TABLE public.content_jobs
  ALTER COLUMN target_repo SET NOT NULL;
