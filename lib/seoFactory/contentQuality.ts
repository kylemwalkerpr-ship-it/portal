/**
 * lib/seoFactory/contentQuality.ts
 *
 * CONTENT QUALITY MODULE — Subsystem A (On-Page Content).
 *
 * Lane-2 LLM judgment over content a crawler cannot fully grade:
 * comprehensiveness vs competitors, intent match, readability *quality*
 * (not just a Flesch number), originality/thin/boilerplate detection,
 * snippet structure, and the content gap vs the SERP.
 *
 * This follows the exact discipline of lib/seoEngine/llmVisibility.ts:
 *   • Structured JSON only — no free-text answers parsed with regex as the
 *     primary path (regex is fallback-only, flagged `malformed_json`).
 *   • Every scored variable carries `evidence` + `confidence`, never a bare
 *     number.
 *   • Truthful provenance — `model_used` is the ACTUAL provider:model the
 *     cascade returned, never hardcoded. (The original citation module bug
 *     hardcoded `aiProvider:'openai'` while labeling output `'deepseek'` —
 *     that must never happen again.)
 *   • One well-scoped call per page (the multi-engine consensus pattern is
 *     citation-only and is NOT generalized here).
 *   • `buildContentActions` is a separate, pure, deterministic rules engine —
 *     it never calls an LLM to "decide" what to recommend.
 *
 * The deterministic (Lane-1) numbers — word counts, title/meta, reading
 * level — are NOT re-derived here. They are already computed by
 * masterEngine.computeSignals and are passed in via `lane1`.
 */

import { generateContentText } from '@/lib/contentAiProvider'
import { countBodyWords } from './contentDepth'

/** The explicit judgment variables from the taxonomy (the spec's Module 1
 *  "Scope" list — not the full 100-variable taxonomy). */
export const CONTENT_QUALITY_VARIABLES: ReadonlyArray<{
  id: number
  name: string
  desc: string
}> = [
  { id: 24, name: 'content_depth_score', desc: 'depth & comprehensiveness vs the top-ranking competitor pages' },
  { id: 42, name: 'intent_match_score', desc: 'how well the opening + structure match the query intent' },
  { id: 17, name: 'readability_quality', desc: 'whether the reading level suits the actual audience (not just a Flesch number)' },
  { id: 46, name: 'originality_score', desc: 'absence of duplicate/thin/boilerplate content (higher = more original)' },
  { id: 55, name: 'cannibalization_safety', desc: 'no internal page targeting the same intent (higher = safer)' },
  { id: 65, name: 'snippet_optimization', desc: 'answer-box / featured-snippet structural readiness' },
  { id: 58, name: 'content_gap_score', desc: 'coverage of the subtopics the top competitors cover (higher = fewer gaps)' },
  { id: 1, name: 'title_structure', desc: 'title / meta / heading structure and keyword placement' },
]

export interface ContentQualityVariable {
  id: number
  name: string
  score: number | null
  evidence: string
  confidence: number
}

export interface ContentGapSummary {
  missing_subtopics: string[]
  top_competitor_url: string | null
  top_competitor_depth_score: number | null
}

export interface ContentQualityResult {
  page_url: string
  subsystem: 'content_quality'
  model_used: string
  scored_at: string
  variables: ContentQualityVariable[]
  content_gap_summary: ContentGapSummary
  flags: string[]
}

/** Lane-1 deterministic facts the rules engine (and the LLM, as context)
 *  needs — never re-derived by the model. */
export interface ContentLane1 {
  targetWordCount: number | null
  medianCompetitorWordCount: number | null
  detectedIntent: string | null
  competingInternalUrls: string[]
}

export interface ContentAction {
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
  return CONTENT_QUALITY_VARIABLES.map((v) => `- ${v.id} ${v.name}: ${v.desc}`).join('\n')
}

