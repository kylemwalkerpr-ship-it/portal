/**
 * Brief-stage model policy — five model families:
 *   1. Entrim Qwen3.8 27B (`entrim-qwen-27b`) — the DEFAULT (api.entrim.ai/v1,
 *      shares the ENTRIM vault row). It consumes all Discover intelligence.
 *   2. Claude Opus 5 via Run BiOS (`runbios-claude-opus`) — explicit choice.
 *   3. Grok (xAI / SuperGrok) — complementary choice and the fallback leg.
 *   4. DeepSeek V4 Flash, served by two hosts: Run BiOS
 *      (`runbios-deepseek-flash`) and Baseten (`baseten-deepseek`).
 *   5. Entrim DeepSeek V4 Flash (`entrim-deepseek`) — second Entrim family.
 * 'auto', empty, stale, or unrecognized pins coerce to the Entrim Qwen
 * default. No other Brief choice exists.
 *
 * FALLBACK: when the primary is unconfigured or fails, the route falls back
 * to Grok (existing resolveBriefFallback).
 */

import { generateContentText, isEntrimConfigured, type ContentAiResult } from '@/lib/contentAiProvider'
import { canonicalizeRunbiosPin, isRunbiosPin } from '@/lib/runbiosCatalog'

/** Provider id for the brief fallback (xAI Grok / SuperGrok). */
export const BRIEF_FALLBACK_PROVIDER = 'grok' as const

/** Brief lead pin — Entrim Qwen3.8 27B (graduated default). */
export const BRIEF_DEFAULT_PROVIDER = 'entrim-qwen-27b' as const

/** Claude Opus 5 via Run BiOS — explicit alternative choice. */
export const BRIEF_CLAUDE_PROVIDER = 'runbios-claude-opus' as const

/** Entrim Qwen3.8 27B — fourth brief family (api.entrim.ai/v1). */
export const BRIEF_ENTRIM_QWEN_PROVIDER = 'entrim-qwen-27b' as const

