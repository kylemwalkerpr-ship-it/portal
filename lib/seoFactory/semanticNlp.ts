/**
 * lib/seoFactory/semanticNlp.ts
 *
 * SEMANTIC / NLP MODULE — Subsystem H (Semantic & Entity Intelligence).
 *
 * Lane-2 LLM judgment over what the deterministic signal layer cannot grade:
 * named-entity coverage/salience, topical authority breadth/depth, semantic
 * clustering/LSI coverage, query fan-out, related-entity gaps, answer
 * completeness, multi-intent coverage, PAA extractability and entity trust.
 *
 * Same discipline as lib/seoFactory/contentQuality.ts:
 *   • Structured JSON only (regex is fallback-only, flagged `malformed_json`).
 *   • Every variable carries `evidence` + `confidence` — never a bare number.
 *   • Truthful provenance — `model_used` is the ACTUAL provider:model.
 *   • One well-scoped call per page (no multi-engine consensus here).
 *   • `buildSemanticActions` is a pure, deterministic rules engine.
 *
 * Embedding rule (per the spec): when a precomputed embedding-similarity score
 * for a variable is available in Lane-1 data, the model interprets it
 * (`embedding_verified: true`). When it is NOT available, the variable is a
 * text-only judgment and its confidence is deterministically capped at 0.7 —
 * the parser enforces this itself rather than trusting the model to self-cap.
 */

import { generateContentText } from '@/lib/contentAiProvider'

export const SEMANTIC_NLP_VARIABLES: ReadonlyArray<{
  id: number
  name: string
  desc: string
}> = [
  { id: 461, name: 'named_entity_coverage', desc: 'coverage of the entities the topic requires' },
  { id: 462, name: 'entity_salience', desc: 'how salient / prominent the key entities are' },
  { id: 466, name: 'topical_authority_breadth', desc: 'breadth of subtopics covered' },
  { id: 467, name: 'topical_authority_depth', desc: 'depth within each subtopic' },
  { id: 468, name: 'semantic_clustering_completeness', desc: 'LSI / semantic keyword coverage' },
  { id: 473, name: 'query_fanout_coverage', desc: 'coverage of the fan-out sub-queries around the topic' },
  { id: 474, name: 'related_entity_gap', desc: 'absence of gaps vs competitor entities (higher = fewer gaps)' },
  { id: 486, name: 'answer_completeness_score', desc: 'how completely question-style queries are answered' },
  { id: 494, name: 'multi_intent_coverage', desc: 'coverage of multiple intents within one page' },
  { id: 528, name: 'paa_extractability', desc: 'People-Also-Ask extractability (direct-answer chunks)' },
  { id: 529, name: 'entity_trust_score', desc: 'entity trust via cross-source corroboration' },
]

export interface SemanticNlpVariable {
  id: number
  name: string
  score: number | null
  evidence: string
  confidence: number
  embedding_verified: boolean
}

export interface EntityGapSummary {
  missing_entities: string[]
  top_competitor_url: string | null
  top_competitor_entity_coverage: number | null
}

export interface SemanticNlpResult {
  page_url: string
  subsystem: 'semantic_nlp'
  model_used: string
  scored_at: string
  variables: SemanticNlpVariable[]
  entity_gap_summary: EntityGapSummary
  flags: string[]
}

/** Lane-1 facts for the semantic module — precomputed embedding similarities
 *  (variable name → 0-1) plus the question-intent flag the rules engine needs. */
export interface SemanticLane1 {
  embeddings?: Record<string, number>
  questionIntent?: boolean
}

export interface SemanticAction {
  priority: number
  action: string
  evidence: string
}

/** Text-only judgments are capped here so an un-verified semantic score cannot
 *  masquerade as a vector-verified one in the regression training set. */
const TEXT_ONLY_CONFIDENCE_CAP = 0.7

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0))
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : String(v || '')
}

