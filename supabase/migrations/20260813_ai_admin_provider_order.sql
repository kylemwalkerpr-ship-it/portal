-- Admin AI provider priority and key-vault hardening.
-- Idempotent follow-up to ai_provider_keys.sql.

INSERT INTO public.ai_settings (key, value, updated_by)
VALUES (
  'provider_order',
  '["nvidia-glm","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek"]',
  'migration'
)
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON TABLE public.ai_provider_keys FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_settings FROM anon, authenticated;

DROP POLICY IF EXISTS "Admin full access" ON public.ai_provider_keys;
DROP POLICY IF EXISTS "No direct client access" ON public.ai_provider_keys;
CREATE POLICY "No direct client access" ON public.ai_provider_keys
  FOR ALL USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Admin full access" ON public.ai_settings;
DROP POLICY IF EXISTS "No direct client access" ON public.ai_settings;
CREATE POLICY "No direct client access" ON public.ai_settings
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE public.ai_settings IS
  'Admin AI defaults and ordered provider cascade; accessed only through the portal service-role API.';
