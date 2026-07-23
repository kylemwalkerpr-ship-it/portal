/**
 * SEO War Room — technician-grade opportunity engine.
 *
 * Goal: rank *what to ship* by estimated ranking gain, not vanity volume.
 * Pulls GSC queries + pages (live or snapshot), applies noise filters,
 * Google CTR curve gaps, strike-distance, cannibalization, decay proxies,
 * and estate authority — then emits playbook actions for Content Studio.
 */

import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'
import { resolveOwner } from './ownership'
import {
  scoreTopicAuthority,
  authorityPromptHints,
  type AuthorityBreakdown,
} from './authorityScoring'

export type WarPlay =
  | 'title_ctr_rewrite' // pos 4–15, CTR far below expected → rewrite title/meta/H1
  | 'strike_distance' // pos 11–20, solid impr → expand to page-1
  | 'page1_defend' // pos ≤10, protect with depth/FAQ/links
  | 'deep_demand_build' // pos >20, high impr → full guide / new or expand
  | 'cannibal_merge' // same query multi-page → consolidate
  | 'decay_refresh' // page lost clicks vs prior window
  | 'aeo_entity_hub' // high authority entity/topic for AI Overviews + citations
  | 'ignore_noise' // brand/spam/thin

export interface WarOpportunity {
  id: string
  term: string
  play: WarPlay
  /** Higher = do first. Composite of traffic opportunity × win probability × authority */
  priorityScore: number
  impressions: number
  clicks: number
  ctr: number
  position: number
  expectedCtr: number
  ctrGap: number
  /** Rough incremental clicks if CTR moves halfway to expected (or position to 8) */
  estimatedGainClicks: number
  region: string
  contentType: string
  host: string | null
  repo: string | null
  ownerUrl: string | null
  filePath: string | null
  authorityScore: number
  contentAngle: AuthorityBreakdown['contentAngle']
  writeHint: string
  rationale: string
  shipHint: 'pr' | 'merge' | 'none'
  pages?: Array<{ url: string; impressions: number; clicks: number; position: number }>
}

export interface WarRoomResult {
  source: 'live' | 'snapshot' | 'mixed'
  siteUrl: string | null
  rangeDays: number
  generatedAt: string
  summary: string
  warnings: string[]
  /** Ranked actionable opportunities (noise filtered) */
  queue: WarOpportunity[]
  /** Quick buckets for UI */
  buckets: {
    title_ctr_rewrite: WarOpportunity[]
    strike_distance: WarOpportunity[]
    deep_demand_build: WarOpportunity[]
    cannibal_merge: WarOpportunity[]
    aeo_entity_hub: WarOpportunity[]
    page1_defend: WarOpportunity[]
  }
  /** Terms ready for Auto-Pilot (top N non-ignore) */
  autoRunTerms: string[]
  autoRunBody: {
    terms: string[]
    limit: number
    shipMode: 'none' | 'pr' | 'merge'
    minAuditScore: number
    maxRefine: number
    skipRecent: boolean
    useKeywordPlan: boolean
  }
  kpis: {
    queriesAnalyzed: number
    actionable: number
    estimatedGainClicksSum: number
    avgAuthority: number
    liveGsc: boolean
  }
}

type Q = { term: string; impressions: number; clicks: number; ctr: number; position: number }
type P = { url: string; impressions: number; clicks: number; ctr: number; position: number }

/** Google-ish organic CTR curve by average position (rough, desktop+mobile blend). */
export function expectedCtrAtPosition(pos: number): number {
  if (pos <= 1) return 0.28
  if (pos <= 2) return 0.15
  if (pos <= 3) return 0.11
  if (pos <= 4) return 0.08
  if (pos <= 5) return 0.06
  if (pos <= 6) return 0.05
  if (pos <= 7) return 0.04
  if (pos <= 8) return 0.035
  if (pos <= 9) return 0.03
  if (pos <= 10) return 0.025
  if (pos <= 15) return 0.015
  if (pos <= 20) return 0.01
  if (pos <= 30) return 0.006
  return 0.003
}

