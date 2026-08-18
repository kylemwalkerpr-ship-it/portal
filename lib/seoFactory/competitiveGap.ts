/**
 * lib/seoFactory/competitiveGap.ts
 *
 * COMPETITIVE GAP MODULE — Subsystem O (SERP / Competitive Intelligence).
 *
 * Lane-2 LLM judgment over how the target page stacks up against the
 * top-ranking competitors for its primary query: content comprehensiveness,
 * information gain, SERP-feature parity, authority parity (interpreted from
 * Lane-1 numbers, never guessed), freshness parity, differentiation and
 * overall competitive position. This is the engine's "outsmart the
 * competition" mechanism — the competitive delta (not the absolute score) is
 * what drives the action list.
 *
 * Same discipline as lib/seoFactory/contentQuality.ts / semanticNlp.ts /
 * eeatTrust.ts:
 *   • Structured JSON only (regex is fallback-only, flagged `malformed_json`).
 *   • Every variable carries `evidence` + `confidence` — never a bare number.
 *   • Truthful provenance — `model_used` is the ACTUAL provider:model.
 *   • One well-scoped call per page (the multi-engine consensus pattern is
 *     citation-only and is NOT generalized here).
 *   • `buildCompetitiveActions` is a pure, deterministic rules engine — zero
 *     LLM calls.
 */

import { generateEngineText } from '@/lib/seoEngine/engineAi'

/** The explicit competitive judgment variables from the taxonomy (Subsystem O,
 *  SERP/Competitive) — the LLM-judgment subset. Deterministic comparisons the
 *  crawler already owns (word-count vs SERP median, backlink gap, etc.) stay
 *  in Lane-1 and are only *interpreted* here. */
export const COMPETITIVE_VARIABLES: ReadonlyArray<{
  id: number
  name: string
  desc: string
}> = [
  { id: 746, name: 'content_comprehensiveness_parity', desc: 'how complete the page is vs the top-ranking competitors' },
  { id: 748, name: 'information_gain_edge', desc: 'unique insights / angles the page offers that competitors lack' },
  { id: 750, name: 'serp_feature_parity', desc: 'parity on the SERP features competitors hold (PAA, snippets, tables, video)' },
  { id: 752, name: 'authority_parity', desc: 'off-page authority vs competitors (interpret Lane-1 authority, never guess a number)' },
  { id: 754, name: 'freshness_parity', desc: 'recency / currency vs competitors' },
  { id: 756, name: 'differentiation_edge', desc: 'distinct positioning that makes the page defensible against the set' },
  { id: 758, name: 'depth_parity', desc: 'thoroughness of coverage vs the strongest competitor' },
  { id: 760, name: 'answer_quality_parity', desc: 'direct-answer quality for the primary query vs competitors' },
  { id: 762, name: 'overall_competitive_position', desc: 'aggregate competitive standing vs the SERP set' },
]

export interface CompetitiveVariable {
  id: number
  name: string
  score: number | null
  evidence: string
  confidence: number
}

export interface CompetitiveGapSummary {
  missing_edges: string[]
  top_competitor_url: string | null
  top_competitor_competitive_score: number | null
}

export interface CompetitiveGapResult {
  page_url: string
  subsystem: 'competitive_gap'
  model_used: string
  scored_at: string
  variables: CompetitiveVariable[]
  competitive_gap_summary: CompetitiveGapSummary
  flags: string[]
}

/** Lane-1 deterministic facts the rules engine (and the LLM, as context)
 *  needs — already computed by the crawler, never re-derived by the model. */
export interface CompetitiveLane1 {
  competitorCount?: number
  authorityScore?: number | null
  questionIntent?: boolean
}

export interface CompetitiveAction {
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
  return COMPETITIVE_VARIABLES.map((v) => `- ${v.id} ${v.name}: ${v.desc}`).join('\n')
}

const COMPETITIVE_SYSTEM_PROMPT = `You are a scoring module in an SEO analysis engine. You will be given the cleaned text of a target page, up to 10 top-ranking competitor pages, and deterministic tool data (JSON: number of competitors, the page's off-page authority score 0-1 from a backlink tool, whether the query is question-style).

Score ONLY the variables listed below. For each, return a value 0.0–1.0 plus a one-sentence justification citing specific evidence from the provided text. Do NOT estimate variables not listed. Do NOT invent data not present in the input. If evidence is insufficient to score a variable, return null for score and say why.

For "authority_parity" do NOT invent an authority number — interpret the TOOL DATA authority score against the competitors' apparent trustworthiness from their text, and say so in the evidence.

Output valid JSON only — no markdown, no prose outside the JSON — exactly matching this schema:
{
  "variables": [
    { "id": 746, "name": "content_comprehensiveness_parity", "score": 0.0, "evidence": "one sentence citing the text", "confidence": 0.0 }
  ],
  "competitive_gap_summary": {
    "missing_edges": ["string"],
    "top_competitor_url": "string",
    "top_competitor_competitive_score": 0.0
  },
  "flags": ["lagging_competition"]
}

Rules:
- "competitive_gap_summary.missing_edges" is what top competitors do / cover that the page does not (e.g. "first-hand comparison table", "official fee schedule", "worked example for X"). Empty array if none.
- "competitive_gap_summary.top_competitor_url" is the single strongest competitor URL (or null).
- "competitive_gap_summary.top_competitor_competitive_score" is that competitor's overall competitive standing 0.0–1.0 (or null if unknown).
- "confidence" is 0.0–1.0 for how certain you are of that variable's score.
- Return ONLY the JSON.

VARIABLES FOR THIS CALL:
${variableListBlock()}`

