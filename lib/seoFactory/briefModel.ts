/**
 * Brief-stage model policy — OpenAI ChatGPT is the PRIMARY model family for
 * the Research/Plan brief, with GLM 5.2 Fast (Baseten) as the fallback.
 *
 * GPT-5.6 Sol (flagship) and GPT-5.6 Terra (balanced) are the only two
 * acceptable PRIMARY brief models. Everything else — 'auto', a legacy drafting
 * provider id ('baseten-deepseek', 'nvidia-glm', 'glm-fast'…), or junk — is
 * coerced to GPT-5.6 Terra on the OpenAI provider. This is the single choke
 * point so a stale client or provider-id leak can never make a non-OpenAI
 * model draft the brief (2026-08: the route forwarded body.aiProvider
 * verbatim, so a stray 'auto' or 'baseten-*' value silently sent the brief
 * through the open-source drafting cascade instead of ChatGPT).
 *
 * FALLBACK: when OpenAI is unconfigured or fails (e.g. an unpaid account
 * returning 429 insufficient_quota), the route falls back to GLM 5.2 Fast via
 * Baseten — the same efficient open-source model the drafting stage leads
 * with — so the Research stage never hard-blocks on GPT billing.
 */

import { generateContentText, type ContentAiResult } from '@/lib/contentAiProvider'

/** Provider id for the brief fallback (GLM 5.2 Fast via Baseten). */
export const BRIEF_FALLBACK_PROVIDER = 'baseten-glm-fast' as const

export function resolveBriefAiProvider(
  rawProvider: string,
): { aiProvider: 'openai'; model: 'gpt-5.6-sol' | 'gpt-5.6-terra' } {
  const pin = String(rawProvider || '').trim().toLowerCase()
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
 *   1. PRIMARY — OpenAI ChatGPT (GPT-5.6 Sol/Terra), exclusive (no cascade).
 *   2. FALLBACK — GLM 5.2 Fast via Baseten when OpenAI is unconfigured or
 *      fails (e.g. an unpaid account returning 429 insufficient_quota).
 *
 * Both attempts are `exclusive`, so a brief can only ever be produced by GPT
 * or GLM 5.2 Fast — never silently handed to an unrelated drafting backend.
 * When BOTH fail, the combined error names each provider's reason.
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
    return { ai, fallbackUsed: ai.provider === BRIEF_FALLBACK_PROVIDER }
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
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
        `Brief generation failed. Primary (GPT): ${primaryMsg.slice(0, 300)}. ` +
        `Fallback (GLM 5.2 Fast): ${fallbackMsg.slice(0, 300)}.`,
      )
    }
  }
}
