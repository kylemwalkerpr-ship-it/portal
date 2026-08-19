-- Reviewer/editor snapshots. Autosave used to live in a Worker Map, so a
-- re-audit after deploy/cold start rewound the pane to the first generated
-- draft. Each save, re-audit, and AI fix now appends a row here and updates
-- content_jobs.content so the latest passing body is what the next audit sees.

CREATE TABLE IF NOT EXISTS public.content_job_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.content_jobs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  word_count INTEGER NOT NULL DEFAULT 0,
  quality_ok BOOLEAN,
  ship_ready BOOLEAN,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_repairs TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'autosave'
    CHECK (source IN ('autosave', 'reaudit', 'fix', 'manual', 'restore')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_job_reviews_job
  ON public.content_job_reviews (job_id, created_at DESC);

ALTER TABLE public.content_job_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Content job reviews full access" ON public.content_job_reviews;
CREATE POLICY "Content job reviews full access" ON public.content_job_reviews
  FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON public.content_job_reviews TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