/** Kill brand, pure noise, meal-plan spam, ultra-thin queries that waste crawl budget. */
export function isNoiseQuery(term: string): boolean {
  const t = term.toLowerCase().trim()
  if (!t || t.length < 3) return true
  if (/yousafe|mycaseworks|yousafeconsultancy/.test(t)) return true
  // Quoted multi-fragment noise from GSC (often PDF/snippet garbage)
  if ((t.match(/"/g) || []).length >= 2 && t.split(/\s+/).length > 8) return true
  // Off-estate spam / housing meal plans / random university brochure
  if (/meal plan|room and meal|stockton room|housing rates final/.test(t)) return true
  // Pure number codes with no immigration context
  if (/^\d{3,5}\b/.test(t) && !/485|subclass|i-?\d|form/.test(t)) return true
  // Single stopword-ish
  if (/^(a|the|and|or|to|for|in|on|of)$/.test(t)) return true
  return false
}

function inferRegion(term: string): string {
  if (/uk|british|graduate route|ukvi|skilled worker|ilr|brp|cas\b/i.test(term)) return 'UK'
  if (/canada|canadian|pgwp|express entry|ircc|study permit|lmia|pnp/i.test(term)) return 'CA'
  if (/485|pte|australia|home affairs|subclass|ielts.*485|gs requirement/i.test(term)) return 'AU'
  return 'US'
}

function inferContentType(term: string, play: WarPlay): string {
  if (play === 'title_ctr_rewrite') return 'legal_guide'
  if (/from [a-z]+|visa from/i.test(term)) return 'regional_from'
  if (/university|college|campus/i.test(term) && !/housing|tenant/i.test(term)) {
    return 'regional_university'
  }
  if (/blog|news|update|what is/i.test(term)) return 'blog_summary'
  return 'legal_guide'
}

type QpRow = { term: string; url: string; impressions: number; clicks: number; position: number }

async function loadGscRows(days: number): Promise<{
  source: 'live' | 'snapshot'
  siteUrl: string | null
  queries: Q[]
  pages: P[]
  queryPages: QpRow[]
  warnings: string[]
  live: boolean
}> {
  const warnings: string[] = []
  let queries: Q[] = []
  let pages: P[] = []
  let queryPages: QpRow[] = []
  let source: 'live' | 'snapshot' = 'snapshot'
  let siteUrl: string | null = process.env.GSC_SITE_URL || 'sc-domain:yousafeconsultancy.com'
  let live = false

  const access = await getGscAccess()
  if (access?.accessToken && access.siteUrl) {
    siteUrl = access.siteUrl
    try {
      const end = new Date().toISOString().slice(0, 10)
      const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
      const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`
      const headers = {
        Authorization: `Bearer ${access.accessToken}`,
        'Content-Type': 'application/json',
      }
      const bodyQ = {
        startDate: start,
        endDate: end,
        dimensions: ['query'],
        rowLimit: 250,
        dataState: 'all',
      }
      const bodyP = {
        startDate: start,
        endDate: end,
        dimensions: ['page'],
        rowLimit: 100,
        dataState: 'all',
      }
      // query+page for cannibalization
      const bodyQP = {
        startDate: start,
        endDate: end,
        dimensions: ['query', 'page'],
        rowLimit: 500,
        dataState: 'all',
      }
      const [qRes, pRes, qpRes] = await Promise.all([
        fetch(base, { method: 'POST', headers, body: JSON.stringify(bodyQ) }),
        fetch(base, { method: 'POST', headers, body: JSON.stringify(bodyP) }),
        fetch(base, { method: 'POST', headers, body: JSON.stringify(bodyQP) }),
      ])
      if (qRes.ok) {
        const json = (await qRes.json()) as {
          rows?: Array<{
            keys?: string[]
            impressions?: number
            clicks?: number
            ctr?: number
            position?: number
          }>
        }
        queries = (json.rows || [])
          .map((r) => ({
            term: (r.keys?.[0] || '').trim(),
            impressions: r.impressions || 0,
            clicks: r.clicks || 0,
            ctr: r.ctr || 0,
            position: r.position || 100,
          }))
          .filter((q) => q.term && q.impressions > 0)
        if (queries.length) {
          source = 'live'
          live = true
        }
      } else {
        warnings.push(`GSC queries HTTP ${qRes.status}`)
      }
      if (pRes.ok) {
        const json = (await pRes.json()) as {
          rows?: Array<{
            keys?: string[]
            impressions?: number
            clicks?: number
            ctr?: number
            position?: number
          }>
        }
        pages = (json.rows || [])
          .map((r) => ({
            url: (r.keys?.[0] || '').trim(),
            impressions: r.impressions || 0,
            clicks: r.clicks || 0,
            ctr: r.ctr || 0,
            position: r.position || 100,
          }))
          .filter((p) => p.url)
      }
      if (qpRes.ok) {
        const json = (await qpRes.json()) as {
          rows?: Array<{
            keys?: string[]
            impressions?: number
            clicks?: number
            position?: number
          }>
        }
        queryPages = (json.rows || []).map((r) => ({
          term: (r.keys?.[0] || '').trim(),
          url: (r.keys?.[1] || '').trim(),
          impressions: r.impressions || 0,
          clicks: r.clicks || 0,
          position: r.position || 100,
        }))
      } else if (qpRes.status) {
        warnings.push(`GSC query×page HTTP ${qpRes.status}`)
      }
    } catch (e) {
      warnings.push(e instanceof Error ? e.message : 'Live GSC failed')
    }
  } else {
    warnings.push('No live GSC token — using snapshot demand feed')
  }

  if (!queries.length) {
    const snap = await loadGscSnapshot()
    queries = [
      ...(snap.opportunities?.highImpressionLowCtr || []),
      ...(snap.opportunities?.highImpressionDeepRank || []),
      ...(snap.topQueries || []),
    ]
    const seen = new Set<string>()
    queries = queries.filter((q) => {
      if (!q.term || seen.has(q.term) || q.impressions < 1) return false
      seen.add(q.term)
      return true
    })
    pages = (snap.topPages || []).map((p) => ({
      url: p.url,
      impressions: p.impressions,
      clicks: p.clicks,
      ctr: p.ctr,
      position: p.position,
    }))
    source = 'snapshot'
  }

  return { source, siteUrl, queries, pages, queryPages, warnings, live }
}

/**
 * Play-specific generation instructions — injected into factory prompts.
 * These are the SERP/AEO tactics Google's systems actually reward.
 */
export function playWriteHint(play: WarPlay, opts?: {
  position?: number
  expectedCtr?: number
  ctr?: number
  pages?: Array<{ url: string }>
}): string {
  const pos = opts?.position?.toFixed(1) ?? '?'
  const exp = opts?.expectedCtr != null ? `${(opts.expectedCtr * 100).toFixed(1)}%` : '?'
  const act = opts?.ctr != null ? `${(opts.ctr * 100).toFixed(2)}%` : '?'
  switch (play) {
    case 'title_ctr_rewrite':
      return [
        `PLAY title_ctr_rewrite (pos ${pos}, CTR ${act} vs expected ~${exp}).`,
        'PRIMARY WIN: title + meta description + H1 that maximize organic CTR without clickbait.',
        'Title formula: [Primary keyword] + [year or concrete outcome] + [region/audience] — under 60 chars where possible.',
        'Meta: 140–160 chars, include a concrete next step (checklist, documents, timeline) and primary keyword once.',
        'Open with a direct answer in the first 40 words. Expand depth so the page earns the improved CTR.',
        'Keep primary keyword in H1; use close variants in H2s. No title spam.',
      ].join(' ')
    case 'strike_distance':
      return [
        `PLAY strike_distance (page-2 avg pos ${pos} → target page-1).`,
        'Expand the existing intent with: comparison table, document checklist, step-by-step procedure, common refusals/risks, FAQs that match People Also Ask.',
        'Add internal links to related estate hubs. Strengthen entity coverage (forms, agencies, subclasses).',
        'Aim for definitive resource depth (≥1200 words legal_guide) so Google can promote from 11–20 → top 10.',
      ].join(' ')
    case 'page1_defend':
      return [
        `PLAY page1_defend (already page-1 at pos ${pos}).`,
        'Protect ranking: refresh dates, tighten definitions, add 2–3 new FAQs, reinforce official source URLs,',
        'add FAQPage + Article schema, improve TL;DR for AI Overviews. Do not dilute primary keyword focus.',
      ].join(' ')
    case 'deep_demand_build':
      return [
        `PLAY deep_demand_build (deep rank pos ${pos}, real impressions).`,
        'Build or fully rewrite as the definitive guide: entity-first H2s, procedure steps, document tables, regional nuances,',
        'FAQ cluster, Sources with official URLs. Optimize for Google + AI citations (clear definitions, numbered steps).',
      ].join(' ')
    case 'cannibal_merge':
      return [
        `PLAY cannibal_merge (${opts?.pages?.length || 'multi'} URLs ranking for same query).`,
        'Write ONE canonical pillar that absorbs the intent. Other URLs should later 301 or noindex — do not create another competing page.',
        'Use the strongest host/path from ownership registry. Explicitly cover sub-intents in H2s so secondary pages can redirect cleanly.',
      ].join(' ')
    case 'aeo_entity_hub':
      return [
        'PLAY aeo_entity_hub (answer-engine + entity authority).',
        'Lead with a definition block AI Overviews can lift. Use precise immigration entities (forms, visas, agencies).',
        'Self-contained FAQ answers (40–80 words each). JSON-LD Article + FAQPage. Cite only official sources.',
        'Structure for GEO: short factual sentences, named entities, clear lists — not marketing fluff.',
      ].join(' ')
    case 'decay_refresh':
      return [
        'PLAY decay_refresh (page lost traffic).',
        'Update every dated claim, add current year to title where accurate, refresh procedures and source links,',
        'expand weak sections, re-optimize TL;DR. Signal freshness without rewriting into a different intent.',
      ].join(' ')
    default:
      return 'Write practitioner-grade immigration content optimized for SEO + AEO.'
  }
}

/** Map war play → pipeline opportunityAction string */
export function playToOpportunityAction(play: WarPlay): string {
  if (play === 'title_ctr_rewrite') return 'title_rewrite'
  if (play === 'cannibal_merge') return 'cannibal_merge'
  if (play === 'page1_defend') return 'page1_defend'
  if (play === 'strike_distance') return 'strike_distance'
  if (play === 'deep_demand_build') return 'deep_demand_build'
  if (play === 'aeo_entity_hub') return 'aeo_entity_hub'
  if (play === 'decay_refresh') return 'decay_refresh'
  return 'expand_or_build'
}

function classifyPlay(q: Q, expected: number, multiPages: number): WarPlay {
  if (isNoiseQuery(q.term)) return 'ignore_noise'
  // Early-estate friendly thresholds (0-click / low-impr still actionable)
  if (multiPages >= 2 && q.impressions >= 3) return 'cannibal_merge'
  const gap = expected - q.ctr
  if (q.position >= 4 && q.position <= 15 && gap >= 0.005 && q.impressions >= 3) {
    return 'title_ctr_rewrite'
  }
  if (q.position > 10 && q.position <= 20 && q.impressions >= 4) return 'strike_distance'
  if (q.position <= 10 && q.impressions >= 5) return 'page1_defend'
  if (q.position > 20 && q.impressions >= 5) return 'deep_demand_build'
  // Entity-rich mid demand — still shipable for AEO
  if (q.impressions >= 2) return 'aeo_entity_hub'
  return 'ignore_noise'
}

function estimateGain(q: Q, expected: number, play: WarPlay): number {
  // Clicks if we capture half the CTR gap, or move avg pos toward ~8
  if (play === 'title_ctr_rewrite') {
    return Math.max(0, q.impressions * (expected - q.ctr) * 0.5)
  }
  if (play === 'strike_distance') {
    const targetCtr = expectedCtrAtPosition(8)
    return Math.max(0, q.impressions * (targetCtr - q.ctr) * 0.35)
  }
  if (play === 'deep_demand_build') {
    const targetCtr = expectedCtrAtPosition(12)
    return Math.max(0, q.impressions * (targetCtr - q.ctr) * 0.25)
  }
  if (play === 'page1_defend') {
    return Math.max(0, q.impressions * Math.max(0, expected - q.ctr) * 0.2)
  }
  if (play === 'cannibal_merge') {
    return Math.max(0, q.impressions * expected * 0.15)
  }
  return Math.max(0, q.impressions * 0.005)
}

export async function buildSeoWarRoom(opts?: {
  days?: number
  limit?: number
  minImpressions?: number
  regionFilter?: string
}): Promise<WarRoomResult> {
  const days = opts?.days ?? 90
  const limit = Math.min(80, Math.max(10, opts?.limit ?? 40))
  const minImpr = opts?.minImpressions ?? 2
  const regionFilter = opts?.regionFilter?.toUpperCase() || ''

  const { source, siteUrl, queries, queryPages, warnings, live } = await loadGscRows(days)

  // Cannibal map: term → pages
  const cannibal = new Map<string, Array<{ url: string; impressions: number; clicks: number; position: number }>>()
  for (const row of queryPages) {
    if (!row.term || !row.url) continue
    const list = cannibal.get(row.term) || []
    list.push({
      url: row.url,
      impressions: row.impressions,
      clicks: row.clicks,
      position: row.position,
    })
    cannibal.set(row.term, list)
  }

  const queue: WarOpportunity[] = []
  let analyzed = 0

  for (const q of queries) {
    if (isNoiseQuery(q.term)) continue
    if (q.impressions < minImpr) continue
    const region = inferRegion(q.term)
    if (regionFilter && region !== regionFilter) continue
    analyzed++

    const expected = expectedCtrAtPosition(q.position)
    const pagesForTerm = (cannibal.get(q.term) || []).sort((a, b) => b.impressions - a.impressions)
    const multi = pagesForTerm.length >= 2 ? pagesForTerm.length : 0
    const play = classifyPlay(q, expected, multi)
    if (play === 'ignore_noise') continue

    const contentType = inferContentType(q.term, play)
    const plan = await resolveOwner({
      primaryKeyword: q.term,
      contentType,
      region,
    })
    const auth = scoreTopicAuthority({
      term: q.term,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
      hasOwner: Boolean(plan.matched?.owner_url),
      host: plan.host,
      registryAction: plan.action,
    })

    // Soft-skip pure off-domain meal-plan style already filtered; boost immigration entities
    if (auth.professionalism < 35 && auth.disciplineAuth < 25) continue

    const gain = estimateGain(q, expected, play)
    const ctrGap = Math.max(0, expected - q.ctr)
    // Priority: estimated gain × authority × play weight
    const playW =
      play === 'title_ctr_rewrite'
        ? 1.35
        : play === 'strike_distance'
          ? 1.25
          : play === 'cannibal_merge'
            ? 1.2
            : play === 'deep_demand_build'
              ? 1.1
              : play === 'aeo_entity_hub'
                ? 1.05
                : 0.9
    const priorityScore = Math.round(
      (gain * 12 + q.impressions * 0.08 + ctrGap * 800 + auth.total * 0.9) * playW,
    )

    const shipHint =
      play === 'title_ctr_rewrite' || play === 'strike_distance' || play === 'page1_defend'
        ? 'merge'
        : plan.blockers.length
          ? 'none'
          : 'pr'

    const playHint = playWriteHint(play, {
      position: q.position,
      expectedCtr: expected,
      ctr: q.ctr,
      pages: pagesForTerm,
    })
    const angleHint = authorityPromptHints(auth.contentAngle)

    const rationaleParts = [
      `play=${play}`,
      `pos ${q.position.toFixed(1)}`,
      `CTR ${(q.ctr * 100).toFixed(2)}% vs ~${(expected * 100).toFixed(1)}% expected`,
      `+~${gain.toFixed(1)} clicks if half-gap closed`,
      auth.rationale,
    ]
    if (multi >= 2) rationaleParts.push(`${multi} landing URLs (cannibal risk)`)

    queue.push({
      id: `${play}:${q.term}`,
      term: q.term,
      play,
      priorityScore,
      impressions: q.impressions,
      clicks: q.clicks,
      ctr: q.ctr,
      position: q.position,
      expectedCtr: expected,
      ctrGap,
      estimatedGainClicks: Math.round(gain * 10) / 10,
      region,
      contentType,
      host: plan.host,
      repo: plan.repo,
      ownerUrl: plan.canonicalUrl,
      filePath: plan.filePath,
      authorityScore: auth.total,
      contentAngle: auth.contentAngle,
      writeHint: `${playHint} ${angleHint}`.trim(),
      rationale: rationaleParts.join(' · '),
      shipHint,
      pages: pagesForTerm.slice(0, 5),
    })
  }

  queue.sort((a, b) => b.priorityScore - a.priorityScore || b.impressions - a.impressions)
  const trimmed = queue.slice(0, limit)

  const buckets = {
    title_ctr_rewrite: trimmed.filter((o) => o.play === 'title_ctr_rewrite'),
    strike_distance: trimmed.filter((o) => o.play === 'strike_distance'),
    deep_demand_build: trimmed.filter((o) => o.play === 'deep_demand_build'),
    cannibal_merge: trimmed.filter((o) => o.play === 'cannibal_merge'),
    aeo_entity_hub: trimmed.filter((o) => o.play === 'aeo_entity_hub'),
    page1_defend: trimmed.filter((o) => o.play === 'page1_defend'),
  }

  const autoRunTerms = trimmed
    .filter((o) => o.play !== 'cannibal_merge') // merge needs human path choice
    .slice(0, 12)
    .map((o) => o.term)

  const gainSum = trimmed.reduce((s, o) => s + o.estimatedGainClicks, 0)
  const avgAuth = trimmed.length
    ? Math.round(trimmed.reduce((s, o) => s + o.authorityScore, 0) / trimmed.length)
    : 0

  const summary = [
    `War Room · GSC ${source}${live ? ' (live)' : ''}: analyzed ${analyzed} clean queries → ${trimmed.length} actions.`,
    `Plays — CTR rewrite ${buckets.title_ctr_rewrite.length}, strike ${buckets.strike_distance.length}, deep ${buckets.deep_demand_build.length}, cannibal ${buckets.cannibal_merge.length}, AEO hub ${buckets.aeo_entity_hub.length}, defend ${buckets.page1_defend.length}.`,
    `Est. incremental clicks if top actions half-succeed: ~${gainSum.toFixed(0)}/period · avg authority ${avgAuth}/100.`,
    `Strategy: win page-1 CTR first (fastest ranking signal), then strike-distance expands, then entity hubs for AEO/GEO — never ship noise meal-plan queries.`,
  ].join(' ')

  return {
    source,
    siteUrl,
    rangeDays: days,
    generatedAt: new Date().toISOString(),
    summary,
    warnings,
    queue: trimmed,
    buckets,
    autoRunTerms,
    autoRunBody: {
      terms: autoRunTerms.slice(0, 5),
      limit: Math.min(5, autoRunTerms.length || 3),
      shipMode: 'none',
      minAuditScore: 65,
      maxRefine: 2,
      skipRecent: true,
      useKeywordPlan: false,
    },
    kpis: {
      queriesAnalyzed: analyzed,
      actionable: trimmed.length,
      estimatedGainClicksSum: Math.round(gainSum * 10) / 10,
      avgAuthority: avgAuth,
      liveGsc: live,
    },
  }
}
