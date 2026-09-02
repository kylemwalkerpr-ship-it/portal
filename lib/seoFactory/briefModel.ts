/**
 * Brief-stage model policy (2026-09-02 live policy) — TWO families, both on
 * Entrim (api.entrim.ai/v1, shared ENTRIM vault row):
 *   1. Entrim Qwen3.6 27B (`entrim-qwen-27b`) — the DEFAULT. It consumes all
 *      Discover intelligence.
 *   2. Entrim DeepSeek V4 Flash (`entrim-deepseek`) — second Entrim family.
 * 'auto', empty, stale, or unrecognized pins coerce to the Entrim Qwen
 * default. No other Brief choice exists.
 *
 * Retired pins (Claude Opus via Run BiOS, Grok, Run BiOS/Baseten DeepSeek)
 * are kept as recognized aliases only so a stale picker selection still
 * RESOLVES — but every non-Entrim resolution redirects to the Entrim default,
 * because generateContentText enforces the same Entrim-only live policy.
 *
 * FALLBACK: when the primary Entrim family fails, the only fallback leg is
 * the other Entrim family (DeepSeek V4 Flash) — same vault key, first-party
 * upstream. Grok is OUT OF COMMISSION and is never a brief leg.
 */

import { generateContentText, isEntrimConfigured, type ContentAiResult } from '@/lib/contentAiProvider'
import { canonicalizeRunbiosPin, isRunbiosPin } from '@/lib/runbiosCatalog'

/**
 * Legacy fallback constant — retained for import compatibility but NO LONGER
 * used as a brief leg: Grok is out of commission under the Entrim-only live
 * policy. The brief fallback is now the Entrim DeepSeek family.
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

export function resolveBriefAiProvider(rawProvider: string): BriefProviderChoice {
  const pin = String(rawProvider || '').trim().toLowerCase()
  // Entrim DeepSeek V4 Flash — second Entrim brief family (live policy).
  if (pin === 'entrim-deepseek') {
    return { aiProvider: 'entrim-deepseek' }
  }
  // Entrim Qwen3.6 27B — the graduated brief default (api.entrim.ai/v1).
  if (pin === BRIEF_ENTRIM_QWEN_PROVIDER || pin === 'qwen3.6-27b' || pin === 'qwen') {
    return { aiProvider: BRIEF_ENTRIM_QWEN_PROVIDER }
  }
  // EVERY other pin — Grok/xAI, Claude Opus (Run BiOS), Run BiOS/Baseten
  // DeepSeek, GPT aliases, 'auto', empty, stale drafting ids — is out of
  // commission and coerces to the Entrim Qwen default. resolveBriefAiProvider
  // stays a pure rename/coerce map; the runtime Entrim-only gate in
  // generateContentText is the second layer of enforcement.
  return { aiProvider: BRIEF_DEFAULT_PROVIDER }
}

/**
 * The fallback brief family — Entrim DeepSeek V4 Flash (the other live
 * Entrim model). Grok is retired; this is the only brief fallback leg.
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
  // Normalize the primary through the live-policy resolver FIRST: any
  // retired pin (Grok, Claude, Run BiOS/Baseten DeepSeek, GPT aliases) lands
  // on the Entrim Qwen default here, so the exclusive primary leg and the
  // fallback legs below only ever name the two live Entrim families.
  const resolved = resolveBriefAiProvider(opts.aiProvider)
  const primaryPin = resolved.aiProvider
  // When the operator explicitly selected the DeepSeek family, the fallback
  // and the primary are the same backend — there is no second leg to try.
  const primaryIsFallback = primaryPin === BRIEF_FALLBACK_PROVIDER
  const primaryLabel = primaryPin === 'entrim-deepseek'
    ? 'DeepSeek V4 Flash (Entrim)'
    : 'Qwen3.6 27B (Entrim)'
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
      // Entrim (Qwen3.6 27B / DeepSeek) leaves the brief routinely at
      // 180s+. cascadeOnCapacity lets a first timeout/overload (e.g. an
      // Entrim 524 upstream gateway timeout) fall through to the next
      // configured provider instead of failing the brief outright — the
      // named fallback chain below catches the rest.
      timeoutMs: primaryPin.startsWith('entrim-')
        ? Math.max(opts.timeoutMs ?? 0, 180_000)
        : opts.timeoutMs,
      ...(primaryPin.startsWith('entrim-') ? { cascadeOnCapacity: true } : {}),
      exclusive: true,
      skipQualityContract: opts.skipQualityContract,
    })
    // With only two Entrim families, the provider label in a success result
    // is always the primary — fallbackUsed stays false here.
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
    // Fallback chain: the OTHER Entrim family (DeepSeek V4 Flash, same
    // vault key — the resilient upstream that has proven itself for briefs).
    // Grok is out of commission and is never a leg. The leg runs
    // exclusively; failures accumulate into one combined error so the
    // operator sees exactly which backend died and why (e.g. "524 gateway
    // timeout" vs "429 overloaded").
    const legs: Array<{ aiProvider: string; label: string }> = []
    // Primary here is always the Qwen family (the DeepSeek-primary case threw
    // above), so the single live fallback leg is the DeepSeek family.
    if (isEntrimConfigured()) {
      legs.push({ aiProvider: 'entrim-deepseek', label: 'DeepSeek V4 Flash (Entrim)' })
    }
    const msgs: string[] = []
    for (const leg of legs) {
      try {
        const ai = await generateContentText({
          aiProvider: leg.aiProvider,
          // NEVER forward a model that a fallback leg does not own — a stale
          // primary model pin leaked into the Entrim leg on the deployed
          // worker (model=grok-4.6 → 400). Legs run on their provider
          // defaults only.
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
