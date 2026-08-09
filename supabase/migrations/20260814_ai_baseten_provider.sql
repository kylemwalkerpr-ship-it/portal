-- Register Baseten DeepSeek V4 Flash in the admin AI provider order.
-- Preserve a custom administrator order; only upgrade the prior migration default.

INSERT INTO public.ai_settings (key, value, updated_by)
VALUES (
  'provider_order',
  '["nvidia-glm","baseten-deepseek","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek"]',
  'migration'
)
ON CONFLICT (key) DO NOTHING;

UPDATE public.ai_settings
SET value = '["nvidia-glm","baseten-deepseek","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek"]',
    updated_by = 'migration',
    updated_at = now()
WHERE key = 'provider_order'
  AND value = '["nvidia-glm","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek"]';
