/**
 * Brief-stage model policy — COMMISSIONED PAIR (P2, 2026-09-15).
 *
 * Exactly two brief owners exist, resolved through the canonical registry:
 *   1. Grok 4.6 (`grok`) — the lane DEFAULT when the job has no requested
 *      provider (empty / 'auto').
 *   2. DeepSeek V4.1 Flash (`deepseek-v41-flash`) — first-party
 *      `api.deepseek.com` only.
 *
 * Every other value — retired pins (Entrim, NVIDIA, Baseten, Parasail,
 * Run BiOS, GPT aliases, …) and stale drafting ids — raises a typed
 * `ProviderSelectionRequiredError`; there is NO coercion to a default.
 *
 * The model chosen at Generate Full Brief is the contract OWNER for that
 * article until ship-ready, and the owner leg is EXCLUSIVE: a failure of the
 * owner provider fails the brief — it never cross-falls back to the other
 * commissioned provider.
 */

import { generateContentText, type ContentAiResult } from '@/lib/contentAiProvider'
import {
  GROK_PIN,
  ProviderSelectionRequiredError,
  resolveExecutionProvider,
  type CommissionedProviderPin,
} from '@/lib/contentAiRegistry'

/** Brief lane default pin — Grok 4.6 (paid SuperGrok studio default). */
export const BRIEF_DEFAULT_PROVIDER = GROK_PIN

export type BriefProviderChoice = { aiProvider: CommissionedProviderPin; model?: undefined }

export function resolveBriefAiProvider(rawProvider: string): BriefProviderChoice {
  // Canonical registry selector: explicit commissioned pin wins; ONLY
  // missing/empty/'auto' take the recorded lane default. Explicit sentinels
  // ('default', 'primary') and every legacy/retired/unknown value fail closed
  // with a typed selection-required error — there is no second default policy.
  const resolution = resolveExecutionProvider({ requestedPin: rawProvider, lane: 'brief' })
  if (resolution.kind === 'needs_selection') throw new ProviderSelectionRequiredError(resolution.legacyValue)
  return { aiProvider: resolution.pin }
}

export interface BriefTextResult {
  ai: ContentAiResult
  /** Retained for callers: a commissioned owner is exclusive, so never true. */
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
 * Generate the brief text through the single commissioned OWNER pin:
 * `resolveBriefAiProvider` rejects every legacy/unknown pin with a typed
 * `ProviderSelectionRequiredError` before any provider work. Exactly one leg
 * runs, exclusively (`exclusive: true`, `cascadeOnCapacity: false`) — an
 * owner failure throws; there is no Grok↔DeepSeek fallback leg.
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
  const resolved = resolveBriefAiProvider(opts.aiProvider)
  const ownerPin = resolved.aiProvider
  const ownerLabel = ownerPin === 'grok' ? 'Grok 4.6 (xAI)' : 'DeepSeek V4.1 Flash (first-party)'
  // A commissioned brief needs a real reasoning floor (1–3 minutes+).
  const ownerTimeoutMs = Math.max(opts.timeoutMs ?? 0, 180_000)
  try {
    const ai = await generateContentText({
      aiProvider: ownerPin,
      // NEVER forward a model that the owner leg does not set — the adapters
      // run on their registry API model only.
      system: opts.system,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      timeoutMs: ownerTimeoutMs,
      exclusive: true,
      cascadeOnCapacity: false,
      skipQualityContract: opts.skipQualityContract,
    })
    return {
      ai,
      fallbackUsed: false,
    }
  } catch (ownerErr) {
    const ownerMsg = ownerErr instanceof Error ? ownerErr.message : String(ownerErr)
    throw new Error(
      `Brief generation failed. Owner (${ownerLabel}): ${ownerMsg.slice(0, 300)}.`,
    )
  }
}