const CONTENT_SYSTEM_PROMPT = `You are a scoring module in an SEO analysis engine. You will be given the cleaned text of a target page, up to 10 top-ranking competitor pages, and deterministic tool data (JSON).

Score ONLY the variables listed below. For each, return a value 0.0–1.0 plus a one-sentence justification citing specific evidence from the provided text. Do NOT estimate variables not listed. Do NOT invent data not present in the input. If evidence is insufficient to score a variable, return null for score and say why.

Output valid JSON only — no markdown, no prose outside the JSON — exactly matching this schema:
{
  "variables": [
    { "id": 24, "name": "content_depth_score", "score": 0.0, "evidence": "one sentence citing the text", "confidence": 0.0 }
  ],
  "content_gap_summary": {
    "missing_subtopics": ["string"],
    "top_competitor_url": "string",
    "top_competitor_depth_score": 0.0
  },
  "flags": ["thin_content_risk", "cannibalization_risk"]
}

Rules:
- "content_gap_summary.missing_subtopics" is the subtopics top competitors cover that the target page lacks (empty array if none).
- "content_gap_summary.top_competitor_url" is the single strongest competitor URL (or null).
- "content_gap_summary.top_competitor_depth_score" is that competitor's depth 0.0–1.0 (or null if unknown).
- "confidence" is 0.0–1.0 for how certain you are of that variable's score.
- Return ONLY the JSON.

VARIABLES FOR THIS CALL:
${variableListBlock()}`

interface ParsedContentResponse {
  variables: ContentQualityVariable[]
  content_gap_summary: ContentGapSummary
  flags: string[]
  answerText: string
}

/**
 * Parse the model's reply into structured evidence. Prefers the JSON contract;
 * falls back to a partial extraction flagged `malformed_json` so a bad model
 * never throws away the whole call.
 */
export function parseContentQualityResponse(text: string): ParsedContentResponse {
  const raw = (text || '').trim()
  const emptyGap: ContentGapSummary = { missing_subtopics: [], top_competitor_url: null, top_competitor_depth_score: null }

  const fence = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const start = fence.indexOf('{')
  const end = fence.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(fence.slice(start, end + 1)) as Record<string, unknown>
      const rawVars = Array.isArray(obj.variables) ? (obj.variables as Array<Record<string, unknown>>) : []
      const byName = new Map(CONTENT_QUALITY_VARIABLES.map((v) => [v.name, v.id]))
      const variables: ContentQualityVariable[] = []
      for (const rv of rawVars) {
        const name = asString(rv.name || '')
        const id = Number(rv.id) || byName.get(name) || 0
        if (!id) continue
        const scoreRaw = rv.score
        const score = scoreRaw == null || scoreRaw === '' ? null : clamp01(Number(scoreRaw))
        variables.push({
          id,
          name: name || (CONTENT_QUALITY_VARIABLES.find((v) => v.id === id)?.name ?? String(id)),
          score: score == null ? null : score,
          evidence: asString(rv.evidence || '').slice(0, 300),
          confidence: clamp01(Number(rv.confidence) || 0),
        })
      }
      const gap = (obj.content_gap_summary || {}) as Record<string, unknown>
      const missing = Array.isArray(gap.missing_subtopics) ? gap.missing_subtopics.map(asString).filter(Boolean).slice(0, 20) : []
      const topUrl = gap.top_competitor_url ? asString(gap.top_competitor_url) : null
      const topDepth = gap.top_competitor_depth_score == null ? null : clamp01(Number(gap.top_competitor_depth_score))
      const flags = Array.isArray(obj.flags) ? obj.flags.map(asString).filter(Boolean).slice(0, 10) : []
      return {
        variables,
        content_gap_summary: {
          missing_subtopics: missing,
          top_competitor_url: topUrl,
          top_competitor_depth_score: Number.isFinite(topDepth) ? topDepth : null,
        },
        flags,
        answerText: raw,
      }
    } catch {
      /* fall through to the flagged fallback */
    }
  }

  // Malformed fallback — no scores are trusted, but the gap summary is kept
  // empty so the call still stands (flagged) instead of throwing.
  return { variables: [], content_gap_summary: emptyGap, flags: ['malformed_json'], answerText: raw }
}

/** Average the scored variables (confidence-weighted, depth+intent favored). */
export function contentQualityComposite(result: ContentQualityResult): number | null {
  const scored = result.variables.filter((v) => v.score != null)
  if (!scored.length) return null
  const weighted = scored.reduce((a, v) => {
    const w = v.id === 24 ? 2 : v.id === 42 ? 1.5 : 1
    return a + (v.score as number) * w * (0.5 + v.confidence * 0.5)
  }, 0)
  const wsum = scored.reduce((a, v) => a + (v.id === 24 ? 2 : v.id === 42 ? 1.5 : 1) * (0.5 + v.confidence * 0.5), 0)
  return clamp01(weighted / wsum)
}

