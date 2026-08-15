/**
 * Opportunity Intelligence Engine — the algorithmic core of the SEO Command Center.
 *
 * Converts raw search data (GSC queries, content inventory, internal-link
 * registry) into ranked, explainable content opportunities. Every score is
 * deterministic and every suggestion carries a human-readable `signals` trail,
 * so output is verifiable, accountable and transparent by construction.
 *
 * Scoring model (all 0-100):
 *   demandScore     log-scaled demand from impressions + clicks
 *   upsideScore     CTR gap vs expected CTR at the current position
 *   trendScore      rising / flat / declining momentum
 *   difficultyScore position + head-term proxy for rankability
 *   opportunityScore = 0.34·demand + 0.30·upside + 0.14·trend + 0.22·(100−difficulty) + play bonus
 *
 * Play classification:
 *   content_gap     no existing coverage — create new content
 *   quick_win       you rank #8–20 with impressions — tune & push to page 1
 *   refresh         one existing page underperforms — rewrite / expand
 *   defend          a page already ranks well — hold & strengthen
 *   cannibalization 2+ pages already target it — do NOT create another
 */

import { isJunkQuery } from './queryNoise'

export interface OpportunityQuery {
  term: string
  impressions: number
  clicks: number
  ctr: number // 0-1 fraction (tolerates percent input)
  position: number // 1-100+
  page?: string
  trend?: -1 | 0 | 1
  /** Position trajectory over time (oldest → newest). Fills trendScore when present. */
  history?: Array<{ date?: string; position: number; impressions: number; clicks?: number }>
}

export interface CoverageItem {
  title: string
  topic?: string | null
  primaryKeyword?: string | null
  status?: string | null
  url?: string | null
}

export interface InterlinkOption {
  label: string
  url: string
  site?: string
  kind?: string
}

export type Intent = 'informational' | 'commercial' | 'transactional' | 'local' | 'navigational'
export type Play = 'content_gap' | 'quick_win' | 'refresh' | 'defend' | 'cannibalization'
export type Trend = 'rising' | 'flat' | 'declining'

export interface Opportunity {
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
  upsideScore: number
  trendScore: number
  difficultyScore: number
  opportunityScore: number
  trend: Trend
  play: Play
  intent: Intent
  contentType: 'blog_post' | 'article' | 'regional_page' | 'marketplace_gig'
  signals: string[]
  interlinks: Array<{ label: string; url: string; site: string; matchedOn: string[] }>
  coverage: { matched: boolean; matches: string[] }
  sourcePage?: string
  profitability: 'high' | 'medium' | 'low'
  reason: string
  /** Position trajectory (oldest → newest) when GSC history is available. */
  history?: Array<{ date?: string; position: number; impressions: number }>
  /** last - first position (negative = improving, lower rank number). */
  positionDelta?: number
}

export interface OpportunityEngineResult {
  opportunities: Opportunity[]
  cannibalization: Array<{ term: string; pages: string[]; impressions: number }>
  coverageStats: { total: number; covered: number; gaps: number }
}

export interface OpportunityEngineInput {
  queries: OpportunityQuery[]
  coverage?: CoverageItem[]
  interlinks?: InterlinkOption[]
  region?: string
  relatedByTerm?: Record<string, string[]>
  limit?: number
}

// Expected organic CTR by position (industry benchmark, 2024-2025 blend).
const BASELINE_CTR: Array<[number, number]> = [
  [1, 0.276], [2, 0.157], [3, 0.110], [4, 0.084], [5, 0.068],
  [6, 0.055], [7, 0.047], [8, 0.040], [9, 0.034], [10, 0.029],
]

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'and', 'or', 'with', 'vs', 'is', 'are',
  'how', 'what', 'why', 'when', 'where', 'can', 'do', 'does', 'get', 'your', 'my', 'i',
])

function baselineCtrFor(position: number): number {
  if (position <= 0) return 0
  const p = Math.round(position)
  if (p <= 10) return BASELINE_CTR[p - 1][1]
  if (p <= 15) return 0.017
  if (p <= 20) return 0.011
  if (p <= 30) return 0.006
  if (p <= 50) return 0.003
  return 0.001
}

/**
 * Derive momentum from a position trajectory (oldest → newest).
 * Position number decreasing = ranking up = rising.
 */
