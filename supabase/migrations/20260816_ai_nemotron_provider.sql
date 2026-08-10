-- Register NVIDIA Nemotron 3 Ultra as a selectable Content Studio provider.
-- Uses the existing NVIDIA_API_KEY / NVIDIA_BASE_URL credentials and stores
-- an optional model override in NVIDIA_NEMOTRON_MODEL.

INSERT INTO public.ai_settings (key, value, updated_by)
VALUES (
  'provider_order',
  '["nvidia-glm","baseten-deepseek","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek","nvidia-nemotron"]',
  'migration'
)
ON CONFLICT (key) DO NOTHING;

UPDATE public.ai_settings
SET value = '["nvidia-glm","baseten-deepseek","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek","nvidia-nemotron"]',
    updated_by = 'migration',
    updated_at = now()
WHERE key = 'provider_order'
  AND value IN (
    '["nvidia-glm","baseten-deepseek","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek"]',
    '["nvidia-glm","nvidia-deepseek","grok","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek"]'
  );