/** Average confidence across scored variables (0 when none). */
export function contentConfidenceAvg(result: ContentQualityResult): number {
  const scored = result.variables.filter((v) => v.score != null)
  return scored.length ? scored.reduce((a, v) => a + v.confidence, 0) / scored.length : 0
}

/** Variable lookup helper. */
function varScore(result: ContentQualityResult, id: number): number | null {
  const v = result.variables.find((x) => x.id === id)
  return v ? v.score : null
}

/**
 * Deterministic, prioritized fixes over the scored result + Lane-1 facts.
 * PURE — zero LLM calls. The rules are: thin → expand to competitor depth,
 * missing subtopics → add them in order, intent mismatch → rewrite opening,
 * cannibalization → consolidate with the named internal URL.
 */
export function buildContentActions(result: ContentQualityResult, lane1?: ContentLane1): ContentAction[] {
  const out: ContentAction[] = []
  const flags = new Set(result.flags || [])
  const missing = result.content_gap_summary?.missing_subtopics || []
  const top = result.content_gap_summary?.top_competitor_url || null
  const intentScore = varScore(result, 42)
  const cannibalSafety = varScore(result, 55)
  const depthScore = varScore(result, 24)

  const thin = flags.has('thin_content_risk') ||
    (lane1 && lane1.targetWordCount != null && lane1.medianCompetitorWordCount != null &&
      lane1.targetWordCount < lane1.medianCompetitorWordCount * 0.7)

  if (thin) {
    const gap = lane1 && lane1.targetWordCount != null && lane1.medianCompetitorWordCount != null
      ? Math.max(0, lane1.medianCompetitorWordCount - lane1.targetWordCount)
      : null
    out.push({
      priority: 4,
      action: gap
        ? `Expand to at least ${lane1?.medianCompetitorWordCount} words (+${gap} from the current ${lane1?.targetWordCount})`
        : 'Expand to at least the median competitor depth',
      evidence: top ? `Trails ${top} on depth (target depth ${depthScore == null ? '—' : Math.round(depthScore * 100)}/100)` : 'Thin-content risk flag',
    })
  }

  if (missing.length) {
    out.push({
      priority: 3,
      action: `Cover the missing subtopics competitors already rank for: ${missing.slice(0, 6).join(' · ')}`,
      evidence: top ? `Gap vs ${top} — ${missing.length} subtopic(s) missing` : `${missing.length} subtopic(s) missing vs the SERP`,
    })
  }

  if (intentScore != null && intentScore < 0.5) {
    out.push({
      priority: 2,
      action: `Rewrite the opening section to match ${lane1?.detectedIntent || 'the detected'} intent`,
      evidence: `Intent-match ${Math.round(intentScore * 100)}/100 — the page does not answer the query up front`,
    })
  }

  if (flags.has('cannibalization_risk') || (cannibalSafety != null && cannibalSafety < 0.5 && lane1 && lane1.competingInternalUrls.length)) {
    const competing = (lane1?.competingInternalUrls || [])[0]
    out.push({
      priority: 2,
      action: competing
        ? `Consolidate with the competing internal page ${competing} (301 or merge)`
        : 'Consolidate with the competing internal page that targets this intent',
      evidence: 'Cannibalization risk — multiple estate URLs target the same intent',
    })
  }

  if (!out.length) {
    out.push({ priority: 1, action: 'Sustain — content depth and coverage clear the SERP consensus', evidence: `Depth ${depthScore == null ? '—' : Math.round(depthScore * 100)}/100` })
  }
  return out.sort((a, b) => b.priority - a.priority)
}

