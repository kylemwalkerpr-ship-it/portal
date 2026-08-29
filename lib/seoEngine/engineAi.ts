/**
 * Shared AI helper for the SEO Master Engine and Discover intel calls.
 *
 * The deterministic SEO engine remains the source of evidence/data. Its AI
 * harmonization is a bounded two-model pair:
 *   LEAD        — Claude Opus 5 via Run BiOS (`runbios-claude-opus`). It
 *                 consumes the complete engine result and reconciles titles,
 *                 keyword research/planning/clustering, sources, internal and
 *                 external links, H1/H2/H3, related questions, and search
 *                 intent without inventing or dropping verified evidence.
 *   COMPLEMENT  — Grok (xAI / SuperGrok). It runs in parallel on the same
 *                 payload; when the drafts disagree the lead merges, keeping
 *                 deterministic engine evidence authoritative.
 * No other model silently joins the pair. Explicit pins stay single-model.
 */

import {
  generateContentText,
  isGrokConfigured,
  isOpenaiConfigured,
  isRunbiosConfigured,
  refreshAiVault,
  type ContentAiOptions,
  type ContentAiResult,
} from '@/lib/contentAiProvider'
import {
  engineLegBreakerLabel,
  isEngineLegOpen,
  recordEngineLegFailure,
  recordEngineLegSuccess,
  type EnginePairLeg,
} from '@/lib/seoEngine/enginePairBreaker'

export const ENGINE_FALLBACK_PROVIDER = 'grok' as const
export const ENGINE_LEAD_PROVIDER = 'runbios-claude-opus' as const
export const ENGINE_LEAD_MODEL = 'claude-opus-5' as const
export const ENGINE_COMPLEMENT_PROVIDER = 'grok' as const
export const ENGINE_PAIR = 'engine-pair' as const

const PAIR_MAX_TOKENS = 4096
const HARMONY_MAX_TOKENS = 3072
/** Claude Opus 5 harmonization can take minutes on long Discover payloads —
 *  never cut the Run BiOS lead mid-thought; floor at the Run BiOS deadline. */
const PAIR_LEAD_MIN_TIMEOUT_MS = 600_000

export interface EnginePairExtras {
  statutes: string[]
  urls: string[]
}

export interface EnginePairMeta {
  leadModel: string
  complementModel: string | null
  merged: boolean
  leadOnly: boolean
  complementOnly: boolean
  disagreed: boolean
  complementText?: string
  extras?: EnginePairExtras
}

export interface EnginePairRollup {
  calls: number
  merged: number
  disagreed: number
  leadOnly: number
  complementOnly: number
  extrasKept: number
  lead?: string
  complement?: string
}

export type EngineTextResult = ContentAiResult & { pair?: EnginePairMeta }

/** Sync resolver used by tests and callers that already refreshed the vault. */
export function resolveEngineAiProvider(preferred?: string): string {
  const want = String(preferred || '').trim()
  if (!want || want === 'auto' || want === ENGINE_PAIR) {
    return ENGINE_PAIR
  }
  if (want === ENGINE_FALLBACK_PROVIDER) return ENGINE_FALLBACK_PROVIDER
  if (want === 'openai' && !isOpenaiConfigured()) {
    if (isGrokConfigured()) return ENGINE_FALLBACK_PROVIDER
  }
  return want
}

export function enginePairReady(): boolean {
  return isRunbiosConfigured() || isGrokConfigured()
}

export function extractEngineJsonObject(text: string): Record<string, unknown> | null {
  const raw = (text || '').trim()
  if (!raw) return null
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/g, '').trim()
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const obj = JSON.parse(unfenced.slice(start, end + 1))
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj as Record<string, unknown> : null
  } catch {
    return null
  }
}

function settledText(result: PromiseSettledResult<ContentAiResult>): ContentAiResult | null {
  if (result.status !== 'fulfilled') return null
  const text = (result.value.text || '').trim()
  return text ? result.value : null
}