interface ParsedCompetitiveResponse {
  variables: CompetitiveVariable[]
  competitive_gap_summary: CompetitiveGapSummary
  flags: string[]
  answerText: string
}

/**
 * Parse the model's reply into structured evidence. Prefers the JSON contract;
 * falls back to a flagged empty result so a bad model never throws.
 */
export function parseCompetitiveGapResponse(text: string): ParsedCompetitiveResponse {
  const raw = (text || '').trim()
  const emptyGap: CompetitiveGapSummary = { missing_edges: [], top_competitor_url: null, top_competitor_competitive_score: null }

  const fence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fence.slice(start, end + 1)) as Record<string, unknown>
      const rawVars = Array.isArray(obj.variables) ? (obj.variables as Array<Record<string, unknown>>) : []
      const byName = new Map(COMPETITIVE_VARIABLES.map((v) => [v.name, v.id]))
      const variables: CompetitiveVariable[] = []
      for (const rv of rawVars) {
        const name = asString(rv.name || '')
        const id = Number(rv.id) || byName.get(name) || 0
        if (!id) continue
        const scoreRaw = rv.score
        const score = scoreRaw == null || scoreRaw === '' ? null : clamp01(Number(scoreRaw))
        variables.push({
          id,
          name: name || (COMPETITIVE_VARIABLES.find((v) => v.id === id)?.name ?? String(id)),
          score,
          evidence: asString(rv.evidence || '').slice(0, 300),
          confidence: clamp01(Number(rv.confidence) || 0),
        })
      }
      const gap = (obj.competitive_gap_summary || {}) as Record<string, unknown>
      const missing = Array.isArray(gap.missing_edges) ? gap.missing_edges.map(asString).filter(Boolean).slice(0, 20) : []
      const topUrl = gap.top_competitor_url ? asString(gap.top_competitor_url) : null
      const topScore = gap.top_competitor_competitive_score == null ? null : clamp01(Number(gap.top_competitor_competitive_score))
      const flags = Array.isArray(obj.flags) ? obj.flags.map(asString).filter(Boolean).slice(0, 10) : []
      return {
        variables,
        competitive_gap_summary: {
          missing_edges: missing,
          top_competitor_url: topUrl,
          top_competitor_competitive_score: Number.isFinite(topScore) ? topScore : null,
        },
        flags,
        answerText: raw,
      }
    } catch {
      /* fall through to the flagged fallback */
    }
  }

  return { variables: [], competitive_gap_summary: emptyGap, flags: ['malformed_json'], answerText: raw }
}

/** Average the scored variables (confidence-weighted, comprehensiveness +
 *  information gain + overall position favored). */
export function competitiveGapComposite(result: CompetitiveGapResult): number | null {
  const scored = result.variables.filter((v) => v.score != null)
  if (!scored.length) return null
  const w = (id: number) => (id === 746 || id === 748 || id === 762 ? 2 : 1)
  const weighted = scored.reduce((a, v) => a + (v.score as number) * w(v.id) * (0.5 + v.confidence * 0.5), 0)
  const wsum = scored.reduce((a, v) => a + w(v.id) * (0.5 + v.confidence * 0.5), 0)
  return clamp01(weighted / wsum)
}

/** Average confidence across scored variables (0 when none). */
export function competitiveConfidenceAvg(result: CompetitiveGapResult): number {
  const scored = result.variables.filter((v) => v.score != null)
  return scored.length ? scored.reduce((a, v) => a + v.confidence, 0) / scored.length : 0
}

function varScore(result: CompetitiveGapResult, id: number): number | null {
  const v = result.variables.find((x) => x.id === id)
  return v ? v.score : null
}

/**
 * Deterministic, prioritized fixes over the scored result + Lane-1 facts.
 * PURE — zero LLM calls.
 */
