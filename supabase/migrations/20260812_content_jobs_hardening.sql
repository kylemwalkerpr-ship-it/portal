-- ============================================================================
-- 20260812_content_jobs_hardening.sql
--
-- Job-failure hardening — addresses the "jobs keep failing" production issue:
--
--   1. Add lightweight retry-state columns so the reconcile cron + retry cron
--      can stage self-healing with exponential backoff without parsing event_log
--      arrays on every poll.
--   2. Widen the status CHECK constraint so legacy "processing" rows (created
--      by older pipelines that never landed in 'drafting') don't block updates.
--   3. Add ship_error + ship_provider columns so the UI can distinguish a
--      compliance-gate refusal from a GitHub-side error without parsing
--      error_message.
--   4. Backstop the `event_log` JSONB column with a safe default + GIN index
--      (idempotent with content_jobs_event_log.sql).
--   5. Default `attempt_count = 0` so retry logic can do
--      `WHERE (attempt_count IS NULL OR attempt_count < N)`.
--   6. Add a maintenance view content_job_health_summary that the War Room
--      panel can pull from cheaply.
--
-- Safe to re-run: every ALTER is guarded with IF NOT EXISTS / DO blocks.
-- ============================================================================

-- ── 1. Retry-state columns ────────────────────────────────────────────────
ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_failure_kind TEXT,
  ADD COLUMN IF NOT EXISTS created_via TEXT;

CREATE INDEX IF NOT EXISTS idx_content_jobs_next_attempt
  ON public.content_jobs (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_content_jobs_attempt_count
  ON public.content_jobs (attempt_count, updated_at);

-- ── 2. Ship-error columns ─────────────────────────────────────────────────
ALTER TABLE public.content_jobs
  ADD COLUMN IF NOT EXISTS ship_error TEXT,
  ADD COLUMN IF NOT EXISTS ship_provider TEXT,
  ADD COLUMN IF NOT EXISTS ship_target_repo TEXT;

-- ── 3. Widen status CHECK — allow 'processing' as a legacy state ─────────
DO $$
BEGIN
  -- Drop the existing constraint in any spelling so we can recreate it idempotently.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_jobs_status_check'
  ) THEN
    ALTER TABLE public.content_jobs DROP CONSTRAINT content_jobs_status_check;
  END IF;
END $$;

-- Recreate with a wider set of statuses the runtime pipeline may use.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_jobs_status_check'
  ) THEN
    ALTER TABLE public.content_jobs
      ADD CONSTRAINT content_jobs_status_check
      CHECK (status IN (
        'pending',
        'drafting',
        'processing',          -- legacy / in-flight alias
        'publishing',
        'pr_created',
        'merged',
        'closed',
        'failed'
      ));
  END IF;
END $$;

-- ── 4. event_log backstop (idempotent with content_jobs_event_log.sql) ────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_jobs'
      AND column_name = 'event_log'
  ) THEN
    ALTER TABLE public.content_jobs
      ADD COLUMN event_log JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_jobs_event_log_gin
  ON public.content_jobs USING gin (event_log);

-- ── 5. Helper view for the War Room / queue band ─────────────────────────
CREATE OR REPLACE VIEW public.content_job_health_summary AS
SELECT
  status,
  COUNT(*)::int AS job_count,
  MIN(updated_at) AS oldest_update,
  MAX(updated_at) AS newest_update,
  COUNT(*) FILTER (WHERE status = 'drafting' AND updated_at < now() - INTERVAL '30 minutes')::int AS stuck_drafting,
  COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
  COUNT(*) FILTER (WHERE next_attempt_at IS NOT NULL AND next_attempt_at <= now())::int AS due_for_retry,
  COUNT(*) FILTER (WHERE ship_error IS NOT NULL)::int AS ship_error_count,
  COUNT(*) FILTER (WHERE pr_url IS NOT NULL AND merged_at IS NULL AND created_at < now() - INTERVAL '14 days')::int AS orphan_pr
FROM public.content_jobs
GROUP BY status;

COMMENT ON VIEW public.content_job_health_summary IS
  'Cheap aggregate view the War Room + reconcile cron read to surface stuck/failed content jobs.';

-- ── 6. last_failure_kind is constrained to a closed set so dashboards ─────
--       don't have to guess at freeform text.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'content_jobs_last_failure_kind_check'
  ) THEN
    ALTER TABLE public.content_jobs
      ADD CONSTRAINT content_jobs_last_failure_kind_check
      CHECK (last_failure_kind IS NULL OR last_failure_kind IN (
        'compliance_gate',
        'ai_provider',
        'github_push',
        'github_merge',
        'cloudflare_deploy',
        'schema',
        'config',
        'timeout',
        'unknown'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.content_jobs.attempt_count IS
  'Number of automatic retry attempts. Surfaces in the queue band and gates the retry cron.';
COMMENT ON COLUMN public.content_jobs.next_attempt_at IS
  'Earliest UTC timestamp at which the reconcile cron may retry this job. NULL = no scheduled retry.';
COMMENT ON COLUMN public.content_jobs.last_failure_kind IS
  'Categorized failure kind so the War Room and operator dashboards can group failures without parsing event_log.';
COMMENT ON COLUMN public.content_jobs.ship_error IS
  'Last ship-side error (PR opens / merge / deploy). NULL means no ship-level failure has been recorded.';
COMMENT ON COLUMN public.content_jobs.ship_target_repo IS
  'Repo+path wanted by the planner. Differs from target_repo only if the planner resolved a redirect target.';
