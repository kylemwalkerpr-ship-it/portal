-- Weekly rhythm-scan: durable alert rows for drafts whose
-- sentence_start_repetition slipped through the gate before list items were
-- counted / before the deterministic repair existed. Written by
-- POST /api/cron/rhythm-scan-weekly, read by the admin dashboard panel.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.content_rhythm_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  title TEXT,
  status TEXT,
  content_type TEXT,
  region TEXT,
  primary_keyword TEXT,
  rhythm_key TEXT NOT NULL,          -- repeated 12-char opening evidence ("the departme…")
  count INT NOT NULL DEFAULT 0,      -- worst repetition count for the key
  severity TEXT NOT NULL DEFAULT 'warning', -- warning | blocker (≥7)
  remediable BOOLEAN NOT NULL DEFAULT false, -- deterministic repair fully clears it
  run_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, run_ts)            -- one alert per job per scan run
);

CREATE INDEX IF NOT EXISTS idx_rhythm_alerts_run_ts
  ON public.content_rhythm_alerts (run_ts DESC);
CREATE INDEX IF NOT EXISTS idx_rhythm_alerts_job
  ON public.content_rhythm_alerts (job_id);

COMMENT ON TABLE public.content_rhythm_alerts IS
  'Weekly rhythm-scan alert rows (sentence_start_repetition) for stored drafts.';

ALTER TABLE public.content_rhythm_alerts ENABLE ROW LEVEL SECURITY;

-- Admin-only: access controlled at the API route level via Clerk (requireAdminUser)
-- for dashboard reads and CRON_SECRET for cron writes.
DROP POLICY IF EXISTS "Rhythm alerts full access" ON public.content_rhythm_alerts;
CREATE POLICY "Rhythm alerts full access" ON public.content_rhythm_alerts
  FOR ALL
  USING (true)
  WITH CHECK (true);