function trendFromHistory(history?: OpportunityQuery['history']): -1 | 0 | 1 {
  if (!history) return 0
  const pos = history.map((h) => h.position).filter((p) => p > 0)
  if (pos.length < 2) return 0
  const mid = Math.floor(pos.length / 2)
  const first = pos.slice(0, mid).reduce((a, b) => a + b, 0) / mid
  const second = pos.slice(mid).reduce((a, b) => a + b, 0) / (pos.length - mid)
  const delta = first - second // + = recent positions improved (lower number)
  if (delta >= 1.5) return 1
  if (delta <= -1.5) return -1
  return 0
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

function tokens(term: string): string[] {
  return (term || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

function uniqueTokens(terms: string[]): Set<string> {
  const out = new Set<string>()
  for (const t of terms) for (const tok of tokens(t)) out.add(tok)
  return out
}

function overlapRatio(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return 0
  const setB = new Set(tb)
  let shared = 0
  for (const t of ta) if (setB.has(t)) shared += 1
  const union = new Set([...ta, ...tb]).size
  return shared / Math.max(1, union)
}

function classifyIntent(term: string, page?: string): Intent {
  const t = `${term} ${page ?? ''}`.toLowerCase()
  if (/apply|fee|cost|price|buy|hire|book|register|sign.?up|pay|enroll|eligib/i.test(t)) return 'transactional'
  if (/best|top|vs|versus|compare|comparison|review|alternative|rating/i.test(t)) return 'commercial'
  if (/near|location|embassy|consulate|office|city|district|address|university|college/i.test(t)) return 'local'
  if (/login|portal|account|status|track|check/i.test(t)) return 'navigational'
  return 'informational'
}

function contentTypeFor(intent: Intent): Opportunity['contentType'] {
  if (intent === 'local') return 'regional_page'
  if (intent === 'commercial') return 'article'
  if (intent === 'transactional') return 'article'
  return 'blog_post'
}

const AUDIENCE_BY_REGION: Record<string, string> = {
  US: 'international students, H-1B professionals, green card applicants',
  CA: 'international students, Express Entry candidates, PGWP holders',
  AU: 'international students, skilled migrants, 485 visa holders',
  UK: 'international students, Skilled Worker applicants, family visa seekers',
  COMPARE: 'international students comparing immigration pathways, professionals weighing options',
}

function titleFor(term: string, intent: Intent, play: Play): string {
  const year = new Date().getFullYear()
  const titleCase = term.replace(/\b\w/g, (c) => c.toUpperCase())
  if (play === 'quick_win') return `${titleCase}: ${year} Ranking Playbook & Updates`
  if (play === 'refresh') return `${titleCase} — ${year} Refresh: Everything New`
  if (play === 'defend') return `${titleCase}: ${year} Authority Guide`
  if (intent === 'commercial') return `Best ${titleCase} in ${year} — Compared`
  if (intent === 'transactional') return `How to Apply for ${titleCase} — ${year} Step-by-Step`
  if (intent === 'local') return `${titleCase} Near You — ${year} Locations & Info`
  if (intent === 'navigational') return `${titleCase} — Official Portal & Status Guide ${year}`
  return `Complete Guide: ${titleCase} ${year}`
}

function profitabilityFor(intent: Intent, impressions: number): Opportunity['profitability'] {
  if (intent === 'transactional' || intent === 'commercial') return 'high'
  if (impressions > 500) return 'medium'
  return 'low'
}

export function scoreOpportunities(input: OpportunityEngineInput): OpportunityEngineResult {
  const {
    queries,
    coverage = [],
    interlinks = [],
    region = 'US',
    relatedByTerm = {},
    limit = 60,
  } = input

  // Deduplicate queries — keep the strongest signal per term
  const byTerm = new Map<string, OpportunityQuery>()
  for (const q of queries) {
    const term = (q.term || '').trim().toLowerCase()
    if (!term || term.length < 3) continue
    if (/\byousafe\b/i.test(term)) continue
    const existing = byTerm.get(term)
    if (!existing || q.impressions > existing.impressions) byTerm.set(term, q)
  }
  const pool = [...byTerm.values()].sort((a, b) => b.impressions - a.impressions).slice(0, limit * 3)

  // Coverage fingerprint from the existing content inventory
  const coverageTokens: Array<{ raw: string; toks: Set<string> }> = coverage
    .filter((c) => c && (c.title || c.topic || c.primaryKeyword))
    .map((c) => ({
      raw: c.title || c.topic || c.primaryKeyword || '',
      toks: uniqueTokens([c.title || '', c.topic || '', c.primaryKeyword || '']),
    }))

  const opportunities: Opportunity[] = []
  const cannibalization: OpportunityEngineResult['cannibalization'] = []

  for (const q of pool) {
    const term = q.term.trim().toLowerCase()
    const impressions = Math.max(0, q.impressions || 0)
    const clicks = Math.max(0, q.clicks || 0)
    const ctr = q.ctr > 1 ? q.ctr / 100 : q.ctr || 0
    const position = Math.max(1, Math.round(q.position || 51))
    const trend = q.trend ?? trendFromHistory(q.history)

    // ── Coverage & play classification ──
    const termSet = uniqueTokens([term])
    const matches: string[] = []
    for (const c of coverageTokens) {
      if (c.raw.toLowerCase() === term) {
        matches.push(c.raw)
        continue
      }
      const tSet = c.toks
      let shared = 0
      for (const t of termSet) if (tSet.has(t)) shared += 1
      const jac = shared / Math.max(1, termSet.size + tSet.size - shared)
      if (jac >= 0.4 || (shared >= 2 && term.length >= 4)) matches.push(c.raw)
    }

    let play: Play
    if (matches.length >= 2) play = 'cannibalization'
    else if (matches.length === 1)
      play = position <= 5 && clicks >= Math.max(1, impressions * 0.03) ? 'defend' : 'refresh'
    else play = position <= 20 && impressions >= 20 ? 'quick_win' : 'content_gap'

    // ── Scores ──
    const demandScore = Math.min(100, Math.round(42 * Math.log10(impressions + 1) + 16 * Math.log10(clicks + 1)))
    const baseCtr = baselineCtrFor(position)
    const ctrGap = baseCtr > 0 ? Math.max(0, baseCtr - ctr) / baseCtr : 0
    const upsideScore =
      position <= 20
        ? Math.min(100, Math.round(ctrGap * 100))
        : Math.min(100, Math.round((baseCtr / 0.1) * 100))
    let trendScore = trend === 1 ? 100 : trend === -1 ? 15 : 55
    // Magnitude-scaled when a real trajectory exists (±10 positions ≈ full scale)
    if (q.history) {
      const pos = q.history.map((h) => h.position).filter((p) => p > 0)
      if (pos.length >= 2) {
        const mid = Math.floor(pos.length / 2)
        const first = pos.slice(0, mid).reduce((a, b) => a + b, 0) / mid
        const second = pos.slice(mid).reduce((a, b) => a + b, 0) / (pos.length - mid)
        const delta = Math.max(-10, Math.min(10, first - second))
        trendScore = Math.max(0, Math.min(100, Math.round(55 + delta * 6)))
      }
    }
    let difficultyScore = Math.min(100, Math.round(34 + position * 2.2))
    if (impressions > 8000) difficultyScore += 12
    if (impressions > 20000) difficultyScore += 12
    difficultyScore = Math.min(100, difficultyScore)

    const playBonus =
      play === 'quick_win' ? 7 : play === 'content_gap' ? 5 : play === 'refresh' ? 3 : play === 'defend' ? 0 : -45
    const opportunityScore = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          0.34 * demandScore + 0.3 * upsideScore + 0.14 * trendScore + 0.22 * (100 - difficultyScore) + playBonus,
        ),
      ),
    )

    const intent = classifyIntent(term, q.page)
    const trendLabel: Trend = trend === 1 ? 'rising' : trend === -1 ? 'declining' : 'flat'

    // ── Signals trail (transparency) ──
    const signals: string[] = []
    signals.push(
      position <= 30
        ? `Ranks #${position} · ${fmt(impressions)} impressions · ${fmt(clicks)} clicks (${(ctr * 100).toFixed(1)}% CTR)`
        : `No first-page presence · ${fmt(impressions)} impressions on related terms`,
    )
    if (position <= 20) {
      const recoverable = Math.max(0, Math.round((baseCtr - ctr) * impressions))
      signals.push(`CTR gap vs expected #${position} (~${(baseCtr * 100).toFixed(1)}%): ~${fmt(recoverable)} clicks/mo on the table`)
    } else {
      signals.push(`Reaching page 1 (~${(baselineCtrFor(10) * 100).toFixed(1)}% CTR) could add ~${fmt(baselineCtrFor(10) * impressions)} clicks/mo`)
    }
    signals.push(`Demand ${demandScore}/100 · difficulty est. ${difficultyScore}/100`)
    if (q.history) {
      const pos = q.history.map((h) => h.position).filter((p) => p > 0)
      if (pos.length >= 2) {
        signals.push(`Position #${pos[0]} → #${pos[pos.length - 1]} across ${q.history.length} windows`)
      }
    }
    if (trend !== 0) signals.push(trend === 1 ? 'Momentum: rising — publish while demand grows' : 'Momentum: declining — freshness matters')
    if (matches.length === 0) signals.push('Content gap: no existing page targets this query')
    else if (play === 'refresh') signals.push(`Existing page “${matches[0].slice(0, 48)}” underperforms — expand & relink`)
    else if (play === 'cannibalization') signals.push(`⚠ ${matches.length} existing pages target this — consolidate, don't create another`)
    else signals.push(`Coverage exists: ${matches[0].slice(0, 48)}`)

    // ── Internal linking strategy (semantic match vs ecosystem registry) ──
    const ranked: Array<{ opt: InterlinkOption; matchedOn: string[]; score: number }> = []
    for (const opt of interlinks) {
      const label = opt.label || opt.url || ''
      const ratio = overlapRatio(`${term} ${term}`, label)
      const matchedOn = [...termSet].filter((t) => tokens(label).includes(t)).slice(0, 3)
      if (matchedOn.length === 0 && ratio < 0.25) continue
      ranked.push({
        opt,
        matchedOn: matchedOn.length ? matchedOn : [label.split(' ').slice(0, 3).join(' ')],
        score: ratio,
      })
    }
    ranked.sort((a, b) => b.score - a.score)
    const interlinkTargets = ranked.slice(0, 4).map((r) => ({
      label: r.opt.label || r.opt.url,
      url: r.opt.url,
      site: r.opt.site || 'caseworks',
      matchedOn: r.matchedOn,
    }))

    const keywords = (relatedByTerm[term] || []).slice(0, 5)
    const audience = AUDIENCE_BY_REGION[region] || AUDIENCE_BY_REGION.US

    opportunities.push({
      topic: term,
      title: titleFor(term, intent, play),
      primaryKeyword: term,
      keywords: keywords.length ? [term, ...keywords] : [term],
      audience,
      impressions,
      clicks,
      ctr: Math.round(ctr * 10000) / 10000,
      position,
      demandScore,
      upsideScore,
      trendScore,
      difficultyScore,
      opportunityScore,
      trend: trendLabel,
      play,
      intent,
      contentType: contentTypeFor(intent),
      signals: signals.slice(0, 4),
      interlinks: interlinkTargets,
      coverage: { matched: matches.length > 0, matches: matches.slice(0, 3) },
      sourcePage: q.page,
      profitability: profitabilityFor(intent, impressions),
      reason: `${play.replace('_', ' ')} · #${position} · ${fmt(impressions)} imp/mo · ${intent}`,
      history: q.history
        ? q.history.filter((h) => h.position > 0).map((h) => ({ date: h.date, position: h.position, impressions: h.impressions }))
        : undefined,
      positionDelta: (() => {
        const pos = (q.history || []).map((h) => h.position).filter((p) => p > 0)
        if (pos.length < 2) return undefined
        return Math.round((pos[pos.length - 1] - pos[0]) * 10) / 10
      })(),
    })

    if (play === 'cannibalization' && !isJunkQuery(term)) {
      cannibalization.push({ term, pages: matches.slice(0, 4), impressions })
    }
  }

  opportunities.sort((a, b) => b.opportunityScore - a.opportunityScore)
  const top = opportunities.slice(0, limit)
  const covered = top.filter((o) => o.coverage.matched).length

  return {
    opportunities: top,
    cannibalization,
    coverageStats: { total: coverage.length, covered, gaps: top.length - covered },
  }
}
