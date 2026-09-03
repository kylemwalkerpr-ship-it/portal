/**
 * Brief-stage model policy (2026-09-02 live policy) — THREE families:
 *   1. Entrim Qwen3.6 27B (`entrim-qwen-27b`) — the DEFAULT. It consumes all
 *      Discover intelligence.
 *   2. Entrim DeepSeek V4 Flash (`entrim-deepseek`) — second Entrim family.
 *   3. Grok 4.6 (`grok`) — xAI / SuperGrok, the third live brief family.
 * 'auto', empty, stale, or unrecognized pins coerce to the Entrim Qwen
 * default. No other brief choice exists.
 *
 * The model chosen at Generate Full Brief is the contract OWNER for that
 * article until ship-ready. Retired pins (Claude Opus via Run BiOS, GLM,
 * MiniMax, Nemotron, GPT-5.6, Run BiOS/Baseten DeepSeek) are kept as
 * recognized aliases only so a stale picker selection still RESOLVES — but
 * every non-live resolution redirects to the Entrim default, because
 * generateContentText enforces the same live provider policy.
 *
 * FALLBACK: when the chosen brief family fails, the fallback is the Entrim
 * DeepSeek family (same vault key) or, for a Grok owner, back to the Entrim
 * default. All legs run exclusively.
 */

import { generateContentText, isEntrimConfigured, type ContentAiResult } from '@/lib/contentAiProvider'

/**
 * Legacy fallback constant — the brief fallback leg. Grok owners fall back to
 * the Entrim default rather than a second Grok leg.
 */
export const BRIEF_FALLBACK_PROVIDER = 'entrim-deepseek' as const

/** Brief lead pin — Entrim Qwen3.6 27B (graduated default). */
export const BRIEF_DEFAULT_PROVIDER = 'entrim-qwen-27b' as const

/** Retired: Claude Opus 5 via Run BiOS. Kept as a recognized legacy alias. */
export const BRIEF_CLAUDE_PROVIDER = 'runbios-claude-opus' as const

/** Entrim Qwen3.6 27B — first brief family (api.entrim.ai/v1). */
export const BRIEF_ENTRIM_QWEN_PROVIDER = 'entrim-qwen-27b' as const

export type BriefProviderChoice =
  | { aiProvider: typeof BRIEF_DEFAULT_PROVIDER; model?: undefined }
  | { aiProvider: 'entrim-deepseek'; model?: undefined }
  | { aiProvider: 'grok'; model?: undefined }

export function resolveBriefAiProvider(rawProvider: string): BriefProviderChoice {
  const pin = String(rawProvider || '').trim().toLowerCase()
  // Entrim DeepSeek V4 Flash — second live brief family (live policy).
  if (pin === 'entrim-deepseek') {
    return { aiProvider: 'entrim-deepseek' }
  }
  // Grok 4.6 / xAI / SuperGrok — the third live brief family.
  if (pin === 'grok' || pin === 'grok-4.6' || pin === 'xai' || pin === 'supergrok' || pin === 'super-grok') {
    return { aiProvider: 'grok' }
  }
  // Entrim Qwen3.6 27B — the graduated brief default (api.entrim.ai/v1).
  if (pin === BRIEF_ENTRIM_QWEN_PROVIDER || pin === 'qwen3.6-27b' || pin === 'qwen') {
    return { aiProvider: BRIEF_ENTRIM_QWEN_PROVIDER }
  }
  // EVERY other pin — Claude Opus (Run BiOS), Run BiOS/Baseten DeepSeek,
  // GLM, MiniMax, Nemotron, GPT aliases, 'auto', empty, stale drafting ids —
  // is out of commission and coerces to the Entrim Qwen default.
  return { aiProvider: BRIEF_DEFAULT_PROVIDER }
}

/**
 * The fallback brief family — Entrim DeepSeek V4 Flash (the other live
 * Entrim model). Used for a Qwen primary; a Grok primary also falls back to
 * the Entrim default.
 */
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
 *   1. PRIMARY — the operator's choice: Entrim Qwen3.6 27B (default), Entrim
 *      DeepSeek V4 Flash, or Grok 4.6. Exclusive (no cascade).
 *   2. FALLBACK — when the primary is Grok, fall back to the Entrim Qwen
 *      default; when the primary is an Entrim family, fall back to the other
 *      Entrim family (DeepSeek V4 Flash).
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
  // Normalize the primary through the live-policy resolver FIRST: any
  // retired pin (Claude, GLM, MiniMax, GPT aliases, Run BiOS/Baseten DeepSeek)
  // lands on the Entrim Qwen default here, so the exclusive primary leg and
  // the fallback legs below only ever name the three live families.
  const resolved = resolveBriefAiProvider(opts.aiProvider)
  const primaryPin = resolved.aiProvider
  // When the operator explicitly selected the DeepSeek family, the fallback
  // and the primary are the same backend — there is no second leg to try.
  const primaryIsFallback = primaryPin === BRIEF_FALLBACK_PROVIDER
  const isGrokPrimary = primaryPin === 'grok'
  const primaryLabel = primaryPin === 'entrim-deepseek'
    ? 'DeepSeek V4 Flash (Entrim)'
    : primaryPin === 'grok'
      ? 'Grok 4.6 (xAI)'
      : 'Qwen3.6 27B (Entrim)'
  // A Grok brief needs a real reasoning floor (1–3 minutes+); Entrim families
  // get 180s+ too. Non-live legs keep the caller's timeout.
  const ownerTimeoutMs = (primaryPin === 'grok' || primaryPin.startsWith('entrim-'))
    ? Math.max(opts.timeoutMs ?? 0, 180_000)
    : opts.timeoutMs
  try {
    const ai = await generateContentText({
      aiProvider: primaryPin,
      // NEVER forward a model that a leg does not own — a stale primary
      // model pin leaked into the Entrim leg on the deployed worker
      // (model=grok-4.6 → 400). Legs run on their provider defaults only.
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      timeoutMs: ownerTimeoutMs,
      // Owner mode: strictly exclusive — NO capacity cascade inside the
      // provider chain (the designated fallback leg below is the only
      // recovery path, so an Entrim owner is never silently served by Grok
      // or vice versa).
      exclusive: true,
      skipQualityContract: opts.skipQualityContract,
    })
    return {
      ai,
      fallbackUsed: false,
    }
  } catch (primaryErr) {
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    if (primaryIsFallback) {
      throw new Error(
        `Brief generation failed (DeepSeek V4 Flash on Entrim): ${primaryMsg.slice(0, 300)}.`,
      )
    }
    // Fallback legs. A Grok owner falls back to the Entrim Qwen default; an
    // Entrim Qwen owner falls back to the DeepSeek family. The leg runs
    // exclusively; failures accumulate into one combined error so the
    // operator sees exactly which backend died and why.
    const legs: Array<{ aiProvider: string; label: string }> = []
    if (isGrokPrimary) {
      if (isEntrimConfigured()) {
        legs.push({ aiProvider: 'entrim-qwen-27b', label: 'Qwen3.6 27B (Entrim)' })
      }
    } else if (isEntrimConfigured()) {
      legs.push({ aiProvider: 'entrim-deepseek', label: 'DeepSeek V4 Flash (Entrim)' })
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
