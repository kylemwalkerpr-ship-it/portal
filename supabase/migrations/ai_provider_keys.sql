-- SEO Command Center: ai_provider_keys
-- Admin-managed API keys for the content AI chain, pasted from the dashboard.
-- Replaces the old "set a Worker secret" flow: keys live in Supabase (admin DB),
-- the Worker reads them at runtime through lib/aiKeyVault.ts with a short TTL.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.ai_provider_keys (
  provider TEXT PRIMARY KEY,              -- openai | groq | gemini | openrouter | custom | grok | nvidia-deepseek | cloudflare-ai | deepseek
  api_key TEXT,                           -- the actual credential (admin-only read via service role)
  base_url TEXT,                          -- override endpoint (custom providers)
  model TEXT,                             -- model override (e.g. gpt-5.6-luna)
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by TEXT,                        -- admin identity that last wrote it
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_settings (
  key TEXT PRIMARY KEY,                   -- default_provider | default_model | max_providers | custom_base_url
  value TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_keys_enabled
  ON public.ai_provider_keys (enabled);

COMMENT ON TABLE public.ai_provider_keys IS
  'SEO Command Center: admin-pasted API keys for content AI providers (stored in Supabase, read by the Worker at runtime)';

COMMENT ON TABLE public.ai_settings IS
  'SEO Command Center: key/value AI defaults (default provider, default model, provider count cap)';

ALTER TABLE public.ai_provider_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only: access controlled at the API route level via Clerk (requireAdminUser).
DROP POLICY IF EXISTS "Admin full access" ON public.ai_provider_keys;
CREATE POLICY "Admin full access" ON public.ai_provider_keys
  FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin full access" ON public.ai_settings;
CREATE POLICY "Admin full access" ON public.ai_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
