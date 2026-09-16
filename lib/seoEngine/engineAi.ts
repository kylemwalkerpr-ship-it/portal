/**
 * Shared AI helper for the SEO Master Engine and Discover intel calls.
 *
 * The deterministic SEO engine remains the source of evidence/data. Its AI
 * harmonization is a bounded two-provider pair of the commissioned registry
 * (design §13 decision 3):
 *   LEAD        — Grok 4.6 (`grok`) over the retained xAI transport. It
 *                 consumes the complete engine result and reconciles titles,
 *                 keyword research/planning/clustering, sources, internal
 *                 and external links, H1/H2/H3, related questions, and
 *                 search intent without inventing or dropping verified
 *                 evidence.
 *   COMPLEMENT  — DeepSeek V4.1 Flash (`deepseek-v41-flash`) on the
 *                 first-party `api.deepseek.com` transport (upstream model
 *                 `deepseek-flash`). It runs in parallel on the same payload;
 *                 when the drafts disagree the Grok lead merges, keeping
 *                 deterministic engine evidence authoritative.
 *
 * The pair requires BOTH providers configured (`enginePairReady()`); without
 * either key it fails closed — there is NO single-lead degradation and no
 * Grok↔DeepSeek cross-fallback. Explicit commissioned pins stay single-model;
 * a legacy/unknown pin is a typed selection-required failure.
 */

import {
  generateContentText,
  refreshAiVault,
  type ContentAiOptions,
  type ContentAiResult,
} from '@/lib/contentAiProvider'
import {
  DEEPSEEK_V41_FLASH_PIN,
  GROK_PIN,
  ProviderSelectionRequiredError,
  canonicalCommissionedPin,
  commissionedProvider,
} from '@/lib/contentAiRegistry'
import {
  engineLegBreakerLabel,
  isEngineLegOpen,
  recordEngineLegFailure,
  recordEngineLegSuccess,
  type EnginePairLeg,
} from '@/lib/seoEngine/enginePairBreaker'

/** Discover-stage pair: Grok 4.6 (lead) + DeepSeek V4.1 Flash (complement).
 *  Both legs must be configured or the pair fails closed. */
export const ENGINE_LEAD_PROVIDER = GROK_PIN
export const ENGINE_COMPLEMENT_PROVIDER = DEEPSEEK_V41_FLASH_PIN
export const ENGINE_PAIR = 'engine-pair' as const

/** Breaker slots for the two commissioned legs (registry pins). */
const PAIR_LEAD_LEG: EnginePairLeg = GROK_PIN
const PAIR_COMPLEMENT_LEG: EnginePairLeg = DEEPSEEK_V41_FLASH_PIN

const PAIR_MAX_TOKENS = 4096
const HARMONY_MAX_TOKENS = 3072
/** Default lead deadline (10 min) applies ONLY when the caller set no
 *  explicit timeout. Caller-specified timeouts (e.g. knowledge ingest 25 s
 *  per item, planner briefs, outreach drafts) are HONORED — the old
 *  `Math.max(opts.timeoutMs, 600_000)` froze a whole 8-item ingest at ~1.4 h
 *  when one Entrim leg hung, blowing the daily cron's 20-min budget so later
 *  phases silently never ran. */
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

/**
 * Sync resolver used by tests and callers that already refreshed the vault.
 * Empty/'auto'/the pair sentinel resolve to the pair; a commissioned pin
 * resolves to itself; every legacy/unknown value fails closed with a typed
 * `ProviderSelectionRequiredError` (never a redirect).
 */
export function resolveEngineAiProvider(preferred?: string): string {
  const want = String(preferred || '').trim()
  if (!want || want === 'auto' || want === ENGINE_PAIR) {
    return ENGINE_PAIR
  }
  const pin = canonicalCommissionedPin(want)
  if (!pin) throw new ProviderSelectionRequiredError(want)
  return pin
}

