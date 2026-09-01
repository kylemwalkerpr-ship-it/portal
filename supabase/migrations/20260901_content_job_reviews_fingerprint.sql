-- Reviewer-snapshot gate hydration: the canonical current-gate state (audit
-- result + ship readiness) is persisted alongside the reviewed body so the
-- job modal can restore it after a Worker restart.
--
-- lib/seoFactory/reviewSnapshots.ts computes the fingerprint at read time
-- from the stored body (FNV-1a, non-security), but ALSO writes it on insert;
-- without this column every snapshot insert fails with
-- "column content_job_reviews.content_fingerprint does not exist".

ALTER TABLE public.content_job_reviews
  ADD COLUMN IF NOT EXISTS content_fingerprint TEXT;

NOTIFY pgrst, 'reload schema';