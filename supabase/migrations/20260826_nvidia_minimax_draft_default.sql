-- Content Studio drafting default: NVIDIA MiniMax M3.
-- Brief and reviewer pins remain controlled by their own UI defaults.
-- Only legacy/empty drafting settings are migrated; an explicit admin choice is preserved.

INSERT INTO public.ai_settings (key, value, updated_by)
VALUES ('default_provider', 'nvidia-minimax', 'migration')
ON CONFLICT (key) DO UPDATE
SET value = CASE
  WHEN public.ai_settings.value IS NULL
    OR btrim(public.ai_settings.value) IN('','auto', 'baseten-deepseek', 'baseten-glm-fast', 'parasail-deepseek', 'nvidia-nemotron')
    THEN 'nvidia-minimax'
  ELSE public.ai_settings.value
END,
updated_by = CASE
  WHEN public.ai_settings.value IS NULL
    OR btrim(public.ai_settings.value) IN('','auto', 'baseten-deepseek', 'baseten-glm-fast', 'parasail-deepseek', 'nvidia-nemotron')
    THEN 'migration'
  ELSE public.ai_settings.updated_by
END,
updated_at = CASE
  WHEN public.ai_settings.value IS NULL
    OR btrim(public.ai_settings.value) IN('','auto', 'baseten-deepseek', 'baseten-glm-fast', 'parasail-deepseek', 'nvidia-nemotron')
    THEN now()
  ELSE public.ai_settings.updated_at
END;

INSERT INTO public.ai_settings (key, value, updated_by)
VALUES (
  'provider_order',
  '["nvidia-minimax","grok","nvidia-nemotron","nvidia-glm","nvidia-deepseek","baseten-deepseek","parasail-deepseek","deepseek-flash","parasail-glm","baseten-glm-fast","openai","cloudflare-ai","groq","gemini","openrouter","custom","deepseek","aihubmix-glm-fast","parasail-deepseek-pro","baseten-deepseek-pro","deepseek-pro","zai-glm"]',
  'migration'
)
ON CONFLICT (key) DO UPDATE
SET value = CASE
  WHEN public.ai_settings.value IS NULL
    OR btrim(public.ai_settings.value) = ''
    OR btrim(public.ai_settings.value) ~ '^\s*\["(parasail-deepseek|baseten-deepseek|nvidia-deepseek|nvidia-nemotron)'
    THEN EXCLUDED.value
  ELSE public.ai_settings.value
END,
updated_by = CASE
  WHEN public.ai_settings.value IS NULL
    OR btrim(public.ai_settings.value) = ''
    OR btrim(public.ai_settings.value) ~ '^\s*\["(parasail-deepseek|baseten-deepseek|nvidia-deepseek|nvidia-nemotron)'
    THEN 'migration'
  ELSE public.ai_settings.updated_by
END,
updated_at = CASE
  WHEN public.ai_settings.value IS NULL
    OR btrim(public.ai_settings.value) = ''
    OR btrim(public.ai_settings.value) ~ '^\s*\["(parasail-deepseek|baseten-deepseek|nvidia-deepseek|nvidia-nemotron)'
    THEN now()
  ELSE public.ai_settings.updated_at
END;
