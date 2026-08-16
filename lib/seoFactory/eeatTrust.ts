/**
 * lib/seoFactory/eeatTrust.ts
 *
 * E-E-A-T / TRUST MODULE — Subsystem I (E-E-A-T & Trust Signals).
 *
 * Lane-2 LLM judgment over the trust dimensions a deterministic crawler
 * cannot fully grade. The crawler already checks *presence* (author byline,
 * disclaimer, citation density, publication date); this module judges
 * *quality*: whether the author's credential is genuinely relevant to the
 * topic, whether claims are actually backed by the cited sources, whether the
 * citations are authoritative for THIS topic, and how the page's trust stack
 * compares to the top-ranking competitors.
 *
 * Same discipline as lib/seoFactory/contentQuality.ts / semanticNlp.ts:
 *   • Structured JSON only (regex is fallback-only, flagged `malformed_json`).
 *   • Every variable carries `evidence` + `confidence` — never a bare number.
 *   • Truthful provenance — `model_used` is the ACTUAL provider:model.
 *   • One well-scoped call per page (the multi-engine consensus pattern is
 *     citation-only and is NOT generalized here).
 *   • `buildEeatActions` is a pure, deterministic rules engine — zero LLM calls.
 *
 * Named `eeatTrust.ts` (not `eeat.ts`) because `eeat.ts` already exists as the
 * P2-1 frontmatter → JSON-LD builder — a separate concern.
 */

import { generateContentText } from '@/lib/contentAiProvider'

/** The explicit E-E-A-T judgment variables from the taxonomy (Subsystem I
 *  items 531–575) — the LLM-judgment subset, not the deterministic presence
 *  checks the crawler already owns. */
export const EEAT_TRUST_VARIABLES: ReadonlyArray<{
  id: number
  name: string
  desc: string
}> = [
  { id: 532, name: 'author_expertise_quality', desc: 'author credential genuinely relevant to the topic (not merely present)' },
  { id: 533, name: 'author_topical_consistency', desc: 'author expertise matches the page topic' },
  { id: 535, name: 'author_external_validation', desc: 'author recognized/cited elsewhere (external authority)' },
  { id: 539, name: 'fact_check_transparency', desc: 'genuine review/accuracy process disclosed (not just a keyword)' },
  { id: 540, name: 'sourcing_adequacy', desc: 'claims are actually backed by the cited sources' },
  { id: 541, name: 'citation_authority_quality', desc: 'citations are authoritative for THIS topic' },
  { id: 542, name: 'original_insight', desc: 'original guidance/analysis, not generic template content' },
  { id: 564, name: 'expert_quote_depth', desc: 'first-hand experience / expert-quote depth' },
  { id: 574, name: 'accuracy_track_record', desc: 'no misinformation / accuracy flags in the content' },
]

export interface EeatTrustVariable {
  id: number
  name: string
  score: number | null
  evidence: string
  confidence: number
}

export interface TrustGapSummary {
  missing_signals: string[]
  top_competitor_url: string | null
  top_competitor_trust_score: number | null
}

export interface EeatTrustResult {
  page_url: string
  subsystem: 'eeat_trust'
  model_used: string
  scored_at: string
  variables: EeatTrustVariable[]
  trust_gap_summary: TrustGapSummary
  flags: string[]
}

/** Lane-1 deterministic facts the rules engine (and the LLM, as context)
 *  needs — already computed by the crawler, never re-derived by the model. */
export interface EeatLane1 {
  ymyl?: boolean
  authorBylinePresent?: boolean
  disclaimerPresent?: boolean
  citationCount?: number | null
}

export interface EeatAction {
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
  return EEAT_TRUST_VARIABLES.map((v) => `- ${v.id} ${v.name}: ${v.desc}`).join('\n')
}

