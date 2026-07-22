-- Content Studio: content_jobs table
-- Tracks AI-generated content lifecycle from pending → drafting → publishing → pr_created → merged/closed/failed
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.content_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                           -- Clerk user ID

  -- Input fields
  title TEXT,
  topic TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog_post', 'article', 'regional_page', 'marketplace_gig')),
  tone TEXT DEFAULT 'educational' CHECK (tone IN ('professional', 'educational', 'persuasive', 'authoritative', 'casual')),
  region TEXT DEFAULT 'US' CHECK (region IN ('US', 'CA', 'AU', 'UK', 'COMPARE')),
  audience TEXT,
  keywords TEXT[],

  -- Generated content
  content TEXT,
  slug TEXT,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'drafting', 'publishing', 'pr_created', 'merged', 'closed', 'failed')),
  error_message TEXT,

  -- GitHub details
  target_repo TEXT NOT NULL,
  branch_name TEXT,
  content_path TEXT,
  pr_url TEXT,
  pr_number INTEGER,

  -- Terminal timestamps
  merged_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,

  -- AI + SEO metadata
  ai_provider TEXT,
  word_count INTEGER,
  seo_score INTEGER CHECK (seo_score >= 0 AND seo_score <= 100),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_jobs_user ON public.content_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_jobs_status ON public.content_jobs (status);
CREATE INDEX IF NOT EXISTS idx_content_jobs_region ON public.content_jobs (region);
CREATE INDEX IF NOT EXISTS idx_content_jobs_pr_number ON public.content_jobs (pr_number) WHERE pr_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_jobs_repo_pr ON public.content_jobs (target_repo, pr_number) WHERE pr_number IS NOT NULL;

-- Enable RLS (Row-Level Security)
ALTER TABLE public.content_jobs ENABLE ROW LEVEL SECURITY;

-- Admin-only policy: access controlled at the API route level via Clerk.
DROP POLICY IF EXISTS "Admin full access" ON public.content_jobs;
CREATE POLICY "Admin full access" ON public.content_jobs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_content_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_content_jobs_updated_at ON public.content_jobs;
CREATE TRIGGER trg_content_jobs_updated_at
  BEFORE UPDATE ON public.content_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_content_jobs_updated_at();
