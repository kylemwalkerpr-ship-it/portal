/**
 * Map Ubersuggest last-good demand into Discover briefs.
 * These are market opportunities independent of the Master Engine planner —
 * they still hand off to Research → Plan → Draft like radar items.
 *
 * Coverage uses intent classification (lib/seoEngine/coverageIntent.ts):
 * paraphrases of a live owner → refresh; distinct SERP intents → content_gap
 * spokes. That is what builds topical authority instead of re-listing shipped work.
 */
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { normalizePlannerTopic } from './planner'
import { discoverCardTitle, isFillerTitle } from './titleLab'
import { bestOwnerMatch, isSameIntentOwner, type CoverageKind } from './coverageIntent'

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
  coverageKind?: CoverageKind
  ownerHint?: string
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
  const shippedOwners = (opts.shippedKeywords || []).map((s) => String(s || '').trim()).filter(Boolean)
  const shippedStems = new Set(shippedOwners.map(stem).filter(Boolean))
  const excluded = new Set((opts.excludeTopics || []).map((t) => normalizePlannerTopic(t)).filter(Boolean))
  const cap = Math.max(1, Math.min(40, opts.limit ?? 24))
  const seen = new Set<string>()
  const seenOwnerRefresh = new Set<string>()
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
    const match = bestOwnerMatch(row.term, [...shippedOwners, ...shippedStems])
    const kind = match?.kind
    const sameOwner = kind ? isSameIntentOwner(kind) : false
    const expandOwner = kind === 'section_expand'
    const spoke = kind === 'spoke'
    // Collapse paraphrase refreshes of the SAME owner into one card.
    if (sameOwner && match) {
      const ownerKey = normalizePlannerTopic(match.owner)
      if (seenOwnerRefresh.has(ownerKey)) continue
      seenOwnerRefresh.add(ownerKey)
    }
    const covered = sameOwner || expandOwner
    const play: 'content_gap' | 'refresh' = spoke || !covered ? 'content_gap' : 'refresh'
    const score = ubersuggestOpportunityScore(row.impressions)
    const title = discoverCardTitle(row.term, { siblingTitles: out.map((o) => o.title) })
    if (isFillerTitle(title)) continue
    const reason = spoke
      ? `Distinct search intent vs “${match?.owner}” (${row.impressions} est. monthly) — ship a spoke, not a refresh.`
      : expandOwner
        ? `Same intent as “${match?.owner}” with an audience/geo extra (${row.impressions} est. monthly) — add a section, do not ship a sibling.`
        : sameOwner
          ? `Ubersuggest market demand on an existing estate topic (${row.impressions} est. monthly) — refresh the canonical, do not ship a sibling.`
          : `Ubersuggest market opportunity (${row.impressions} est. monthly demand) — no shipped canonical on this intent.`
    out.push({
      topic: row.term,
      title,
      primaryKeyword: row.term,
      keywords: [row.term],
      audience: 'international applicants researching this route',
      impressions: row.impressions,
      clicks: 0,
      ctr: 0,
      position: covered && !spoke ? 28 : 55,
      demandScore: score,
      opportunityScore: score,
      difficultyScore: play === 'refresh' ? 42 : 58,
      trend: 'flat',
      play,
      intent: 'informational',
      contentType: 'article',
      intentCategory: 'informational',
      profitability: score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low',
      reason,
      signals: [
        'Ubersuggest',
        `${row.impressions} est. monthly demand`,
        spoke ? 'spoke — distinct SERP intent' : expandOwner ? 'expand owner section' : sameOwner ? 'estate already covers this intent' : 'no shipped canonical on this stem',
      ],
      source: 'ubersuggest',
      coverageKind: kind,
      ownerHint: match?.owner,
    })
  }
  return out
}
