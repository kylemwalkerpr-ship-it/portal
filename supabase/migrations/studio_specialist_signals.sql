-- Content Studio — Specialist Intel feeds (SSOT: docs/CONTENT_STUDIO_SPECIALIST_INTEL.md)
-- Durable signal queue for YouSafe specialist roles (Policy Desk, Competitor Radar,
-- Overnight Ops, Authority Multiplexer, Support Triage, Marketplace Scout, Lead Desk).
-- Idempotent: safe to re-run.
--
-- Lifecycle: new → queued → consumed | dismissed
--   new      — ingested by a specialist, not yet picked up
--   queued   — surfaced into a work queue / opportunity list
--   consumed — folded into a brief / prompt / job
--   dismissed— rejected by an operator

CREATE TABLE IF NOT EXISTS public.studio_specialist_signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role            TEXT NOT NULL,
  region          TEXT NULL,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'queued', 'consumed', 'dismissed')),
  priority        INT NOT NULL DEFAULT 3,
  related_job_id  UUID NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at     TIMESTAMPTZ NULL
);

-- Open-signal window: engine wiring and the Specialist Intel panel read the
-- newest, highest-priority open signals first.
CREATE INDEX IF NOT EXISTS idx_studio_specialist_signals_open
  ON public.studio_specialist_signals (status, priority, created_at DESC);

-- Role-scoped scans (panel filters + status transitions per role).
CREATE INDEX IF NOT EXISTS idx_studio_specialist_signals_role_status
  ON public.studio_specialist_signals (role, status);

-- RLS: open at DB level like content_jobs / gsc_tokens; every API route enforces
-- admin via Clerk (requireAdminUser / session).
ALTER TABLE public.studio_specialist_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Specialist signals full access" ON public.studio_specialist_signals;
CREATE POLICY "Specialist signals full access"
  ON public.studio_specialist_signals
  FOR ALL USING (true) WITH CHECK (true);