function textsDiffer(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, ' ').trim()
  const nb = b.replace(/\s+/g, ' ').trim()
  if (!na || !nb) return false
  if (na === nb) return false
  return na.slice(0, 240) !== nb.slice(0, 240) || Math.abs(na.length - nb.length) > 80
}

function wantsJson(opts: { system?: string; prompt?: string }): boolean {
  const blob = `${opts.system || ''}\n${opts.prompt || ''}`
  return /\bjson\b/i.test(blob) && /\{/.test(blob)
}

const STATUTE_RE =
  /\b(?:INA\s*(?:§|section)?\s*\d+(?:\([a-z0-9]+\))*|8\s*C\.?F\.?R\.?\s*§?\s*[\d.]+|Immigration Rules(?:\s+Appendix\s+[A-Z0-9]+)?|Appendix FM|IRPA|IRPR|Migration Act(?:\s+\d{4})?|British Nationality Act|Citizenship Act|Form\s+[IN]-?\d+)/gi
const URL_RE = /https?:\/\/[^\s)\]>'"]+/gi

function uniqueNormalized(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const v = raw.replace(/[.,;:]+$/, '').trim()
    const key = v.toLowerCase()
    if (!v || seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

/** Statutes / official URLs that Grok found and the Opus lead's winning text omitted. */
export function harvestComplementExtras(leadText: string, complementText: string): EnginePairExtras {
  const lead = String(leadText || '')
  const complement = String(complementText || '')
  if (!complement.trim()) return { statutes: [], urls: [] }
  const leadLower = lead.toLowerCase()
  const statutes = uniqueNormalized(complement.match(STATUTE_RE) || []).filter((s) => !leadLower.includes(s.toLowerCase()))
  const urls = uniqueNormalized(complement.match(URL_RE) || []).filter((u) => !leadLower.includes(u.toLowerCase()))
  return { statutes, urls }
}

export function emptyPairRollup(): EnginePairRollup {
  return { calls: 0, merged: 0, disagreed: 0, leadOnly: 0, complementOnly: 0, extrasKept: 0 }
}

export function accumulatePairRollup(rollup: EnginePairRollup, meta?: EnginePairMeta | null): EnginePairRollup {
  if (!meta) return rollup
  rollup.calls += 1
  if (meta.merged) rollup.merged += 1
  if (meta.disagreed) rollup.disagreed += 1
  if (meta.leadOnly) rollup.leadOnly += 1
  if (meta.complementOnly) rollup.complementOnly += 1
  const extraCount = (meta.extras?.statutes.length || 0) + (meta.extras?.urls.length || 0)
  if (extraCount) rollup.extrasKept += extraCount
  if (meta.leadModel) rollup.lead = meta.leadModel
  if (meta.complementModel) rollup.complement = meta.complementModel
  return rollup
}

export function formatEnginePairTape(rollup: EnginePairRollup | null | undefined): string {
  if (!rollup || rollup.calls <= 0) return ''
  const bits = ['Claude Opus 5 + Grok complement']
  if (rollup.disagreed) bits.push('disagreed')
  if (rollup.merged) bits.push('merged')
  if (rollup.leadOnly) bits.push(`lead-only:${rollup.leadOnly}`)
  if (rollup.complementOnly) bits.push(`grok-only:${rollup.complementOnly}`)
  if (rollup.extrasKept) bits.push(`extras:${rollup.extrasKept}`)
  return bits.join(', ')
}

function pickJsonPreserving(lead: ContentAiResult, complement: ContentAiResult, merged: ContentAiResult | null): ContentAiResult {
  if (merged && extractEngineJsonObject(merged.text)) return merged
  if (extractEngineJsonObject(lead.text)) return lead
  if (extractEngineJsonObject(complement.text)) return complement
  return merged || lead
}

async function runPairLeg(
  leg: EnginePairLeg,
  run: () => Promise<ContentAiResult>,
): Promise<PromiseSettledResult<ContentAiResult>> {
  if (isEngineLegOpen(leg)) {
    return { status: 'rejected', reason: new Error(engineLegBreakerLabel(leg) || `${leg} circuit-open`) }
  }
  try {
    const value = await run()
    recordEngineLegSuccess(leg)
    return { status: 'fulfilled', value }
  } catch (reason) {
    recordEngineLegFailure(leg)
    return { status: 'rejected', reason }
  }
}

export async function generateEnginePairText(
  opts: Omit<ContentAiOptions, 'exclusive'> & { aiProvider?: string },
): Promise<EngineTextResult> {
  const shared = {
    system: opts.system,
    prompt: opts.prompt,
    temperature: opts.temperature,
    skipQualityContract: opts.skipQualityContract !== false,
    exclusive: true as const,
  }
  // The Run BiOS Opus lead gets the 10-minute floor; omitting timeoutMs lets
  // deadlineForProvider apply the same floor. Grok keeps its own provider
  // deadline floor (180s) when no explicit timeout is passed.
  const leadTimeoutMs =
    opts.timeoutMs != null ? Math.max(opts.timeoutMs, PAIR_LEAD_MIN_TIMEOUT_MS) : undefined

  // Skip a dead complement: when Grok is not configured, do not fire a leg
  // that can only fail (and trip its circuit breaker). Same for a lead with
  // no Run BiOS key — complement-only proceeds.
  const leadReady = isRunbiosConfigured()
  const complementReady = isGrokConfigured()
  const notConfigured = (label: string) =>
    ({ status: 'rejected', reason: new Error(`${label}: not configured`) }) as PromiseSettledResult<ContentAiResult>

  const [leadSettled, complementSettled] = await Promise.all([
    leadReady
      ? runPairLeg('runbios-opus', () => generateContentText({
          ...shared,
          ...(leadTimeoutMs != null ? { timeoutMs: leadTimeoutMs } : {}),
          aiProvider: ENGINE_LEAD_PROVIDER,
          model: ENGINE_LEAD_MODEL,
          maxTokens: opts.maxTokens ?? PAIR_MAX_TOKENS,
        }))
      : Promise.resolve(notConfigured('Claude Opus 5 (Run BiOS)')),
    complementReady
      ? runPairLeg('grok', () => generateContentText({
          ...shared,
          aiProvider: ENGINE_COMPLEMENT_PROVIDER,
          maxTokens: opts.maxTokens ?? PAIR_MAX_TOKENS,
        }))
      : Promise.resolve(notConfigured('Grok (xAI)')),
  ])

  const lead = settledText(leadSettled)
  const complement = settledText(complementSettled)
  const leadErr = leadSettled.status === 'rejected'
    ? (leadSettled.reason instanceof Error ? leadSettled.reason.message : String(leadSettled.reason))
    : ''
  const complementErr = complementSettled.status === 'rejected'
    ? (complementSettled.reason instanceof Error ? complementSettled.reason.message : String(complementSettled.reason))
    : ''

  if (lead && !complement) {
    return {
      ...lead,
      model: `${lead.model} · pair (Grok unavailable)`,
      pair: {
        leadModel: lead.model,
        complementModel: null,
        merged: false,
        leadOnly: true,
        complementOnly: false,
        disagreed: false,
        extras: { statutes: [], urls: [] },
      },
    }
  }
  if (!lead && complement) {
    return {
      ...complement,
      model: `${complement.model} · pair (Run BiOS Opus unavailable)`,
      pair: {
        leadModel: ENGINE_LEAD_PROVIDER,
        complementModel: complement.model,
        merged: false,
        leadOnly: false,
        complementOnly: true,
        disagreed: false,
        complementText: complement.text,
        extras: harvestComplementExtras('', complement.text),
      },
    }
  }
  if (!lead && !complement) {
    throw new Error(
      `Engine pair failed. Lead (Claude Opus 5 via Run BiOS): ${leadErr.slice(0, 280) || 'empty'}. ` +
        `Complement (Grok via xAI): ${complementErr.slice(0, 280) || 'empty'}.`,
    )
  }

  const extras = harvestComplementExtras(lead!.text, complement!.text)
  const disagreed = textsDiffer(lead!.text, complement!.text)
  if (!disagreed) {
    return {
      text: lead!.text,
      provider: ENGINE_LEAD_PROVIDER,
      model: `${lead!.model} + ${complement!.model}`,
      pair: {
        leadModel: lead!.model,
        complementModel: complement!.model,
        merged: false,
        leadOnly: false,
        complementOnly: false,
        disagreed: false,
        complementText: complement!.text,
        extras,
      },
    }
  }

  let merged: ContentAiResult | null = null
  try {
    const harmony = await generateContentText({
      ...shared,
      ...(leadTimeoutMs != null ? { timeoutMs: leadTimeoutMs } : {}),
      aiProvider: ENGINE_LEAD_PROVIDER,
      model: ENGINE_LEAD_MODEL,
      maxTokens: Math.min(opts.maxTokens ?? HARMONY_MAX_TOKENS, HARMONY_MAX_TOKENS),
      system:
        `${opts.system}\n\nYou are the lead Master Engine reasoner (Claude Opus 5). ` +
        `A complement model (Grok) reviewed the same payload. Produce one final answer. ` +
        `Keep your structure, judgment, and priorities. Adopt complement facts, statutes, ` +
        `URLs, numbers, or blockers you missed when they match the payload. ` +
        `The deterministic engine evidence in the payload is authoritative — never ` +
        `invent, reorder, or drop verified titles, keywords, sources, links, ` +
        `headings, related questions, or search intent. Do not mention either model.` +
        (wantsJson(opts) ? ' If the original asked for JSON, return ONLY valid JSON.' : ''),
      prompt:
        `${opts.prompt}\n\n--- LEAD DRAFT ---\n${lead!.text}\n\n--- COMPLEMENT DRAFT ---\n${complement!.text}`,
    })
    const text = (harmony.text || '').trim()
    if (text) merged = harmony
  } catch {
    // Harmony is best-effort — the Opus lead's first pass still stands.
  }

  const chosen = wantsJson(opts) && complement
    ? pickJsonPreserving(lead!, complement, merged)
    : (merged || lead!)

  const extrasAfter = harvestComplementExtras(chosen.text, complement!.text)
  return {
    text: chosen.text,
    provider: ENGINE_LEAD_PROVIDER,
    model: `${ENGINE_LEAD_MODEL} + ${complement!.model}`,
    pair: {
      leadModel: lead!.model,
      complementModel: complement!.model,
      merged: chosen === merged,
      leadOnly: false,
      complementOnly: false,
      disagreed: true,
      complementText: complement!.text,
      extras: extrasAfter,
    },
  }
}

export async function generateEngineText(
  opts: Omit<ContentAiOptions, 'exclusive'> & { aiProvider?: string },
): Promise<EngineTextResult> {
  await refreshAiVault()
  const want = String(opts.aiProvider || '').trim()
  const asksPair = !want || want === 'auto' || want === ENGINE_PAIR
  if (asksPair && enginePairReady()) {
    return generateEnginePairText(opts)
  }

  const primary = asksPair
    ? ENGINE_LEAD_PROVIDER
    : resolveEngineAiProvider(opts.aiProvider)

  if (primary === ENGINE_PAIR) {
    return generateEnginePairText(opts)
  }

  try {
    return await generateContentText({
      ...opts,
      aiProvider: primary,
      exclusive: true,
    })
  } catch (primaryErr) {
    if (primary === ENGINE_FALLBACK_PROVIDER) throw primaryErr
    const primaryMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr)
    try {
      return await generateContentText({
        ...opts,
        aiProvider: ENGINE_FALLBACK_PROVIDER,
        exclusive: true,
      })
    } catch (fallbackErr) {
      const fallbackMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
      throw new Error(
        `Engine AI failed. Primary (${primary}): ${primaryMsg.slice(0, 280)}. ` +
          `Fallback (Grok): ${fallbackMsg.slice(0, 280)}.`,
      )
    }
  }
}