/** Merge deterministic Lane-1 flags into the model's flags (never removed). */
function mergeFlags(modelFlags: string[], lane1?: ContentLane1, result?: ContentQualityResult): string[] {
  const flags = [...modelFlags]
  if (lane1 && lane1.targetWordCount != null && lane1.medianCompetitorWordCount != null &&
    lane1.targetWordCount < lane1.medianCompetitorWordCount * 0.7 && !flags.includes('thin_content_risk')) {
    flags.push('thin_content_risk')
  }
  const cannibalSafety = result ? varScore(result, 55) : null
  if (lane1 && lane1.competingInternalUrls.length && cannibalSafety != null && cannibalSafety < 0.5 && !flags.includes('cannibalization_risk')) {
    flags.push('cannibalization_risk')
  }
  return flags
}

export interface ScoreContentQualityOptions {
  pageUrl: string
  targetText: string
  competitorTexts: string[]
  lane1?: ContentLane1
  maxTokens?: number
}

/** Run one well-scoped Content Quality judgment call. Never throws — returns a
 *  flagged partial record on any failure so the pipeline keeps moving. */
export async function scoreContentQuality(opts: ScoreContentQualityOptions): Promise<ContentQualityResult> {
  const empty: ContentQualityResult = {
    page_url: opts.pageUrl,
    subsystem: 'content_quality',
    model_used: 'unavailable',
    scored_at: new Date().toISOString(),
    variables: [],
    content_gap_summary: { missing_subtopics: [], top_competitor_url: null, top_competitor_depth_score: null },
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
    const lane1Block = opts.lane1 ? JSON.stringify(opts.lane1) : '{}'
    const prompt = `TARGET PAGE (${opts.pageUrl}):\n${target}\n\n${competitors ? `COMPETITOR PAGES:\n${competitors}\n\n` : ''}TOOL DATA:\n${lane1Block}`

    const ai = await generateContentText({
      system: CONTENT_SYSTEM_PROMPT,
      prompt,
      maxTokens: opts.maxTokens ?? 2500,
      temperature: 0.2,
    })

    const parsed = parseContentQualityResponse(ai.text || '')
    const result: ContentQualityResult = {
      page_url: opts.pageUrl,
      subsystem: 'content_quality',
      model_used: `${ai.provider}:${ai.model}`,
      scored_at: new Date().toISOString(),
      variables: parsed.variables,
      content_gap_summary: parsed.content_gap_summary,
      flags: parsed.flags,
    }
    result.flags = mergeFlags(result.flags, opts.lane1, result)
    return result
  } catch (e) {
    return {
      ...empty,
      model_used: 'unavailable',
      flags: ['engine_error: ' + (e instanceof Error ? e.message.slice(0, 120) : 'unknown')],
    }
  }
}

/** Map a module result to the typed content_jobs columns (single source of
 *  truth for the backfill persistence — no drift between writers). */
export function contentQualityPersist(result: ContentQualityResult): {
  content_quality_score: number | null
  content_depth_score: number | null
  content_gap_missing_subtopics: string[]
  content_top_competitor: string | null
  content_top_competitor_depth: number | null
  content_confidence_avg: number | null
  content_flags: string[]
  content_model_used: string
} {
  const depth = varScore(result, 24)
  return {
    content_quality_score: contentQualityComposite(result),
    content_depth_score: depth,
    content_gap_missing_subtopics: (result.content_gap_summary?.missing_subtopics || []).slice(0, 20),
    content_top_competitor: result.content_gap_summary?.top_competitor_url || null,
    content_top_competitor_depth: result.content_gap_summary?.top_competitor_depth_score ?? null,
    content_confidence_avg: contentConfidenceAvg(result),
    content_flags: result.flags || [],
    content_model_used: result.model_used,
  }
}

/** Convenience: build Lane-1 facts from already-available deterministic data. */
export function buildContentLane1(opts: {
  targetText: string
  competitorTexts: string[]
  detectedIntent?: string | null
  competingInternalUrls?: string[]
}): ContentLane1 {
  const targetWords = countBodyWords(opts.targetText || '')
  const compWords = (opts.competitorTexts || []).map((t) => countBodyWords(t)).filter((n) => n > 0)
  const median = compWords.length
    ? [...compWords].sort((a, b) => a - b)[Math.floor(compWords.length / 2)]
    : null
  return {
    targetWordCount: targetWords > 0 ? targetWords : null,
    medianCompetitorWordCount: median,
    detectedIntent: opts.detectedIntent || null,
    competingInternalUrls: opts.competingInternalUrls || [],
  }
}