const EEAT_SYSTEM_PROMPT = `You are a scoring module in an SEO analysis engine. You will be given the cleaned text of a target page, up to 10 top-ranking competitor pages, and deterministic tool data (JSON: whether the page is YMYL, whether an author byline/disclaimer is present, citation count).

Score ONLY the variables listed below. For each, return a value 0.0–1.0 plus a one-sentence justification citing specific evidence from the provided text. Do NOT estimate variables not listed. Do NOT invent data not present in the input. If evidence is insufficient to score a variable, return null for score and say why.

Output valid JSON only — no markdown, no prose outside the JSON — exactly matching this schema:
{
  "variables": [
    { "id": 532, "name": "author_expertise_quality", "score": 0.0, "evidence": "one sentence citing the text", "confidence": 0.0 }
  ],
  "trust_gap_summary": {
    "missing_signals": ["string"],
    "top_competitor_url": "string",
    "top_competitor_trust_score": 0.0
  },
  "flags": ["low_trust", "misinformation_risk"]
}

Rules:
- "trust_gap_summary.missing_signals" is the trust signals top competitors demonstrate that the page lacks (e.g. "named reviewer", "primary-source citations", "first-hand experience"). Empty array if none.
- "trust_gap_summary.top_competitor_url" is the single most trustworthy competitor URL (or null).
- "trust_gap_summary.top_competitor_trust_score" is that competitor's overall trust 0.0–1.0 (or null if unknown).
- "confidence" is 0.0–1.0 for how certain you are of that variable's score.
- Return ONLY the JSON.

VARIABLES FOR THIS CALL:
${variableListBlock()}`

interface ParsedEeatResponse {
  variables: EeatTrustVariable[]
  trust_gap_summary: TrustGapSummary
  flags: string[]
  answerText: string
}

/**
 * Parse the model's reply into structured evidence. Prefers the JSON contract;
 * falls back to a flagged empty result so a bad model never throws.
 */
export function parseEeatTrustResponse(text: string): ParsedEeatResponse {
  const raw = (text || '').trim()
  const emptyGap: TrustGapSummary = { missing_signals: [], top_competitor_url: null, top_competitor_trust_score: null }

  const fence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fence.slice(start, end + 1)) as Record<string, unknown>
      const rawVars = Array.isArray(obj.variables) ? (obj.variables as Array<Record<string, unknown>>) : []
      const byName = new Map(EEAT_TRUST_VARIABLES.map((v) => [v.name, v.id]))
      const variables: EeatTrustVariable[] = []
      for (const rv of rawVars) {
        const name = asString(rv.name || '')
        const id = Number(rv.id) || byName.get(name) || 0
        if (!id) continue
        const scoreRaw = rv.score
        const score = scoreRaw == null || scoreRaw === '' ? null : clamp01(Number(scoreRaw))
        variables.push({
          id,
          name: name || (EEAT_TRUST_VARIABLES.find((v) => v.id === id)?.name ?? String(id)),
          score,
          evidence: asString(rv.evidence || '').slice(0, 300),
          confidence: clamp01(Number(rv.confidence) || 0),
        })
      }
      const gap = (obj.trust_gap_summary || {}) as Record<string, unknown>
      const missing = Array.isArray(gap.missing_signals) ? gap.missing_signals.map(asString).filter(Boolean).slice(0, 20) : []
      const topUrl = gap.top_competitor_url ? asString(gap.top_competitor_url) : null
      const topTrust = gap.top_competitor_trust_score == null ? null : clamp01(Number(gap.top_competitor_trust_score))
      const flags = Array.isArray(obj.flags) ? obj.flags.map(asString).filter(Boolean).slice(0, 10) : []
      return {
        variables,
        trust_gap_summary: {
          missing_signals: missing,
          top_competitor_url: topUrl,
          top_competitor_trust_score: Number.isFinite(topTrust) ? topTrust : null,
        },
        flags,
        answerText: raw,
      }
    } catch {
      /* fall through to the flagged fallback */
    }
  }

  return { variables: [], trust_gap_summary: emptyGap, flags: ['malformed_json'], answerText: raw }
}