export function buildCompetitiveActions(result: CompetitiveGapResult, lane1?: CompetitiveLane1): CompetitiveAction[] {
  const out: CompetitiveAction[] = []
  const flags = new Set(result.flags || [])
  const missing = result.competitive_gap_summary?.missing_edges || []
  const top = result.competitive_gap_summary?.top_competitor_url || null
  const informationGain = varScore(result, 748)
  const serpParity = varScore(result, 750)
  const freshness = varScore(result, 754)

  if (missing.length || flags.has('lagging_competition')) {
    out.push({
      priority: 4,
      action: `Adopt the competitive edges the SERP leaders already have: ${missing.slice(0, 6).join(' · ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}`,
      evidence: top ? `Competitive gap vs ${top}` : `${missing.length} edge(s) the competition holds that the page lacks`,
    })
  }

  if (informationGain != null && informationGain < 0.4) {
    out.push({
      priority: 3,
      action: 'Add genuine information gain — original data, worked examples, or first-hand comparisons the competitors do not offer',
      evidence: `Information-gain edge ${Math.round(informationGain * 100)}/100 — the page re-states what the SERP already says`,
    })
  }

  if (serpParity != null && serpParity < 0.5) {
    out.push({
      priority: 2,
      action: 'Own the SERP features competitors hold (direct-answer block, comparison table, PAA chunk)',
      evidence: `SERP-feature parity ${Math.round(serpParity * 100)}/100 — competitors capture the rich result slots`,
    })
  }

  if (freshness != null && freshness < 0.5) {
    out.push({
      priority: 2,
      action: 'Refresh to beat competitor freshness — current-year markers, updated figures, "as of" dates',
      evidence: `Freshness parity ${Math.round(freshness * 100)}/100 — competitors read more current`,
    })
  }

  if (!out.length) {
    out.push({ priority: 1, action: 'Sustain — the page clears the competitive set on every judged dimension', evidence: `Overall position ${varScore(result, 762) == null ? '—' : Math.round((varScore(result, 762) as number) * 100)}/100` })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

/** Merge deterministic Lane-1 flags into the model's flags (never removed). */
function mergeFlags(modelFlags: string[], lane1?: CompetitiveLane1): string[] {
  const flags = [...modelFlags]
  if ((lane1?.competitorCount ?? 0) === 0 && !flags.includes('no_competitors_scored')) {
    flags.push('no_competitors_scored')
  }
  return flags
}

export interface ScoreCompetitiveGapOptions {
  pageUrl: string
  targetText: string
  competitorTexts: string[]
  lane1?: CompetitiveLane1
  maxTokens?: number
}

/** Run one well-scoped Competitive Gap judgment call. Never throws. */
export async function scoreCompetitiveGap(opts: ScoreCompetitiveGapOptions): Promise<CompetitiveGapResult> {
  const empty: CompetitiveGapResult = {
    page_url: opts.pageUrl,
    subsystem: 'competitive_gap',
    model_used: 'unavailable',
    scored_at: new Date().toISOString(),
    variables: [],
    competitive_gap_summary: { missing_edges: [], top_competitor_url: null, top_competitor_competitive_score: null },
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
      competitor_count: opts.lane1?.competitorCount ?? 0,
      authority_score: opts.lane1?.authorityScore ?? null,
      question_intent: Boolean(opts.lane1?.questionIntent),
    })
    const prompt = `TARGET PAGE (${opts.pageUrl}):\n${target}\n\n${competitors ? `COMPETITOR PAGES:\n${competitors}\n\n` : ''}TOOL DATA:\n${lane1Block}`

    const ai = await generateEngineText({
      system: COMPETITIVE_SYSTEM_PROMPT,
      prompt,
      maxTokens: opts.maxTokens ?? 2500,
      temperature: 0.2,
      skipQualityContract: true,
    })

    const parsed = parseCompetitiveGapResponse(ai.text || '')
    const result: CompetitiveGapResult = {
      page_url: opts.pageUrl,
      subsystem: 'competitive_gap',
      model_used: `${ai.provider}:${ai.model}`,
      scored_at: new Date().toISOString(),
      variables: parsed.variables,
      competitive_gap_summary: parsed.competitive_gap_summary,
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
export function competitiveGapPersist(result: CompetitiveGapResult): {
  competitive_score: number | null
  competitive_overall_position: number | null
  competitive_missing_edges: string[]
  competitive_top_competitor: string | null
  competitive_top_competitor_score: number | null
  competitive_confidence_avg: number | null
  competitive_flags: string[]
  competitive_model_used: string
} {
  return {
    competitive_score: competitiveGapComposite(result),
    competitive_overall_position: varScore(result, 762),
    competitive_missing_edges: (result.competitive_gap_summary?.missing_edges || []).slice(0, 20),
    competitive_top_competitor: result.competitive_gap_summary?.top_competitor_url || null,
    competitive_top_competitor_score: result.competitive_gap_summary?.top_competitor_competitive_score ?? null,
    competitive_confidence_avg: competitiveConfidenceAvg(result),
    competitive_flags: result.flags || [],
    competitive_model_used: result.model_used,
  }
}

/** Convenience: build Lane-1 facts from already-available deterministic data. */
export function buildCompetitiveLane1(opts: {
  competitorCount?: number
  authorityScore?: number | null
  questionIntent?: boolean
}): CompetitiveLane1 {
  return {
    competitorCount: opts.competitorCount ?? 0,
    authorityScore: opts.authorityScore ?? null,
    questionIntent: Boolean(opts.questionIntent),
  }
}