function variableListBlock(): string {
  return SEMANTIC_NLP_VARIABLES.map((v) => `- ${v.id} ${v.name}: ${v.desc}`).join('\n')
}

const SEMANTIC_SYSTEM_PROMPT = `You are a scoring module in an SEO analysis engine. You will be given the cleaned text of a target page, up to 10 top-ranking competitor pages, and deterministic tool data (JSON, may include precomputed embedding-similarity scores).

Score ONLY the variables listed below. For each, return a value 0.0–1.0 plus a one-sentence justification citing specific evidence. Do NOT estimate variables not listed. Do NOT invent data not present in the input. If evidence is insufficient to score a variable, return null for score and say why.

For each variable also return "embedding_verified": true ONLY if TOOL DATA supplied a precomputed embedding-similarity score for that exact variable name (use that score as the basis and contextualize it); otherwise false (a text-only judgment).

Output valid JSON only — no markdown, no prose outside the JSON — exactly matching this schema:
{
  "variables": [
    { "id": 466, "name": "topical_authority_breadth", "score": 0.0, "evidence": "one sentence citing the text", "confidence": 0.0, "embedding_verified": true }
  ],
  "entity_gap_summary": {
    "missing_entities": ["string"],
    "top_competitor_url": "string",
    "top_competitor_entity_coverage": 0.0
  },
  "flags": ["low_entity_coverage", "text_only_judgment"]
}

Rules:
- "entity_gap_summary.missing_entities" is the entities top competitors cover that the page lacks (empty array if none).
- "entity_gap_summary.top_competitor_url" is the single strongest competitor URL (or null).
- "entity_gap_summary.top_competitor_entity_coverage" is that competitor's entity coverage 0.0–1.0 (or null if unknown).
- "confidence" is 0.0–1.0 for how certain you are of that variable's score.
- Return ONLY the JSON.

VARIABLES FOR THIS CALL:
${variableListBlock()}`

interface ParsedSemanticResponse {
  variables: SemanticNlpVariable[]
  entity_gap_summary: EntityGapSummary
  flags: string[]
  answerText: string
}

/**
 * Parse the model's reply into structured evidence. The `embedding_verified`
 * flag and the 0.7 text-only confidence cap are enforced HERE (deterministic),
 * not trusted from the model.
 */
export function parseSemanticNlpResponse(text: string, embeddings?: Record<string, number>): ParsedSemanticResponse {
  const raw = (text || '').trim()
  const emptyGap: EntityGapSummary = { missing_entities: [], top_competitor_url: null, top_competitor_entity_coverage: null }
  const emb = embeddings || {}

  const fence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fence.slice(start, end + 1)) as Record<string, unknown>
      const rawVars = Array.isArray(obj.variables) ? (obj.variables as Array<Record<string, unknown>>) : []
      const byName = new Map(SEMANTIC_NLP_VARIABLES.map((v) => [v.name, v.id]))
      const variables: SemanticNlpVariable[] = []
      for (const rv of rawVars) {
        const name = asString(rv.name || '')
        const id = Number(rv.id) || byName.get(name) || 0
        if (!id) continue
        const scoreRaw = rv.score
        const score = scoreRaw == null || scoreRaw === '' ? null : clamp01(Number(scoreRaw))
        // Deterministic: a variable is embedding-verified ONLY when Lane-1
        // supplied a precomputed similarity for it. Text-only → cap 0.7.
        const embeddingVerified = name in emb
        const confidence = embeddingVerified
          ? clamp01(Number(rv.confidence) || 0)
          : Math.min(clamp01(Number(rv.confidence) || 0), TEXT_ONLY_CONFIDENCE_CAP)
        variables.push({
          id,
          name: name || (SEMANTIC_NLP_VARIABLES.find((v) => v.id === id)?.name ?? String(id)),
          score,
          evidence: asString(rv.evidence || '').slice(0, 300),
          confidence,
          embedding_verified: embeddingVerified,
        })
      }
      const gap = (obj.entity_gap_summary || {}) as Record<string, unknown>
      const missing = Array.isArray(gap.missing_entities) ? gap.missing_entities.map(asString).filter(Boolean).slice(0, 30) : []
      const topUrl = gap.top_competitor_url ? asString(gap.top_competitor_url) : null
      const topCov = gap.top_competitor_entity_coverage == null ? null : clamp01(Number(gap.top_competitor_entity_coverage))
      const flags = Array.isArray(obj.flags) ? obj.flags.map(asString).filter(Boolean).slice(0, 10) : []
      return {
        variables,
        entity_gap_summary: {
          missing_entities: missing,
          top_competitor_url: topUrl,
          top_competitor_entity_coverage: Number.isFinite(topCov) ? topCov : null,
        },
        flags,
        answerText: raw,
      }
    } catch {
      /* fall through to the flagged fallback */
    }
  }

  return { variables: [], entity_gap_summary: emptyGap, flags: ['malformed_json'], answerText: raw }
}

