/**
 * Brief-stage model policy — OpenAI ChatGPT is the PRIMARY model family for
 * the Research/Plan brief, with xAI Grok (SuperGrok) as the default fallback.
 *
 * GPT-5.6 Sol (flagship), GPT-5.6 Terra (balanced), Grok, GLM 5.2 Fast via
 * Baseten / AIHubmix, and DeepSeek V4 Flash 0731 via Baseten are acceptable
 * PRIMARY brief models — all selectable in the Research stage. Everything
 * else — 'auto', a legacy drafting provider id ('nvidia-glm', 'glm-fast'…),
 * or junk — is coerced to GPT-5.6 Terra on the OpenAI provider.
 *
 * FALLBACK: when OpenAI is unconfigured or fails (e.g. an unpaid account
 * returning 429 insufficient_quota), the route falls back to Grok so the
 * Research stage can use the SuperGrok subscription instead of GPT billing.
 */

import { generateContentText, type ContentAiResult } from '@/lib/contentAiProvider'

/** Provider id for the brief fallback (xAI Grok / SuperGrok). */
export const BRIEF_FALLBACK_PROVIDER = 'grok' as const

export type BriefProviderChoice =
  | { aiProvider: 'openai'; model: 'gpt-5.6-sol' | 'gpt-5.6-terra' }
  | { aiProvider: typeof BRIEF_FALLBACK_PROVIDER; model?: undefined }
  | { aiProvider: 'baseten-glm-fast'; model?: undefined }
  | { aiProvider: 'aihubmix-glm-fast'; model?: undefined }
  | { aiProvider: 'baseten-deepseek'; model?: undefined }
  | { aiProvider: 'baseten-deepseek-pro'; model?: undefined }
  | { aiProvider: 'parasail-deepseek'; model?: undefined }
  | { aiProvider: 'parasail-deepseek-pro'; model?: undefined }
  | { aiProvider: 'parasail-glm'; model?: undefined }
  | { aiProvider: 'nvidia-glm'; model?: undefined }
  | { aiProvider: 'nvidia-deepseek'; model?: undefined }
  | { aiProvider: 'nvidia-minimax'; model?: undefined }
  | { aiProvider: 'deepseek-flash'; model?: undefined }
  | { aiProvider: 'deepseek-pro'; model?: undefined }
  | { aiProvider: 'zai-glm'; model?: undefined }

