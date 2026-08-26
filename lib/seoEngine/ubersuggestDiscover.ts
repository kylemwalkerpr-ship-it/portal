/**
 * Map Ubersuggest last-good demand into Discover briefs.
 * These are market opportunities independent of the Master Engine planner —
 * they still hand off to Research → Plan → Draft like radar items.
 */
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { normalizePlannerTopic } from './planner'

export interface UbersuggestSignalRow {
  term: string
  impressions: number
}

export interface UbersuggestDiscoverBrief {
  topic: string
  title: string
  primaryKeyword: string
  keywords: string[]
  audience: string
  impressions: number
  clicks: number
  ctr: number
  position: number
  demandScore: number
  opportunityScore: number
  difficultyScore: number
  trend: 'rising' | 'flat' | 'declining'
  play: 'content_gap' | 'refresh'
  intent: 'informational'
  contentType: 'article'
  intentCategory: string
  profitability: 'high' | 'medium' | 'low'
  reason: string
  signals: string[]
  source: 'ubersuggest'
}

export function titleizeKeyword(term: string): string {
  return String(term || '')
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

export function ubersuggestOpportunityScore(impressions: number): number {
  const n = Math.max(0, Number(impressions) || 0)
  return Math.max(28, Math.min(96, Math.round(36 + Math.log10(n + 1) * 18)))
}

function stem(term: string): string {
  return normalizePlannerTopic(term).split(/\s+/).slice(0, 4).join(' ')
}

/** Tokenise a keyword into meaningful lowercase words (>= 3 chars, no junk). */
function tokens(term: string): string[] {
  return String(term || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3 && !STOP.has(t))
}
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'that', 'this', 'how', 'what', 'are', 'can', 'not', 'has', 'was', 'but', 'its', 'you', 'all', 'any', 'our', 'who', 'why', 'when', 'where'])

/** Check whether a Ubersuggest term is already covered by shipped content.
 * Uses three strategies in order:
 *   1. Exact stem match (f-1 visa interview == f-1 visa interview)
 *   2. Substring containment (f-1 visa interview tips contains f-1 visa interview)
 *   3. Token overlap — 70%+ of the signal's meaningful tokens appear in a shipped title/keyword
 *      (catches paraphrases like "F1 visa interview prep" vs "F-1 Visa Interview")
 */
function isCovered(term: string, shippedStems: Set<string>, shippedTokens: string[][]): boolean {
  const s = stem(term)
  if (shippedStems.has(s)) return true
  const key = normalizePlannerTopic(term)
  for (const ss of shippedStems) {
    if (key.includes(ss) || ss.includes(key)) return true
  }
  const termTokens = tokens(term)
  if (termTokens.length < 2) return false
  for (const st of shippedTokens) {
    if (st.length === 0) continue
    const overlap = termTokens.filter((t) => st.includes(t)).length
    if (overlap / termTokens.length >= 0.7) return true
  }
  return false
}

export function ubersuggestSignalsToDiscover(
  signals: UbersuggestSignalRow[],
  opts: { shippedKeywords?: string[]; excludeTopics?: string[]; limit?: number } = {},
): UbersuggestDiscoverBrief[] {
  const shippedStems = new Set((opts.shippedKeywords || []).map(stem).filter(Boolean))
  const shippedTokensList = (opts.shippedKeywords || []).map(tokens).filter((t) => t.length > 0)
  const excluded = new Set((opts.excludeTopics || []).map((t) => normalizePlannerTopic(t)).filter(Boolean))
  const cap = Math.max(1, Math.min(40, opts.limit ?? 24))
  const seen = new Set<string>()
  const out: UbersuggestDiscoverBrief[] = []

  const ranked = [...signals]
    .map((s) => ({ term: String(s.term || '').trim(), impressions: Math.max(0, Number(s.impressions) || 0) }))
    .filter((s) => s.term && !isJunkQuery(s.term))
    .sort((a, b) => b.impressions - a.impressions)

  for (const row of ranked) {
    if (out.length >= cap) break
    const key = normalizePlannerTopic(row.term)
    if (!key || seen.has(key) || excluded.has(key)) continue
    seen.add(key)
    const covered = isCovered(row.term, shippedStems, shippedTokensList)
    const score = ubersuggestOpportunityScore(row.impressions)
    out.push({
      topic: row.term,
      title: titleizeKeyword(row.term),
      primaryKeyword: row.term,
      keywords: [row.term],
      audience: 'international applicants researching this route',
      impressions: row.impressions,
      clicks: 0,
      ctr: 0,
      position: covered ? 28 : 55,
      demandScore: score,
      opportunityScore: score,
      difficultyScore: covered ? 42 : 58,
      trend: 'flat',
      play: covered ? 'refresh' : 'content_gap',
      intent: 'informational',
      contentType: 'article',
      intentCategory: 'informational',
      profitability: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
      reason: covered
        ? `Ubersuggest market demand on an existing estate topic (${row.impressions} est. monthly) — refresh the canonical, do not ship a sibling.`
        : `Ubersuggest market opportunity (${row.impressions} est. monthly demand) — independent of Master Engine cluster plans.`,
      signals: [
        'Ubersuggest',
        `${row.impressions} est. monthly demand`,
        covered ? 'estate already covers this topic' : 'no shipped canonical on this stem',
      ],
      source: 'ubersuggest',
    })
  }
  return out
}
