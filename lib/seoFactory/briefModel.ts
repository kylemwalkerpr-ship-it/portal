/**
 * Brief-stage model policy — OpenAI ChatGPT is the PRIMARY model family for
 * the Research/Plan brief, with GLM 5.2 Fast (Baseten) as the fallback.
 *
 * GPT-5.6 Sol (flagship), GPT-5.6 Terra (balanced), GLM 5.2 Fast via Baseten,
 * GLM 5.2 Fast via AIHubmix, and DeepSeek V4 Flash 0731 via Baseten are the
 * five acceptable PRIMARY brief models — all selectable in the Research
 * stage. Everything else — 'auto', a legacy drafting provider id
 * ('nvidia-glm', 'glm-fast'…), or junk — is coerced to GPT-5.6 Terra on the
 * OpenAI provider. This is the
 * single choke point so a stale client or provider-id leak can never make an
 * unrelated backend draft the brief (2026-08: the route forwarded
 * body.aiProvider verbatim, so a stray 'auto' or 'baseten-*' value silently
 * sent the brief through the open-source drafting cascade instead of ChatGPT).
 *
 * FALLBACK: when OpenAI is unconfigured or fails (e.g. an unpaid account
 * returning 429 insufficient_quota), the route falls back to GLM 5.2 Fast via
 * Baseten — the same efficient open-source model the drafting stage leads
 * with — so the Research stage never hard-blocks on GPT billing.
 */

import { generateContentText, type ContentAiResult } from '@/lib/contentAiProvider'

/** Provider id for the brief fallback (GLM 5.2 Fast via Baseten). */
export const BRIEF_FALLBACK_PROVIDER = 'baseten-glm-fast' as const

export type BriefProviderChoice =
  | { aiProvider: 'openai'; model: 'gpt-5.6-sol' | 'gpt-5.6-terra' }
  | { aiProvider: typeof BRIEF_FALLBACK_PROVIDER; model?: undefined }
  | { aiProvider: 'aihubmix-glm-fast'; model?: undefined }
  | { aiProvider: 'baseten-deepseek'; model?: undefined }

export function resolveBriefAiProvider(rawProvider: string): BriefProviderChoice {
  const pin = String(rawProvider || '').trim().toLowerCase()
  // GLM 5.2 Fast (Baseten) — an explicit third brief choice, selectable in the
  // Research stage alongside GPT Sol/Terra. 'glm-5.2-fast' is a friendly alias.
  if (pin === BRIEF_FALLBACK_PROVIDER || pin === 'glm-5.2-fast') {
    return { aiProvider: BRIEF_FALLBACK_PROVIDER }
  }
  // GLM 5.2 Fast via AIHubmix — a fourth brief choice (OpenAI-compatible
  // aggregator route). Aliases: 'aihubmix-glm-fast' / 'glm-fast-aihubmix'.
  if (pin === 'aihubmix-glm-fast' || pin === 'aihubmix-glm' || pin === 'glm-fast-aihubmix') {
    return { aiProvider: 'aihubmix-glm-fast' }
  }
  // DeepSeek V4 Flash 0731 via Baseten — a fifth brief choice (the research
  // stage's reasoning heavyweight). Aliases: 'baseten-deepseek' /
  // 'deepseek-v4-flash' / the full Baseten model id.
  if (
    pin === 'baseten-deepseek' ||
    pin === 'deepseek-v4-flash' ||
    pin === 'deepseek-ai/deepseek-v4-flash-0731'
  ) {
    return { aiProvider: 'baseten-deepseek' }
  }
  // Bare 'gpt-5.6' maps to the flagship alias (gpt-5.6-sol), matching the
  // provider layer's gptAliasModel convention.
  if (pin === 'gpt-5.6-sol' || pin === 'gpt-5.6') {
    return { aiProvider: 'openai', model: 'gpt-5.6-sol' }
  }
  return { aiProvider: 'openai', model: 'gpt-5.6-terra' }
}

/** The fallback brief provider — GLM 5.2 Fast via Baseten. */
export function resolveBriefFallback(): { aiProvider: typeof BRIEF_FALLBACK_PROVIDER } {
  return { aiProvider: BRIEF_FALLBACK_PROVIDER }
}

export interface BriefTextResult {
  ai: ContentAiResult
  /** True when GPT (OpenAI) failed and GLM 5.2 Fast drafted the brief. */
  fallbackUsed: boolean
}

/**
 * Generate the brief text with the model policy enforced:
 *   1. PRIMARY — the operator's choice: GPT-5.6 Sol/Terra (OpenAI) or
 *      GLM 5.2 Fast (Baseten), exclusive (no cascade).
 *   2. FALLBACK — when the primary is GPT and OpenAI is unconfigured or fails
 *      (e.g. an unpaid account returning 429 insufficient_quota), retry with
 *      GLM 5.2 Fast. When GLM is already the primary, there is no second leg.
 *
 * Both attempts are `exclusive`, so a brief can only ever be produced by GPT
 * or GLM 5.2 Fast — never silently handed to an unrelated drafting backend.
 * When both legs fail, the combined error names each provider's reason.
 */
export async function generateBriefText(opts: {
  aiProvider: string
  model?: string
  system: string
  prompt: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}): Promise<BriefTextResult> {
  const fallback = resolveBriefFallback()
  // When the operator explicitly selected GLM 5.2 Fast, the "fallback" and the
  // primary are the same backend — there is no second leg to try.
  const primaryIsFallback =
    String(opts.aiProvider || '').trim().toLowerCase() === BRIEF_FALLBACK_PROVIDER
  // Human-readable label for the combined-error message, so a DeepSeek/AIHubmix
  // primary isn't mis-reported as "(GPT)".
  const primaryPin = String(opts.aiProvider || '').trim().toLowerCase()
  const primaryLabel = primaryIsFallback
    ? 'GLM 5.2 Fast'
    : primaryPin === 'baseten-deepseek'
      ? 'DeepSeek V4 Flash (Baseten)'
      : primaryPin === 'aihubmix-glm-fast'
        ? 'GLM 5.2 Fast (AIHubmix)'
        : 'GPT'
  try {
    const ai = await generateContentText({
      aiProvider: opts.aiProvider,
      model: opts.model,
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      timeoutMs: opts.timeoutMs,
      exclusive: true,
    })
    // fallbackUsed is false whenever the primary leg succeeds — including when
    // the primary IS GLM 5.2 Fast (previously `ai.provider === fallback` made
    // an explicit GLM selection masquerade as a "fallback").
    return { ai, fallbackUsed: false }
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    if (primaryIsFallback) {
      throw new Error(
        `Brief generation failed (GLM 5.2 Fast): ${primaryMsg.slice(0, 300)}.`,
      )
    }
    try {
      const ai = await generateContentText({
        aiProvider: fallback.aiProvider,
        system: opts.system,
        prompt: opts.prompt,
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        timeoutMs: opts.timeoutMs,
        exclusive: true,
      })
      return { ai, fallbackUsed: true }
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(
        `Brief generation failed. Primary (${primaryLabel}): ${primaryMsg.slice(0, 300)}. ` +
        `Fallback (GLM 5.2 Fast): ${fallbackMsg.slice(0, 300)}.`,
      )
    }
  }
}