export function enginePairReady(): boolean {
  // BOTH commissioned providers must be configured: Grok serves the lead and
  // first-party DeepSeek serves the complement. One key alone is NOT the pair
  // — there is no single-lead degradation (design §13 decision 3).
  return commissionedProvider(ENGINE_LEAD_PROVIDER).isConfigured()
    && commissionedProvider(ENGINE_COMPLEMENT_PROVIDER).isConfigured()
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

/** Statutes / official URLs that the complement found and the lead's winning text omitted. */
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
  // Label the actual legs that ran: the commissioned pair is the only
  // combination the policy allows — the tape reports exactly what executed.
  const lead = rollup.lead || commissionedProvider(ENGINE_LEAD_PROVIDER).apiModel
  const complement = rollup.complement || commissionedProvider(ENGINE_COMPLEMENT_PROVIDER).apiModel
  const bits = [`${lead} + ${complement} complement`]
  if (rollup.disagreed) bits.push('disagreed')
  if (rollup.merged) bits.push('merged')
  if (rollup.leadOnly) bits.push(`lead-only:${rollup.leadOnly}`)
  if (rollup.complementOnly) bits.push(`${complement}-only:${rollup.complementOnly}`)
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
  // The lead leg gets the pair's default deadline when the caller didn't
  // specify one; explicit caller timeouts always win.
  const leadTimeoutMs = opts.timeoutMs ?? PAIR_LEAD_MIN_TIMEOUT_MS

  // Leg readiness: both commissioned providers must be configured. A missing
  // key fails the pair closed with a readable reason — there is NO single-lead
  // degradation (design §13 decision 3).
  const lead = commissionedProvider(ENGINE_LEAD_PROVIDER)
  const complementProviderDef = commissionedProvider(ENGINE_COMPLEMENT_PROVIDER)
  const leadReady = lead.isConfigured()
  const complementReady = complementProviderDef.isConfigured()
  // Config gate: BOTH providers must be configured or the pair fails fast as
  // `config` before a single outbound request — no lead-only degradation.
  if (!leadReady || !complementReady) {
    throw new Error(
      `Engine pair failed. Lead (${lead.label}): ${leadReady ? 'ready' : 'not configured'}. ` +
        `Complement (${complementProviderDef.label}): ${complementReady ? 'ready' : 'not configured'}.`,
    )
  }
  const [leadSettled, complementSettled] = await Promise.all([
    runPairLeg(PAIR_LEAD_LEG, () => generateContentText({
      ...shared,
      ...(leadTimeoutMs != null ? { timeoutMs: leadTimeoutMs } : {}),
      aiProvider: lead.pin,
      maxTokens: opts.maxTokens ?? PAIR_MAX_TOKENS,
    })),
    runPairLeg(PAIR_COMPLEMENT_LEG, () => generateContentText({
      ...shared,
      aiProvider: complementProviderDef.pin,
      maxTokens: opts.maxTokens ?? PAIR_MAX_TOKENS,
    })),
  ])

  const leadResult = settledText(leadSettled)
  const complement = settledText(complementSettled)
  const leadErr = leadSettled.status === 'rejected'
    ? (leadSettled.reason instanceof Error ? leadSettled.reason.message : String(leadSettled.reason))
    : ''
  const complementErr = complementSettled.status === 'rejected'
    ? (complementSettled.reason instanceof Error ? complementSettled.reason.message : String(complementSettled.reason))
    : ''

  // No lead-only / complement-only degradation: the pair is a unit of two
  // commissioned providers, so any missing leg fails the whole pair closed.
  if (!leadResult || !complement) {
    throw new Error(
      `Engine pair failed. Lead (${lead.label}): ${leadErr.slice(0, 280) || 'empty'}. ` +
        `Complement (${complementProviderDef.label}): ${complementErr.slice(0, 280) || 'empty'}.`,
    )
  }

  const extras = harvestComplementExtras(leadResult.text, complement.text)
  const disagreed = textsDiffer(leadResult.text, complement.text)
  if (!disagreed) {
    return {
      text: leadResult.text,
      provider: ENGINE_LEAD_PROVIDER,
      model: `${leadResult.model} + ${complement.model}`,
      pair: {
        leadModel: leadResult.model,
        complementModel: complement.model,
        merged: false,
        leadOnly: false,
        complementOnly: false,
        disagreed: false,
        complementText: complement.text,
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
      maxTokens: Math.min(opts.maxTokens ?? HARMONY_MAX_TOKENS, HARMONY_MAX_TOKENS),
      system:
        `${opts.system}\n\nYou are the lead Master Engine reasoner (Grok 4.6). ` +
        `A complement model (DeepSeek V4.1 Flash) reviewed the same payload. Produce one final answer. ` +
        `Keep your structure, judgment, and priorities. Adopt complement facts, statutes, ` +
        `URLs, numbers, or blockers you missed when they match the payload. ` +
        `The deterministic engine evidence in the payload is authoritative — never ` +
        `invent, reorder, or drop verified titles, keywords, sources, links, ` +
        `headings, related questions, or search intent. Do not mention either model.` +
        (wantsJson(opts) ? ' If the original asked for JSON, return ONLY valid JSON.' : ''),
      prompt:
        `${opts.prompt}\n\n--- LEAD DRAFT ---\n${leadResult.text}\n\n--- COMPLEMENT DRAFT ---\n${complement.text}`,
    })
    const text = (harmony.text || '').trim()
    if (text) merged = harmony
  } catch {
    // Harmony is best-effort — the Grok lead's first pass still stands.
  }

  const chosen = wantsJson(opts) && complement
    ? pickJsonPreserving(leadResult, complement, merged)
    : (merged || leadResult)

  const extrasAfter = harvestComplementExtras(chosen.text, complement.text)
  return {
    text: chosen.text,
    provider: ENGINE_LEAD_PROVIDER,
    model: `${leadResult.model} + ${complement.model}`,
    pair: {
      leadModel: leadResult.model,
      complementModel: complement.model,
      merged: chosen === merged,
      leadOnly: false,
      complementOnly: false,
      disagreed: true,
      complementText: complement.text,
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
  if (asksPair) {
    // The pair is the only two-provider construct; it fails closed when
    // either commissioned key is missing. No single-lead degradation.
    return generateEnginePairText(opts)
  }

  const primary = resolveEngineAiProvider(opts.aiProvider)
  if (primary === ENGINE_PAIR) {
    return generateEnginePairText(opts)
  }

  // Explicit commissioned pins stay single-model and exclusive: a failure is
  // final — never a cross-provider fallback.
  return generateContentText({
    ...opts,
    aiProvider: primary,
    exclusive: true,
    cascadeOnCapacity: false,
  })
}
