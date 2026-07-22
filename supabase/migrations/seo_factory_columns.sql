-- SEO Factory extensions to content_jobs
-- Safe to re-run: uses IF NOT EXISTS / additive columns

ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS ship_mode TEXT DEFAULT 'pr'
    CHECK (ship_mode IS NULL OR ship_mode IN ('pr', 'autodeploy')),
  ADD COLUMN IF NOT EXISTS indexable BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS canonical_url TEXT,
  ADD COLUMN IF NOT EXISTS owner_host TEXT,
  ADD COLUMN IF NOT EXISTS primary_keyword TEXT,
  ADD COLUMN IF NOT EXISTS audit_json JSONB,
  ADD COLUMN IF NOT EXISTS gsc_json JSONB,
  ADD COLUMN IF NOT EXISTS deploy_sha TEXT,
  ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inspection_status TEXT DEFAULT 'n/a'
    CHECK (inspection_status IS NULL OR inspection_status IN (
      'pending', 'indexed', 'discovered', 'excluded', 'error', 'n/a'
    )),
  ADD COLUMN IF NOT EXISTS llms_included BOOLEAN DEFAULT false;

-- Allow new statuses used by factory
-- (Postgres cannot easily alter CHECK; add parallel unconstrained status_v2 if needed)
-- Application layer accepts: pending, drafting, publishing, pr_created, deployed, merged, closed, failed

CREATE INDEX IF NOT EXISTS idx_content_jobs_owner_host ON public.content_jobs (owner_host);
CREATE INDEX IF NOT EXISTS idx_content_jobs_primary_keyword ON public.content_jobs (primary_keyword);
CREATE INDEX IF NOT EXISTS idx_content_jobs_ship_mode ON public.content_jobs (ship_mode);
