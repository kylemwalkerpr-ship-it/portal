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

export function ubersuggestSignalsToDiscover(
  signals: UbersuggestSignalRow[],
  opts: { shippedKeywords?: string[]; excludeTopics?: string[]; limit?: number } = {},
): UbersuggestDiscoverBrief[] {
  const shipped = new Set((opts.shippedKeywords || []).map(stem).filter(Boolean))
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
    const covered = shipped.has(stem(row.term)) || [...shipped].some((s) => s && (key.includes(s) || s.includes(key)))
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
        covered ? 'estate already covers this stem' : 'no shipped canonical on this stem',
      ],
      source: 'ubersuggest',
    })
  }
  return out
}