/** Average the scored variables (confidence-weighted, expertise + sourcing favored). */
export function eeatTrustComposite(result: EeatTrustResult): number | null {
  const scored = result.variables.filter((v) => v.score != null)
  if (!scored.length) return null
  const w = (id: number) => (id === 532 || id === 540 ? 2 : id === 541 ? 1.5 : 1)
  const weighted = scored.reduce((a, v) => a + (v.score as number) * w(v.id) * (0.5 + v.confidence * 0.5), 0)
  const wsum = scored.reduce((a, v) => a + w(v.id) * (0.5 + v.confidence * 0.5), 0)
  return clamp01(weighted / wsum)
}

/** Average confidence across scored variables (0 when none). */
export function eeatConfidenceAvg(result: EeatTrustResult): number {
  const scored = result.variables.filter((v) => v.score != null)
  return scored.length ? scored.reduce((a, v) => a + v.confidence, 0) / scored.length : 0
}

function varScore(result: EeatTrustResult, id: number): number | null {
  const v = result.variables.find((x) => x.id === id)
  return v ? v.score : null
}

/**
 * Deterministic, prioritized fixes over the scored result + Lane-1 facts.
 * PURE — zero LLM calls.
 */
export function buildEeatActions(result: EeatTrustResult, lane1?: EeatLane1): EeatAction[] {
  const out: EeatAction[] = []
  const flags = new Set(result.flags || [])
  const missing = result.trust_gap_summary?.missing_signals || []
  const top = result.trust_gap_summary?.top_competitor_url || null
  const expertise = varScore(result, 532)
  const sourcing = varScore(result, 540)
  const citationAuthority = varScore(result, 541)
  const factCheck = varScore(result, 539)

  if (missing.length || flags.has('low_trust')) {
    out.push({
      priority: 4,
      action: `Add the missing trust signals competitors already demonstrate: ${missing.slice(0, 6).join(' · ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}`,
      evidence: top ? `Trust gap vs ${top}` : `${missing.length} trust signal(s) missing vs the SERP`,
    })
  }

  if (expertise != null && expertise < 0.5) {
    out.push({
      priority: 3,
      action: 'Strengthen the author byline with topic-relevant credentials (named person, qualification, experience)',
      evidence: `Author expertise ${Math.round(expertise * 100)}/100 — presence is not enough for YMYL trust`,
    })
  }

  if (sourcing != null && sourcing < 0.5) {
    out.push({
      priority: 3,
      action: 'Back each factual claim with a cited primary source it actually supports',
      evidence: `Sourcing adequacy ${Math.round(sourcing * 100)}/100 — claims exceed the cited evidence`,
    })
  }

  if (citationAuthority != null && citationAuthority < 0.5) {
    out.push({
      priority: 2,
      action: 'Upgrade citations to authoritative first-party sources (agency/statute), not secondary summaries',
      evidence: `Citation authority ${Math.round(citationAuthority * 100)}/100 — sources are not authoritative for this topic`,
    })
  }

  if (factCheck != null && factCheck < 0.5) {
    out.push({
      priority: 2,
      action: 'Disclose a visible review/accuracy process (named reviewer + "last reviewed" date)',
      evidence: `Fact-check transparency ${Math.round(factCheck * 100)}/100`,
    })
  }

  if (lane1?.ymyl && lane1.disclaimerPresent === false) {
    out.push({
      priority: 2,
      action: 'Add an educational disclaimer ("not legal advice") — YMYL page without one',
      evidence: 'Deterministic crawl: disclaimer absent on a YMYL page',
    })
  }

  if (!out.length) {
    out.push({ priority: 1, action: 'Sustain — the trust stack clears the SERP consensus', evidence: `Trust ${varScore(result, 532) == null ? '—' : Math.round((varScore(result, 532) as number) * 100)}/100` })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

/** Merge deterministic Lane-1 flags into the model's flags (never removed). */
function mergeFlags(modelFlags: string[], lane1?: EeatLane1): string[] {
  const flags = [...modelFlags]
  if (lane1?.ymyl && lane1.disclaimerPresent === false && !flags.includes('missing_disclaimer')) {
    flags.push('missing_disclaimer')
  }
  return flags
}

export interface ScoreEeatTrustOptions {
  pageUrl: string
  targetText: string
  competitorTexts: string[]
  lane1?: EeatLane1
  maxTokens?: number
}

/** Run one well-scoped E-E-A-T judgment call. Never throws. */
export async function scoreEeatTrust(opts: ScoreEeatTrustOptions): Promise<EeatTrustResult> {
  const empty: EeatTrustResult = {
    page_url: opts.pageUrl,
    subsystem: 'eeat_trust',
    model_used: 'unavailable',
    scored_at: new Date().toISOString(),
    variables: [],
    trust_gap_summary: { missing_signals: [], top_competitor_url: null, top_competitor_trust_score: null },
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
      ymyl: Boolean(opts.lane1?.ymyl),
      author_byline_present: Boolean(opts.lane1?.authorBylinePresent),
      disclaimer_present: Boolean(opts.lane1?.disclaimerPresent),
      citation_count: opts.lane1?.citationCount ?? null,
    })
    const prompt = `TARGET PAGE (${opts.pageUrl}):\n${target}\n\n${competitors ? `COMPETITOR PAGES:\n${competitors}\n\n` : ''}TOOL DATA:\n${lane1Block}`

    const ai = await generateContentText({
      system: EEAT_SYSTEM_PROMPT,
      prompt,
      maxTokens: opts.maxTokens ?? 2500,
      temperature: 0.2,
    })

    const parsed = parseEeatTrustResponse(ai.text || '')
    const result: EeatTrustResult = {
      page_url: opts.pageUrl,
      subsystem: 'eeat_trust',
      model_used: `${ai.provider}:${ai.model}`,
      scored_at: new Date().toISOString(),
      variables: parsed.variables,
      trust_gap_summary: parsed.trust_gap_summary,
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
export function eeatTrustPersist(result: EeatTrustResult): {
  eeat_trust_score: number | null
  eeat_author_expertise_score: number | null
  eeat_missing_signals: string[]
  eeat_top_competitor: string | null
  eeat_top_competitor_trust: number | null
  eeat_confidence_avg: number | null
  eeat_flags: string[]
  eeat_model_used: string
} {
  return {
    eeat_trust_score: eeatTrustComposite(result),
    eeat_author_expertise_score: varScore(result, 532),
    eeat_missing_signals: (result.trust_gap_summary?.missing_signals || []).slice(0, 20),
    eeat_top_competitor: result.trust_gap_summary?.top_competitor_url || null,
    eeat_top_competitor_trust: result.trust_gap_summary?.top_competitor_trust_score ?? null,
    eeat_confidence_avg: eeatConfidenceAvg(result),
    eeat_flags: result.flags || [],
    eeat_model_used: result.model_used,
  }
}

/** Convenience: build Lane-1 facts from already-available deterministic data. */
export function buildEeatLane1(opts: {
  targetText: string
  ymyl?: boolean
}): EeatLane1 {
  const text = opts.targetText || ''
  return {
    ymyl: Boolean(opts.ymyl),
    authorBylinePresent: /(about the author|reviewed by|written by|\bby\s+\w[\w\s.,]*(?:esq|jd|attorney|solicitor|barrister|consultant|adviser|advisor|team))/i.test(text),
    disclaimerPresent: /(not legal advice|educational (purpose|information)|general information|disclaimer|informational)/i.test(text),
    citationCount: (text.match(/https?:\/\/|\.gov\b|\.edu\b|\.org\b/gi) || []).length,
  }
}
