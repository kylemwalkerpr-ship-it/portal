-- SEO Command Center: mission_log
-- Persistent audit trail for every launch / autopilot / merge / save / refresh run.
-- Survives across sessions so the admin console stays accountable and verifiable.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.mission_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                            -- launch | autopilot | merge | save | refresh | system
  status TEXT NOT NULL,                          -- success | error | info | warn
  source TEXT NOT NULL DEFAULT 'command',        -- generate-stream | auto-run-stream | cannibal-merge | jobs | command
  message TEXT NOT NULL,
  detail JSONB DEFAULT '{}'::jsonb,              -- terms, shipMode, provider, counts, redirects, etc.
  job_id TEXT,                                   -- linked content_jobs id when relevant
  pr_url TEXT,                                   -- GitHub PR url when one was opened
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mission_log_created
  ON public.mission_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_log_kind_created
  ON public.mission_log (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_log_status_created
  ON public.mission_log (status, created_at DESC);

COMMENT ON TABLE public.mission_log IS
  'SEO Command Center: durable audit trail of mission runs (launch, autopilot, merge, save, refresh)';

ALTER TABLE public.mission_log ENABLE ROW LEVEL SECURITY;

-- Admin-only: access controlled at the API route level via Clerk (requireAdminUser).
DROP POLICY IF EXISTS "Admin full access" ON public.mission_log;
CREATE POLICY "Admin full access" ON public.mission_log
  FOR ALL
  USING (true)
  WITH CHECK (true);
