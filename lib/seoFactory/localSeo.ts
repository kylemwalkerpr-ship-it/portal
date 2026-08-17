/**
 * lib/seoFactory/localSeo.ts
 *
 * LOCAL SEO MODULE — Subsystem J (Local SEO Signals).
 *
 * Lane-2 LLM judgment over the local-visibility dimensions a deterministic
 * crawler cannot fully grade: Google Business Profile completeness (quality,
 * not just presence), NAP consistency, local citation authority, proximity
 * relevance, geo-relevance of the landing page, city/region content depth,
 * LocalBusiness schema completeness, local backlink relevance and alignment
 * with local search demand.
 *
 * Feeds the `eeat` subsystem — the same home as the engine's deterministic
 * "Local SEO Layer" signals (e_nap_consistency, e_gbp_profile,
 * e_local_citations) — so the LLM judgment lands beside its deterministic
 * siblings.
 *
 * Same discipline as lib/seoFactory/contentQuality.ts / semanticNlp.ts /
 * eeatTrust.ts / competitiveGap.ts:
 *   • Structured JSON only (regex is fallback-only, flagged `malformed_json`).
 *   • Every variable carries `evidence` + `confidence` — never a bare number.
 *   • Truthful provenance — `model_used` is the ACTUAL provider:model.
 *   • One well-scoped call per page (the multi-engine consensus pattern is
 *     citation-only and is NOT generalized here).
 *   • `buildLocalActions` is a pure, deterministic rules engine — zero LLM calls.
 */

import { generateContentText } from '@/lib/contentAiProvider'

/** The explicit Local SEO judgment variables from the taxonomy (Subsystem J,
 *  items 576–620) — the LLM-judgment subset. Deterministic presence checks the
 *  crawler already owns stay in Lane-1 and are only *interpreted* here. */
export const LOCAL_VARIABLES: ReadonlyArray<{
  id: number
  name: string
  desc: string
}> = [
  { id: 576, name: 'gbp_completeness', desc: 'Google Business Profile completeness (quality, not just presence)' },
  { id: 584, name: 'nap_consistency', desc: 'Name / Address / Phone consistency across the web' },
  { id: 585, name: 'local_citation_authority', desc: 'local citation volume + authority (interpret Lane-1, never guess a number)' },
  { id: 588, name: 'proximity_relevance', desc: 'relevance to the searcher\'s location' },
  { id: 590, name: 'geo_relevance', desc: 'local landing page geo-relevance' },
  { id: 591, name: 'regional_content_depth', desc: 'city / region-specific content depth (local fees, offices, timelines)' },
  { id: 592, name: 'local_business_schema', desc: 'LocalBusiness schema completeness (NAP + geo)' },
  { id: 606, name: 'local_link_relevance', desc: 'local backlink relevance (geo-targeted domains)' },
  { id: 610, name: 'local_demand_alignment', desc: 'alignment with local search demand / seasonal local queries' },
]

export interface LocalVariable {
  id: number
  name: string
  score: number | null
  evidence: string
  confidence: number
}

export interface LocalGapSummary {
  missing_local_signals: string[]
  top_competitor_url: string | null
  top_competitor_local_score: number | null
}

export interface LocalSeoResult {
  page_url: string
  subsystem: 'local_seo'
  model_used: string
  scored_at: string
  variables: LocalVariable[]
  local_gap_summary: LocalGapSummary
  flags: string[]
}

/** Lane-1 deterministic facts the rules engine (and the LLM, as context)
 *  needs — already computed by the crawler, never re-derived by the model. */
export interface LocalLane1 {
  region?: string
  hasContactInfo?: boolean
  hasLocalSchema?: boolean
}

export interface LocalAction {
  priority: number
  action: string
  evidence: string
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v || '')
}

function variableListBlock(): string {
  return LOCAL_VARIABLES.map((v) => `- ${v.id} ${v.name}: ${v.desc}`).join('\n')
}

