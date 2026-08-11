-- content_jobs_archive: cold storage for closed/merged jobs.
-- Archived via POST /api/content-studio/jobs { action: 'archive_resolved' }
-- which COPY-then-DELETE moves rows from content_jobs → content_jobs_archive.

CREATE TABLE IF NOT EXISTS public.content_jobs_archive (
  -- Mirror content_jobs columns
  id UUID PRIMARY KEY,
  user_id TEXT,
  source_job_id UUID,
  regeneration_reason TEXT,
  regeneration_mode TEXT,
  lineage JSONB,
  title TEXT,
  topic TEXT NOT NULL,
  content_type TEXT NOT NULL,
  tone TEXT DEFAULT 'educational',
  region TEXT DEFAULT 'US',
  audience TEXT,
  keywords TEXT[],
  content TEXT,
  slug TEXT,
  status TEXT,
  error_message TEXT,
  last_failure_kind TEXT,
  target_repo TEXT,
  branch_name TEXT,
  content_path TEXT,
  pr_url TEXT,
  pr_number INTEGER,
  ai_provider TEXT,
  word_count INTEGER,
  seo_score INTEGER,
  primary_keyword TEXT,
  owner_host TEXT,
  canonical_url TEXT,
  ship_mode TEXT,
  indexable BOOLEAN,
  deploy_sha TEXT,
  deployed_at TIMESTAMPTZ,
  merged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  event_log JSONB,
  audit_json JSONB,
  gsc_json JSONB,

  -- Archive-specific
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes mirror content_jobs for fast lookups
CREATE INDEX IF NOT EXISTS idx_jobs_archive_user ON public.content_jobs_archive (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_archive_status ON public.content_jobs_archive (status);
CREATE INDEX IF NOT EXISTS idx_jobs_archive_archived ON public.content_jobs_archive (archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_archive_topic ON public.content_jobs_archive USING GIN (to_tsvector('english', COALESCE(topic, '')));

-- RLS: admin full access
ALTER TABLE public.content_jobs_archive ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON public.content_jobs_archive;
CREATE POLICY "Admin full access" ON public.content_jobs_archive
  FOR ALL USING (true) WITH CHECK (true);