export function resolveBriefAiProvider(rawProvider: string): BriefProviderChoice {
  const pin = String(rawProvider || '').trim().toLowerCase()
  if (
    pin === BRIEF_FALLBACK_PROVIDER ||
    pin === 'xai' ||
    pin === 'supergrok' ||
    pin === 'grok-4.6' ||
    pin === 'grok-4.5'
  ) {
    return { aiProvider: BRIEF_FALLBACK_PROVIDER }
  }
  // GLM 5.2 Fast (Baseten) — still selectable in Research.
  if (pin === 'baseten-glm-fast' || pin === 'glm-5.2-fast') {
    return { aiProvider: 'baseten-glm-fast' }
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
  if (
    pin === 'parasail' ||
    pin === 'parasail-deepseek-pro' ||
    pin === 'parasail-pro' ||
    pin === 'deepseek-v4-pro' ||
    pin === 'deepseek-ai/deepseek-v4-pro-0813'
  ) {
    return { aiProvider: 'parasail-deepseek-pro' }
  }
  if (pin === 'parasail-deepseek' || pin === 'parasail-deepseek-v4-flash') {
    return { aiProvider: 'parasail-deepseek' }
  }
  if (
    pin === 'parasail-glm' ||
    pin === 'parasail-glm-52' ||
    pin === 'parasail-glm-5.2' ||
    pin === 'nvidia/glm-5.2-nvfp4'
  ) {
    return { aiProvider: 'parasail-glm' }
  }
  if (pin === 'baseten-deepseek-pro') {
    return { aiProvider: 'baseten-deepseek-pro' }
  }
  if (pin === 'nvidia-glm' || pin === 'z-ai-glm-5.2') {
    return { aiProvider: 'nvidia-glm' }
  }
  if (pin === 'nvidia-deepseek') {
    return { aiProvider: 'nvidia-deepseek' }
  }
  // NVIDIA MiniMax M3 — the drafting default; also available for briefs.
  if (pin === 'nvidia-minimax' || pin === 'minimax' || pin === 'minimax-m3' || pin === 'minimaxai/minimax-m3') {
    return { aiProvider: 'nvidia-minimax' }
  }
  if (pin === 'deepseek-pro' || pin === 'deepseek-official-pro') {
    return { aiProvider: 'deepseek-pro' }
  }
  if (pin === 'deepseek-flash' || pin === 'deepseek-official' || pin === 'deepseek-official-flash') {
    return { aiProvider: 'deepseek-flash' }
  }
  if (pin === 'zai-glm' || pin === 'zai' || pin === 'zhipu' || pin === 'zhipu-glm') {
    return { aiProvider: 'zai-glm' }
  }
  // Bare 'gpt-5.6' maps to the flagship alias (gpt-5.6-sol), matching the
  // provider layer's gptAliasModel convention.
  if (pin === 'gpt-5.6-sol' || pin === 'gpt-5.6') {
    return { aiProvider: 'openai', model: 'gpt-5.6-sol' }
  }
  return { aiProvider: 'openai', model: 'gpt-5.6-terra' }
}

/** The fallback brief provider — xAI Grok / SuperGrok. */
export function resolveBriefFallback(): { aiProvider: typeof BRIEF_FALLBACK_PROVIDER } {
  return { aiProvider: BRIEF_FALLBACK_PROVIDER }
}

export interface BriefTextResult {
  ai: ContentAiResult
  /** True when the primary failed and Grok drafted the brief. */
  fallbackUsed: boolean
}

/**
 * Escape literal JSON control characters that reasoning models sometimes put
 * inside a quoted value (most commonly a raw newline in `reasoning`). This is
 * deliberately a narrow repair: it does not remove fields, invent values, or
 * tolerate malformed syntax outside strings. The brief contract still fails
 * closed when the response is not a JSON object.
 */
function escapeJsonStringControls(source: string): string {
  let out = ''
  let inString = false
  let escaped = false

  for (const char of source) {
    if (inString) {
      if (escaped) {
        out += char
        escaped = false
        continue
      }
      if (char === '\\') {
        out += char
        escaped = true
        continue
      }
      if (char === '"') {
        out += char
        inString = false
        continue
      }
      const code = char.charCodeAt(0)
      if (code < 0x20) {
        if (char === '\n') out += '\\n'
        else if (char === '\r') out += '\\r'
        else if (char === '\t') out += '\\t'
        else out += `\\u${code.toString(16).padStart(4, '0')}`
      } else {
        out += char
      }
    } else {
      out += char
      if (char === '"') inString = true
    }
  }
  return out
}

/**
 * Parse the model's JSON brief without allowing a single raw control
 * character in a quoted value to take down the whole Research stage.
 */
export function parseBriefJson(raw: string): Record<string, unknown> {
  let text = String(raw || '').trim()
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1)
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Brief JSON must be an object')
    }
    return parsed as Record<string, unknown>
  } catch (firstError) {
    const repaired = escapeJsonStringControls(text)
    if (repaired !== text) {
      try {
        const parsed = JSON.parse(repaired) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch { /* fall through to aggressive */ }
    }
    // Aggressive fallback: strip ALL raw control characters globally,
    // then re-extract the JSON. This catches cases where
    // escapeJsonStringControls misses characters outside string contexts.
    const aggressive = text.replace(/[\x00-\x08\x0e-\x1f]/g, '')
    const aggressiveRepaired = escapeJsonStringControls(aggressive)
    if (aggressiveRepaired !== text) {
      try {
        const parsed = JSON.parse(aggressiveRepaired) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch { /* fall through */ }
    }
    throw firstError
  }
}

/**
 * Generate the brief text with the model policy enforced:
 *   1. PRIMARY — the operator's choice: GPT-5.6 Sol/Terra, Grok, or an
 *      explicit open-source brief model. Exclusive (no cascade).
 *   2. FALLBACK — when the primary is not Grok and that backend fails,
 *      retry with Grok (SuperGrok). When Grok is already the primary,
 *      there is no second leg.
 *
 * Both attempts are `exclusive`. When both legs fail, the combined error
 * names each provider's reason.
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
  // When the operator explicitly selected Grok, the fallback and the primary
  // are the same backend — there is no second leg to try.
  const primaryIsFallback =
    String(opts.aiProvider || '').trim().toLowerCase() === BRIEF_FALLBACK_PROVIDER
  const primaryPin = String(opts.aiProvider || '').trim().toLowerCase()
  const primaryLabel = primaryIsFallback
    ? 'Grok'
    : primaryPin === 'baseten-glm-fast'
      ? 'GLM 5.2 Fast'
      : primaryPin === 'baseten-deepseek'
        ? 'DeepSeek V4 Flash (Baseten)'
        : primaryPin === 'aihubmix-glm-fast'
          ? 'GLM 5.2 Fast (AIHubmix)'
          : primaryPin === 'parasail-deepseek-pro'
            ? 'DeepSeek V4 Pro 0813 (Parasail)'
            : primaryPin === 'parasail-deepseek'
            ? 'DeepSeek V4 Flash (Parasail)'
            : primaryPin === 'parasail-glm'
              ? 'GLM 5.2 (Parasail)'
              : primaryPin === 'baseten-deepseek-pro'
                ? 'DeepSeek V4 Pro 0813 (Baseten)'
                : primaryPin === 'nvidia-glm'
                  ? 'GLM 5.2 (NVIDIA)'
                  : primaryPin === 'nvidia-deepseek'
                    ? 'DeepSeek V4 Flash (NVIDIA)'
                    : primaryPin === 'nvidia-minimax'
                      ? 'MiniMax M3 (NVIDIA)'
                      : primaryPin === 'deepseek-pro'
                      ? 'DeepSeek V4 Pro 0813 (DeepSeek.com)'
                      : primaryPin === 'deepseek-flash'
                        ? 'DeepSeek V4 Flash (DeepSeek.com)'
                        : primaryPin === 'zai-glm'
                          ? 'GLM 5.2 (Zai)'
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
    // SuperGrok can succeed inside generateContentText as the unpaid-quota
    // rescue even when the pin was GPT. Surface that as fallbackUsed so the
    // Research UI can say the brief came from Grok. An explicit Grok pin is
    // still the primary (fallbackUsed stays false).
    return {
      ai,
      fallbackUsed: !primaryIsFallback && ai.provider === BRIEF_FALLBACK_PROVIDER,
    }
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    if (primaryIsFallback) {
      throw new Error(
        `Brief generation failed (Grok): ${primaryMsg.slice(0, 300)}.`,
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
        `Fallback (Grok): ${fallbackMsg.slice(0, 300)}.`,
      )
    }
  }
}