const LOCAL_SYSTEM_PROMPT = `You are a scoring module in an SEO analysis engine. You will be given the cleaned text of a target page, up to 10 top-ranking competitor pages, and deterministic tool data (JSON: the target region, whether the page exposes contact info, whether LocalBusiness schema markup is present).

Score ONLY the variables listed below. For each, return a value 0.0–1.0 plus a one-sentence justification citing specific evidence from the provided text. Do NOT estimate variables not listed. Do NOT invent data not present in the input. If evidence is insufficient to score a variable, return null for score and say why.

For "local_citation_authority" do NOT invent a citation count — interpret the TOOL DATA contact/schema facts against the competitors' apparent local footprint from their text, and say so in the evidence.

Output valid JSON only — no markdown, no prose outside the JSON — exactly matching this schema:
{
  "variables": [
    { "id": 576, "name": "gbp_completeness", "score": 0.0, "evidence": "one sentence citing the text", "confidence": 0.0 }
  ],
  "local_gap_summary": {
    "missing_local_signals": ["string"],
    "top_competitor_url": "string",
    "top_competitor_local_score": 0.0
  },
  "flags": ["weak_local_presence"]
}

Rules:
- "local_gap_summary.missing_local_signals" is what top competitors demonstrate for local visibility that the page does not (e.g. "city-specific pages", "verified Google Business Profile", "consistent NAP across directories"). Empty array if none.
- "local_gap_summary.top_competitor_url" is the single strongest local competitor URL (or null).
- "local_gap_summary.top_competitor_local_score" is that competitor's overall local-visibility standing 0.0–1.0 (or null if unknown).
- "confidence" is 0.0–1.0 for how certain you are of that variable's score.
- Return ONLY the JSON.

VARIABLES FOR THIS CALL:
${variableListBlock()}`

interface ParsedLocalResponse {
  variables: LocalVariable[]
  local_gap_summary: LocalGapSummary
  flags: string[]
  answerText: string
}

/**
 * Parse the model's reply into structured evidence. Prefers the JSON contract;
 * falls back to a flagged empty result so a bad model never throws.
 */
export function parseLocalSeoResponse(text: string): ParsedLocalResponse {
  const raw = (text || '').trim()
  const emptyGap: LocalGapSummary = { missing_local_signals: [], top_competitor_url: null, top_competitor_local_score: null }

  const fence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fence.slice(start, end + 1)) as Record<string, unknown>
      const rawVars = Array.isArray(obj.variables) ? (obj.variables as Array<Record<string, unknown>>) : []
      const byName = new Map(LOCAL_VARIABLES.map((v) => [v.name, v.id]))
      const variables: LocalVariable[] = []
      for (const rv of rawVars) {
        const name = asString(rv.name || '')
        const id = Number(rv.id) || byName.get(name) || 0
        if (!id) continue
        const scoreRaw = rv.score
        const score = scoreRaw == null || scoreRaw === '' ? null : clamp01(Number(scoreRaw))
        variables.push({
          id,
          name: name || (LOCAL_VARIABLES.find((v) => v.id === id)?.name ?? String(id)),
          score,
          evidence: asString(rv.evidence || '').slice(0, 300),
          confidence: clamp01(Number(rv.confidence) || 0),
        })
      }
      const gap = (obj.local_gap_summary || {}) as Record<string, unknown>
      const missing = Array.isArray(gap.missing_local_signals) ? gap.missing_local_signals.map(asString).filter(Boolean).slice(0, 20) : []
      const topUrl = gap.top_competitor_url ? asString(gap.top_competitor_url) : null
      const topScore = gap.top_competitor_local_score == null ? null : clamp01(Number(gap.top_competitor_local_score))
      const flags = Array.isArray(obj.flags) ? obj.flags.map(asString).filter(Boolean).slice(0, 10) : []
      return {
        variables,
        local_gap_summary: {
          missing_local_signals: missing,
          top_competitor_url: topUrl,
          top_competitor_local_score: Number.isFinite(topScore) ? topScore : null,
        },
        flags,
        answerText: raw,
      }
    } catch {
      /* fall through to the flagged fallback */
    }
  }

  return { variables: [], local_gap_summary: emptyGap, flags: ['malformed_json'], answerText: raw }
}