export type BriefProviderChoice =
  | { aiProvider: typeof BRIEF_FALLBACK_PROVIDER; model?: undefined }
  | { aiProvider: typeof BRIEF_DEFAULT_PROVIDER; model?: undefined }
  | { aiProvider: typeof BRIEF_CLAUDE_PROVIDER; model?: undefined }
  | { aiProvider: 'runbios-deepseek-flash'; model?: undefined }
  | { aiProvider: 'baseten-deepseek'; model?: undefined }
  | { aiProvider: 'entrim-deepseek'; model?: undefined }

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
  // Claude Opus 5 via Run BiOS — explicit alternative to the Entrim default.
  if (isRunbiosPin(pin) && canonicalizeRunbiosPin(pin) === BRIEF_CLAUDE_PROVIDER) {
    return { aiProvider: BRIEF_CLAUDE_PROVIDER }
  }
  if (pin === 'claude-opus-5') {
    return { aiProvider: BRIEF_CLAUDE_PROVIDER }
  }
  // DeepSeek V4 Flash — a brief family, on its two hosts.
  if (pin === 'runbios-deepseek-flash' || pin === 'deepseek-ai/deepseek-v4-flash') {
    return { aiProvider: 'runbios-deepseek-flash' }
  }
  if (
    pin === 'baseten-deepseek' ||
    pin === 'deepseek-v4-flash' ||
    pin === 'deepseek-ai/deepseek-v4-flash-0731'
  ) {
    return { aiProvider: 'baseten-deepseek' }
  }
  // Entrim Qwen3.8 27B — the graduated brief default (api.entrim.ai/v1).
  if (pin === BRIEF_ENTRIM_QWEN_PROVIDER || pin === 'qwen3.8-27b' || pin === 'qwen') {
    return { aiProvider: BRIEF_ENTRIM_QWEN_PROVIDER }
  }
  // DeepSeek V4 Flash on Entrim — second Entrim brief family.
  if (pin === 'entrim-deepseek') {
    return { aiProvider: 'entrim-deepseek' }
  }
  // 'auto', empty, stale drafting pins, and every removed choice coerce to
  // the Entrim Qwen default.
  return { aiProvider: BRIEF_DEFAULT_PROVIDER }
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
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) text = text.slice(firstBrace, lastBrace + 1)

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
 *   1. PRIMARY — the operator's choice: Claude Opus 5 (Run BiOS, default),
 *      Grok, or DeepSeek V4 Flash (Run BiOS / Baseten). Exclusive (no cascade).
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
  skipQualityContract?: boolean
}): Promise<BriefTextResult> {
  const fallback = resolveBriefFallback()
  // When the operator explicitly selected Grok, the fallback and the primary
  // are the same backend — there is no second leg to try.
  const primaryIsFallback =
    String(opts.aiProvider || '').trim().toLowerCase() === BRIEF_FALLBACK_PROVIDER
  const primaryPin = String(opts.aiProvider || '').trim().toLowerCase()
  const primaryIsRunbios = primaryPin.startsWith('runbios-')
  const primaryLabel = primaryIsFallback
    ? 'Grok'
    : primaryPin === BRIEF_DEFAULT_PROVIDER
      ? 'Qwen3.8 27B (Entrim)'
      : primaryPin === BRIEF_CLAUDE_PROVIDER
        ? 'Claude Opus 5 (Run BiOS)'
        : primaryPin === 'runbios-deepseek-flash'
          ? 'DeepSeek V4 Flash (Run BiOS)'
          : primaryPin === 'baseten-deepseek'
            ? 'DeepSeek V4 Flash (Baseten)'
            : primaryPin === 'entrim-deepseek'
              ? 'DeepSeek V4 Flash (Entrim)'
              : primaryPin === BRIEF_ENTRIM_QWEN_PROVIDER
                ? 'Qwen3.8 27B (Entrim)'
                : 'Qwen3.8 27B (Entrim)'
  try {
    const ai = await generateContentText({
      aiProvider: opts.aiProvider,
      model: opts.model,
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      // Reasoning-model lanes need minutes — never let an unset short
      // deadline cut the brief. Run BiOS lifts to its 10-minute floor;
      // Entrim (Qwen3.8 27B / DeepSeek) leaves the brief routinely at
      // 180s+. cascadeOnCapacity lets a first timeout/overload (e.g. an
      // Entrim 524 upstream gateway timeout) fall through to the next
      // configured provider instead of failing the brief outright — the
      // named fallback chain below catches the rest.
      timeoutMs:
        primaryIsRunbios || primaryPin.startsWith('entrim-')
          ? Math.max(opts.timeoutMs ?? 0, primaryIsRunbios ? 600_000 : 180_000)
          : opts.timeoutMs,
      ...(primaryIsRunbios || primaryPin.startsWith('entrim-') ? { cascadeOnCapacity: true } : {}),
      exclusive: true,
      skipQualityContract: opts.skipQualityContract,
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
    // Fallback chain: the DeepSeek V4 Flash family on Entrim first (same
    // vault key the primary uses — the resilient upstream that has proven
    // itself for briefs), then Grok. Each leg runs exclusively; failures
    // accumulate into one combined error so the operator sees exactly which
    // backends died and why (e.g. "524 gateway timeout" vs "403 credits").
    const legs: Array<{ aiProvider: string; label: string }> = []
    if (isEntrimConfigured() && primaryPin !== 'entrim-deepseek') {
      legs.push({ aiProvider: 'entrim-deepseek', label: 'DeepSeek V4 Flash (Entrim)' })
    }
    const grokAlreadyPrimary = primaryIsFallback
    if (!grokAlreadyPrimary && !legs.some((l) => l.aiProvider === fallback.aiProvider)) {
      legs.push({ aiProvider: fallback.aiProvider, label: 'Grok' })
    }
    const msgs: string[] = []
    for (const leg of legs) {
      try {
        const ai = await generateContentText({
          aiProvider: leg.aiProvider,
          system: opts.system,
          prompt: opts.prompt,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
          timeoutMs: leg.aiProvider.startsWith('entrim-')
            ? Math.max(opts.timeoutMs ?? 0, 180_000)
            : opts.timeoutMs,
          exclusive: true,
          skipQualityContract: opts.skipQualityContract,
        })
        return { ai, fallbackUsed: true }
      } catch (legErr) {
        const legMsg = legErr instanceof Error ? legErr.message : String(legErr)
        msgs.push(`Fallback (${leg.label}): ${legMsg.slice(0, 300)}.`)
      }
    }
    throw new Error(
      `Brief generation failed. Primary (${primaryLabel}): ${primaryMsg.slice(0, 300)}. ${msgs.join(' ')}`,
    )
  }
}