/** Average the scored variables (confidence-weighted, breadth+entities favored). */
export function semanticNlpComposite(result: SemanticNlpResult): number | null {
  const scored = result.variables.filter((v) => v.score != null)
  if (!scored.length) return null
  const w = (id: number) => (id === 466 || id === 461 ? 2 : id === 529 ? 1.5 : 1)
  const weighted = scored.reduce((a, v) => a + (v.score as number) * w(v.id) * (0.5 + v.confidence * 0.5), 0)
  const wsum = scored.reduce((a, v) => a + w(v.id) * (0.5 + v.confidence * 0.5), 0)
  return clamp01(weighted / wsum)
}

/** Average confidence across scored variables (0 when none). */
export function semanticConfidenceAvg(result: SemanticNlpResult): number {
  const scored = result.variables.filter((v) => v.score != null)
  return scored.length ? scored.reduce((a, v) => a + v.confidence, 0) / scored.length : 0
}

function varScore(result: SemanticNlpResult, id: number): number | null {
  const v = result.variables.find((x) => x.id === id)
  return v ? v.score : null
}

/**
 * Deterministic, prioritized fixes over the scored result + Lane-1 facts.
 * PURE — zero LLM calls.
 */
export function buildSemanticActions(result: SemanticNlpResult, lane1?: SemanticLane1): SemanticAction[] {
  const out: SemanticAction[] = []
  const flags = new Set(result.flags || [])
  const missing = result.entity_gap_summary?.missing_entities || []
  const top = result.entity_gap_summary?.top_competitor_url || null
  const breadth = varScore(result, 466)
  const answer = varScore(result, 486)
  const paa = varScore(result, 528)

  if (missing.length || flags.has('low_entity_coverage')) {
    out.push({
      priority: 4,
      action: `Add the missing entities competitors already cover: ${missing.slice(0, 6).join(' · ')}${missing.length > 6 ? ` (+${missing.length - 6} more)` : ''}`,
      evidence: top ? `Entity gap vs ${top}` : `${missing.length} entity(ies) missing vs the SERP`,
    })
  }

  if (breadth != null && breadth < 0.4) {
    const adjacent = missing.length ? missing.slice(0, 4).join(' · ') : 'the adjacent subtopics competitors cover'
    out.push({
      priority: 3,
      action: `Broaden topical authority into: ${adjacent}`,
      evidence: `Topical-authority breadth ${Math.round(breadth * 100)}/100 — the cluster is under-covered`,
    })
  }

  if (answer != null && answer < 0.5 && lane1?.questionIntent) {
    out.push({
      priority: 2,
      action: 'Restructure for a direct-answer format so question queries are answered up front',
      evidence: `Answer-completeness ${Math.round(answer * 100)}/100 · PAA extractability ${paa == null ? '—' : Math.round(paa * 100)}/100`,
    })
  }

  if (!out.length) {
    out.push({ priority: 1, action: 'Sustain — entity coverage and semantic structure clear the SERP consensus', evidence: `Breadth ${breadth == null ? '—' : Math.round(breadth * 100)}/100` })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

function mergeFlags(modelFlags: string[], result?: SemanticNlpResult): string[] {
  const flags = [...modelFlags]
  const textOnly = result?.variables.every((v) => !v.embedding_verified)
  if (result && result.variables.length && textOnly && !flags.includes('text_only_judgment')) {
    flags.push('text_only_judgment')
  }
  if (result && (result.entity_gap_summary?.missing_entities || []).length && !flags.includes('low_entity_coverage')) {
    flags.push('low_entity_coverage')
  }
  return flags
}

export interface ScoreSemanticNlpOptions {
  pageUrl: string
  targetText: string
  competitorTexts: string[]
  lane1?: SemanticLane1
  maxTokens?: number
}

/** Run one well-scoped Semantic/NLP judgment call. Never throws. */
export async function scoreSemanticNlp(opts: ScoreSemanticNlpOptions): Promise<SemanticNlpResult> {
  const empty: SemanticNlpResult = {
    page_url: opts.pageUrl,
    subsystem: 'semantic_nlp',
    model_used: 'unavailable',
    scored_at: new Date().toISOString(),
    variables: [],
    entity_gap_summary: { missing_entities: [], top_competitor_url: null, top_competitor_entity_coverage: null },
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
      embeddings: opts.lane1?.embeddings || {},
      question_intent: Boolean(opts.lane1?.questionIntent),
    })
    const prompt = `TARGET PAGE (${opts.pageUrl}):\n${target}\n\n${competitors ? `COMPETITOR PAGES:\n${competitors}\n\n` : ''}TOOL DATA:\n${lane1Block}`

    const ai = await generateContentText({
      system: SEMANTIC_SYSTEM_PROMPT,
      prompt,
      maxTokens: opts.maxTokens ?? 2500,
      temperature: 0.2,
    })

    const parsed = parseSemanticNlpResponse(ai.text || '', opts.lane1?.embeddings)
    const result: SemanticNlpResult = {
      page_url: opts.pageUrl,
      subsystem: 'semantic_nlp',
      model_used: `${ai.provider}:${ai.model}`,
      scored_at: new Date().toISOString(),
      variables: parsed.variables,
      entity_gap_summary: parsed.entity_gap_summary,
      flags: parsed.flags,
    }
    result.flags = mergeFlags(result.flags, result)
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
export function semanticNlpPersist(result: SemanticNlpResult): {
  semantic_coverage_score: number | null
  semantic_topical_breadth_score: number | null
  semantic_missing_entities: string[]
  semantic_top_competitor: string | null
  semantic_top_competitor_coverage: number | null
  semantic_confidence_avg: number | null
  semantic_flags: string[]
  semantic_model_used: string
} {
  return {
    semantic_coverage_score: semanticNlpComposite(result),
    semantic_topical_breadth_score: varScore(result, 466),
    semantic_missing_entities: (result.entity_gap_summary?.missing_entities || []).slice(0, 30),
    semantic_top_competitor: result.entity_gap_summary?.top_competitor_url || null,
    semantic_top_competitor_coverage: result.entity_gap_summary?.top_competitor_entity_coverage ?? null,
    semantic_confidence_avg: semanticConfidenceAvg(result),
    semantic_flags: result.flags || [],
    semantic_model_used: result.model_used,
  }
}

/** Convenience: build Lane-1 facts (no embedding service wired yet → all text-only). */
export function buildSemanticLane1(opts: {
  questionIntent?: boolean
  embeddings?: Record<string, number>
}): SemanticLane1 {
  return {
    embeddings: opts.embeddings || {},
    questionIntent: Boolean(opts.questionIntent),
  }
}