/** Average the scored variables (confidence-weighted, GBP completeness +
 *  NAP consistency + regional depth favored). */
export function localSeoComposite(result: LocalSeoResult): number | null {
  const scored = result.variables.filter((v) => v.score != null)
  if (!scored.length) return null
  const w = (id: number) => (id === 576 || id === 584 || id === 591 ? 2 : 1)
  const weighted = scored.reduce((a, v) => a + (v.score as number) * w(v.id) * (0.5 + v.confidence * 0.5), 0)
  const wsum = scored.reduce((a, v) => a + w(v.id) * (0.5 + v.confidence * 0.5), 0)
  return clamp01(weighted / wsum)
}

/** Average confidence across scored variables (0 when none). */
export function localConfidenceAvg(result: LocalSeoResult): number {
  const scored = result.variables.filter((v) => v.score != null)
  return scored.length ? scored.reduce((a, v) => a + v.confidence, 0) / scored.length : 0
}

function varScore(result: LocalSeoResult, id: number): number | null {
  const v = result.variables.find((x) => x.id === id)
  return v ? v.score : null
}

/**
 * Deterministic, prioritized fixes over the scored result + Lane-1 facts.
 * PURE — zero LLM calls.
 */
export function buildLocalActions(result: LocalSeoResult, lane1?: LocalLane1): LocalAction[] {
  const out: LocalAction[] = []
  const flags = new Set(result.flags || [])
  const missing = result.local_gap_summary?.missing_local_signals || []
  const top = result.local_gap_summary?.top_competitor_url || null
  const nap = varScore(result, 584)
  const regionalDepth = varScore(result, 591)
  const schema = varScore(result, 592)

  if (missing.length || flags.has('weak_local_presence')) {
    out.push({
      priority: 4,
      action: `Adopt the local signals competitors already demonstrate: ${missing.slice(0, 6).join(' · ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}`,
      evidence: top ? `Local gap vs ${top}` : `${missing.length} local signal(s) the competition holds that the page lacks`,
    })
  }

  if (nap != null && nap < 0.5) {
    out.push({
      priority: 3,
      action: 'Standardize Name / Address / Phone consistently across citations and the contact block',
      evidence: `NAP consistency ${Math.round(nap * 100)}/100 — inconsistent local identity across the web`,
    })
  }

  if (regionalDepth != null && regionalDepth < 0.5) {
    out.push({
      priority: 2,
      action: `Add ${lane1?.region ? `${lane1.region}-` : ''}specific content — local fees, processing offices, regional timelines competitors cover`,
      evidence: `Regional content depth ${Math.round(regionalDepth * 100)}/100 — the page stays generic where competitors localize`,
    })
  }

  if (schema != null && schema < 0.5) {
    out.push({
      priority: 2,
      action: 'Add LocalBusiness JSON-LD with NAP + geo coordinates so local entities are machine-readable',
      evidence: `LocalBusiness schema ${Math.round(schema * 100)}/100 — local entity markup is missing or incomplete`,
    })
  }

  if (lane1?.hasContactInfo === false) {
    out.push({
      priority: 2,
      action: 'Add a visible contact block (phone / address / email) for local trust',
      evidence: 'Deterministic crawl: no contact info detectable on the page',
    })
  }

  if (!out.length) {
    out.push({ priority: 1, action: 'Sustain — the local-visibility stack clears the SERP consensus', evidence: `GBP ${varScore(result, 576) == null ? '—' : Math.round((varScore(result, 576) as number) * 100)}/100` })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

/** Merge deterministic Lane-1 flags into the model's flags (never removed). */
function mergeFlags(modelFlags: string[], lane1?: LocalLane1): string[] {
  const flags = [...modelFlags]
  if (lane1?.hasContactInfo === false && !flags.includes('missing_contact_info')) {
    flags.push('missing_contact_info')
  }
  return flags
}

export interface ScoreLocalSeoOptions {
  pageUrl: string
  targetText: string
  competitorTexts: string[]
  lane1?: LocalLane1
  maxTokens?: number
}

/** Run one well-scoped Local SEO judgment call. Never throws. */
export async function scoreLocalSeo(opts: ScoreLocalSeoOptions): Promise<LocalSeoResult> {
  const empty: LocalSeoResult = {
    page_url: opts.pageUrl,
    subsystem: 'local_seo',
    model_used: 'unavailable',
    scored_at: new Date().toISOString(),
    variables: [],
    local_gap_summary: { missing_local_signals: [], top_competitor_url: null, top_competitor_local_score: null },
    flags: [],
  }
  try {
    const target = (opts.targetText || '').replace(/\s+/g, ' ').trim().slice(0, 5000)
    if (!target) {
      return { ...empty, flags: ['empty_target'] }
    }
    const competitors = (opts.competitorTexts || []).filter(Boolean).slice(0, 10)
      .map((c, i) => `--- COMPETITOR ${i + 1} ---\n${c.replace(/\s+/g, ' ').trim().slice(0, 1800)}`)
      .join('\n\n')
    const lane1Block = JSON.stringify({
      region: opts.lane1?.region ?? null,
      has_contact_info: Boolean(opts.lane1?.hasContactInfo),
      has_local_schema: Boolean(opts.lane1?.hasLocalSchema),
    })
    const prompt = `TARGET PAGE (${opts.pageUrl}):\n${target}\n\n${competitors ? `COMPETITOR PAGES:\n${competitors}\n\n` : ''}TOOL DATA:\n${lane1Block}`

    const ai = await generateContentText({
      system: LOCAL_SYSTEM_PROMPT,
      prompt,
      maxTokens: opts.maxTokens ?? 2500,
      temperature: 0.2,
    })

    const parsed = parseLocalSeoResponse(ai.text || '')
    const result: LocalSeoResult = {
      page_url: opts.pageUrl,
      subsystem: 'local_seo',
      model_used: `${ai.provider}:${ai.model}`,
      scored_at: new Date().toISOString(),
      variables: parsed.variables,
      local_gap_summary: parsed.local_gap_summary,
      flags: parsed.flags,
    }
    result.flags = mergeFlags(result.flags, opts.lane1)
    return result
  } catch (e) {
    return {
      ...empty,
      model_used: 'unavailable',
      flags: ['engine_error: ' + (e instanceof Error ? e.message.slice(0, 120) : 'unknown')],
    }
  }
}

/** Map a module result to the typed content_jobs columns (single source of truth). */
export function localSeoPersist(result: LocalSeoResult): {
  local_score: number | null
  local_gbp_score: number | null
  local_nap_consistency_score: number | null
  local_missing_signals: string[]
  local_top_competitor: string | null
  local_top_competitor_score: number | null
  local_confidence_avg: number | null
  local_flags: string[]
  local_model_used: string
} {
  return {
    local_score: localSeoComposite(result),
    local_gbp_score: varScore(result, 576),
    local_nap_consistency_score: varScore(result, 584),
    local_missing_signals: (result.local_gap_summary?.missing_local_signals || []).slice(0, 20),
    local_top_competitor: result.local_gap_summary?.top_competitor_url || null,
    local_top_competitor_score: result.local_gap_summary?.top_competitor_local_score ?? null,
    local_confidence_avg: localConfidenceAvg(result),
    local_flags: result.flags || [],
    local_model_used: result.model_used,
  }
}

/** Convenience: build Lane-1 facts from already-available deterministic data. */
export function buildLocalLane1(opts: {
  region?: string
  targetText: string
}): LocalLane1 {
  const text = opts.targetText || ''
  return {
    region: opts.region || undefined,
    hasContactInfo: /(\bphone\b|\btel:|\bemail\b|\bmailto:|\baddress\b|\b\d{3}[-\s.)]?\d{3}[-\s.]?\d{4}\b)/i.test(text),
    hasLocalSchema: /(LocalBusiness|"@type"\s*:\s*"(Organization|ProfessionalService|LegalService)")/i.test(text),
  }
}
