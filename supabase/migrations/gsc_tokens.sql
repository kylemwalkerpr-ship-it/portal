-- Content Studio: GSC OAuth tokens table
-- Stores Google Search Console OAuth 2.0 tokens for API access.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.gsc_tokens (
  id TEXT PRIMARY KEY DEFAULT 'default',
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  google_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gsc_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON public.gsc_tokens;
CREATE POLICY "Admin full access" ON public.gsc_tokens
  FOR ALL
  USING (true)
  WITH CHECK (true);
