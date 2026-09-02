import { scoreCrucible } from '@/lib/seoEngine/crucible'
import { bestCellForTerm } from '@/lib/seoEngine/planner'
/**
 * SEO War Room — powered by the Opportunity Intelligence Engine.
 *
 * Pulls GSC queries (live or snapshot), the existing content inventory,
 * and the ecosystem interlink registry, then runs the deterministic
 * Opportunity Engine to rank *what to ship* by verifiable scoring.
 *
 * Every play carries a full signals trail — transparent, accountable,
 * dependable.  The engine is the single brain for Quick Create, the
 * War Room, the Discover tab, and the Opportunities tab.
 */
import { getGscAccess } from '@/lib/gscAuth'
import { loadGscSnapshot, loadOwnershipRegistry } from '@/lib/seoDataLoaders'
import { createClient } from '@supabase/supabase-js'
import {
  scoreOpportunities,
  mergeSnapshotIntoQueries,
  SNAPSHOT_MERGE_MIN_VIABLE,
  type OpportunityQuery,
  type CoverageItem,
  type InterlinkOption,
} from '@/lib/seoFactory/opportunityEngine'
import { buildKeywordClusters, type ClusterResolution } from '@/lib/seoFactory/keywordCluster'
import { classifyDestinationType } from '@/lib/seoFactory/ownership'
import { isJunkQuery } from '@/lib/seoFactory/queryNoise'
import { matchStrikeSeed } from '@/lib/seoFactory/strikeSeeds'

// ── Legacy play labels (backward compat for the war-room UI) ─────────────
const PLAY_MAP: Record<string, string> = {
  quick_win: 'strike_distance',
  content_gap: 'deep_demand_build',
  refresh: 'decay_refresh',
  defend: 'page1_defend',
  cannibalization: 'cannibal_merge',
}

export type WarPlay =
  | 'title_ctr_rewrite'
  | 'strike_distance'
  | 'page1_defend'
  | 'deep_demand_build'
  | 'cannibal_merge'
  | 'decay_refresh'
  | 'aeo_entity_hub'
  | 'ignore_noise'

export interface WarOpportunity {
  id: string
  term: string
  play: WarPlay
  priorityScore: number
  impressions: number
  clicks: number
  ctr: number
  position: number
  expectedCtr: number
  ctrGap: number
  estimatedGainClicks: number
  region: string
  contentType: string
  host: string | null
  repo: string | null
  ownerUrl: string | null
  filePath: string | null
  authorityScore: number
  contentAngle: string | null
  writeHint: string
  rationale: string
  shipHint: 'pr' | 'merge' | 'none'
  pages?: Array<{ url: string; impressions: number; clicks: number; position: number }>
  // ── Engine-native fields (new, for progressive UI adoption) ──
  opportunityScore: number
  demandScore: number
  upsideScore: number
  trendScore: number
  difficultyScore: number
  trend: 'rising' | 'flat' | 'declining'
  enginePlay: string
  intent: string
  signals: string[]
  interlinks?: Array<{ label?: string; url?: string; site?: string; matchedOn?: string[] }>
  coverage?: { matched: boolean; matches: string[] }
  /** Position trajectory (oldest → newest) when live GSC history is available. */
  history?: Array<{ date?: string; position: number; impressions: number; clicks?: number }>
  /** last - first position (negative = improving). */
  positionDelta?: number
  /** Keyword-cluster resolution (anti-cannibalization) when clusters were built. */
  cluster?: ClusterResolution
  /** GA4 purchaseRevenue when attached. */
  revenue?: number
  /** Crucible total (the only selection key). */
  crucibleScore?: number
  crucibleKill?: string | null
  service?: string | null
  stage?: string | null
}

export interface WarRoomResult {
  source: 'live' | 'snapshot'
  siteUrl: string | null
  rangeDays: number
  generatedAt: string
  summary: string
  warnings: string[]
  queue: WarOpportunity[]
  buckets: Record<string, WarOpportunity[]>
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
  historyAvailable: boolean
  range: { startDate: string; endDate: string; days: number } | null
  snapshot: { generatedAt?: string; source?: string; ageDays?: number } | null
  /** Temporary pipeline diagnostics — only present when opts.debug is set. */
  debug?: Record<string, unknown>
}

function expectedCtrAtPosition(pos: number): number {
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

export function isNoiseQuery(term: string): boolean {
  const t = term.toLowerCase().trim()
  if (!t || t.length < 3) return true
  if (/yousafe|mycaseworks|yousafeconsultancy/.test(t)) return true
  // Quoted multi-fragment noise from GSC (PDF/snippet garbage)
  const quoteCount = (t.match(/"/g) || []).length
  if (quoteCount >= 2) return true
  if (/^["'].*["']/.test(t) && t.split(/\s+/).length <= 8) return true
  // Off-estate spam / housing meal plans / random university brochure
  if (/meal plan|room and meal|stockton room|housing rates final/.test(t)) return true
  // Pure number codes with no immigration context
  if (/^\d{3,5}/.test(t) && !/485|subclass|i-?\d|form/.test(t)) return true
  // Single stopword-ish
  if (/^(a|the|and|or|to|for|in|on|of)$/.test(t)) return true
  if (/c[:.].*drive|onedrive|dropbox|\.pdf|\.jpg|\.png|http:|https:|@/i.test(t)) return true
  return isJunkQuery(term)
}

export async function buildSeoWarRoom(opts?: {
  days?: number
  limit?: number
  minImpressions?: number
  regionFilter?: string
  debug?: boolean
}): Promise<WarRoomResult> {
  const days = opts?.days ?? 90
  const limit = opts?.limit ?? 40
  const minImpressions = opts?.minImpressions ?? 2
  const regionFilter = opts?.regionFilter
  const dbg: Record<string, unknown> = opts?.debug ? {} : undefined as unknown as Record<string, unknown>
  const now = new Date().toISOString()

  const warnings: string[] = []
  let source: 'live' | 'snapshot' = 'snapshot'
  let siteUrl: string | null = null

  // ── 1. Search demand ────────────────────────────────────────────────────
  const queries: OpportunityQuery[] = []
  const access = await getGscAccess()
  let liveRange: { startDate: string; endDate: string; days: number } | null = null
  const historyByTerm = new Map<
    string,
    Array<{ date?: string; position: number; impressions: number; clicks?: number }>
  >()
  if (access?.accessToken && access.siteUrl) {
    siteUrl = access.siteUrl
    const end = new Date().toISOString().slice(0, 10)
    const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
    const endpoint = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(access.siteUrl)}/searchAnalytics/query`
    const queryOpts = {
      method: 'POST' as const,
      headers: {
        Authorization: `Bearer ${access.accessToken}`,
        'Content-Type': 'application/json',
      },
    }
    try {
      const res = await fetch(endpoint, {
        ...queryOpts,
        body: JSON.stringify({
          startDate: start, endDate: end,
          dimensions: ['query'],
          rowLimit: Math.min(200, limit * 5),
        }),
      })
      if (res.ok) {
        const data: any = await res.json()
        const rows: Array<{ keys?: string[]; impressions?: number; clicks?: number; ctr?: number; position?: number }> = Array.isArray(data.rows) ? data.rows : []
        // Truthfulness gate: a 200 with zero rows is NOT live data. Only brand
        // the run as 'live' when the property actually returned queries, so the
        // dashboard never shows the LIVE badge over snapshot-derived plays.
        if (rows.length > 0) {
          source = 'live'
          liveRange = { startDate: start, endDate: end, days }
        } else {
          warnings.push('GSC live query returned 0 rows — using snapshot data')
        }
        for (const r of rows) {
          const term = (r.keys?.[0] || '').trim()
          if (!term || isNoiseQuery(term)) continue
          queries.push({
            term,
            impressions: r.impressions ?? 0,
            clicks: r.clicks ?? 0,
            ctr: r.ctr ?? 0,
            position: r.position ?? 0,
          })
        }
        // ── Position history: split range into 3 buckets, query each ──
        // Only worth the extra API calls when the property actually returned
        // rows — on the 0-rows path all of this would be discarded anyway.
        if (rows.length > 0) {
          try {
            const startMs = Date.now() - days * 864e5
            const third = (days * 864e5) / 3
            const buckets = [0, 1, 2].map((i) => ({
              startDate: new Date(startMs + i * third).toISOString().slice(0, 10),
              endDate: new Date(startMs + (i + 1) * third).toISOString().slice(0, 10),
            }))
            const bucketRes = await Promise.all(
              buckets.map((b) =>
                fetch(endpoint, {
                  ...queryOpts,
                  body: JSON.stringify({
                    startDate: b.startDate, endDate: b.endDate,
                    dimensions: ['query'],
                    rowLimit: Math.min(200, limit * 5),
                  }),
                }).then((r) => (r.ok ? r.json() : null)),
              ),
            )
            for (let i = 0; i < buckets.length; i++) {
              const rows = (bucketRes[i] as any)?.rows || []
              for (const r of rows) {
                const term = (r.keys?.[0] || '').trim().toLowerCase()
                if (!term) continue
                if (!historyByTerm.has(term)) historyByTerm.set(term, [])
                historyByTerm.get(term)!.push({
                  date: buckets[i].endDate,
                  position: r.position ?? 0,
                  impressions: r.impressions ?? 0,
                  clicks: r.clicks ?? 0,
                })
              }
            }
          } catch {
            /* history optional — scores still work without it */
          }
        }
      }
    } catch {
      warnings.push('GSC live query failed — falling back to snapshot')
    }
  }
  let snapshotMeta: { generatedAt?: string; source?: string; ageDays?: number } | null = null
  // Live GSC on this estate is junk-dominated (0–2 rows survive isNoiseQuery
  // on a typical day). Merging the snapshot when live is thin keeps Discover
  // fed — the old `=== 0` gate let 1–2 junk-adjacent survivors starve it.
  if (queries.length < SNAPSHOT_MERGE_MIN_VIABLE) {
    // Truthfulness: never salvage a run with a >14-day-old snapshot — the
    // queue would advertise stale demand as today's. Refuse cleanly + warn.
    const preMergeLiveCount = queries.length
    const snap = await loadGscSnapshot({ allowStale: false, maxAgeDays: 14 })
    const snapshotAgeDays = (await import('@/lib/seoDataLoaders')).snapshotAgeDays(snap)
    if (snap.topQueries?.length && snapshotAgeDays >= 0) {
      const shape = (q: { term?: string; url?: string; clicks: number; impressions: number; ctr: number; position: number }) => ({
        term: q.term || q.url || '',
        impressions: q.impressions,
        clicks: q.clicks,
        ctr: q.ctr,
        position: q.position,
      })
      const snapshotRows = [
        ...(snap.topQueries ?? []),
        ...((snap.opportunities?.highImpressionLowCtr as Array<any> | undefined) ?? []),
        ...((snap.opportunities?.highImpressionDeepRank as Array<any> | undefined) ?? []),
      ].map(shape)
      const merged = mergeSnapshotIntoQueries(queries, snapshotRows)
      if (dbg) {
        dbg.snapshotRows = snapshotRows.length
        dbg.merged = merged.length
        dbg.queriesAfterMerge = queries.length
        dbg.mergedSample = merged.slice(0, 12).map((q) => ({ t: q.term, imp: q.impressions, noise: isNoiseQuery((q.term || '').trim().toLowerCase()) }))
      }
      if (merged.length > queries.length) {
        snapshotMeta = { generatedAt: snap.generatedAt, source: snap.source, ageDays: snapshotAgeDays }
        queries.length = 0
        queries.push(...merged)
        // Honesty: this run is now snapshot-fed (the trigger fired at
        // <5 live rows), so it must NOT wear the LIVE badge (audit: the
        // merge path previously kept source='live' and claimed live GSC).
        source = 'snapshot'
        warnings.push(`Live GSC had only ${preMergeLiveCount} certified row(s) — queue top-upped from the snapshot (${snapshotAgeDays}d old); plays are snapshot-derived.`)
      }
    } else if (snap.topQueries?.length) {
      warnings.push('GSC snapshot is stale (>14 days) — refusing to merge it; queue is live-only (thin).')
    }
  }
  // Deduplicate + filter
  const seen = new Set<string>()
  const deduped: OpportunityQuery[] = []
  for (const q of queries) {
    const t = (q.term || '').trim().toLowerCase()
    if (!t || t.length < 3 || seen.has(t)) continue
    if (isNoiseQuery(t)) continue
    if (q.impressions < minImpressions) continue
    seen.add(t)
    deduped.push({ ...q, term: t, history: historyByTerm.get(t) || undefined })
  }
  deduped.sort((a, b) => b.impressions - a.impressions)
  if (dbg) {
    dbg.queriesIntoDedupe = queries.length
    dbg.dedupedAfterLoop = deduped.length
    dbg.dedupedSample = deduped.slice(0, 12).map((q) => ({ t: q.term, imp: q.impressions }))
    dbg.minImpressions = minImpressions
  }

  try {
    const { pullGa4Signals, attachGa4Revenue } = await import('@/lib/seoEngine/ga4')
    const ga4 = await pullGa4Signals()
    if (dbg) {
      dbg.ga4Count = ga4.length
      dbg.dedupedAfterGa4 = deduped.length
    }
    if (ga4.length) {
      const withMoney = attachGa4Revenue(deduped, ga4)
      deduped.length = 0
      deduped.push(...withMoney)
    }
  } catch {
    /* GA4 optional — war room still ranks without purchase data. */
  }

  try {
    const { attachKeywordResearch, loadKeywordResearchIndex } = await import('@/lib/seoEngine/keywordDemand')
    const research = await loadKeywordResearchIndex()
    if (dbg) {
      dbg.kdCount = research.length
      dbg.dedupedAfterKdAttach = deduped.length
    }
    if (research.length) {
      const withKd = attachKeywordResearch(deduped, research)
      deduped.length = 0
      deduped.push(...withKd)
    }
  } catch {
    /* Ads / cached Ubersuggest optional — competitorOpen falls back to rank proxy. */
  }

  try {
    const { countViableBacklinkTargets } = await import('@/lib/seoEngine/backlinkEngine')
    const targets = await countViableBacklinkTargets()
    if (targets != null) {
      for (const q of deduped) q.backlinkTargetsAvailable = targets
    }
  } catch {
    /* ledger optional — linkAttainability stays mid without it. */
  }

  // ── 2. Content inventory (coverage) ──────────────────────────────────────
  let coverage: CoverageItem[] = []
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await supabase
      .from('content_jobs')
      .select('title, topic, primary_keyword, status, content_path')
      .order('created_at', { ascending: false })
      .limit(300)
    coverage = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((j) => j && (j.title || j.topic || j.primary_keyword))
      .map((j) => ({
        title: String(j.title || j.topic || j.primary_keyword || ''),
        topic: j.topic ? String(j.topic) : null,
        primaryKeyword: j.primary_keyword ? String(j.primary_keyword) : null,
        status: j.status ? String(j.status) : null,
        url: j.content_path ? String(j.content_path) : null,
      }))
  } catch { /* coverage optional */ }

  // ── 3. Interlink registry ───────────────────────────────────────────────
  let interlinks: InterlinkOption[] = []
  try {
    const { LINKS } = await import('@/lib/interlinkRegistry')
    interlinks = ((LINKS as unknown as Array<Record<string, unknown>>) || [])
      .map((l) => ({
        label: String(l.label || l.title || l.url || ''),
        url: String(l.url || ''),
        site: String(l.site || 'caseworks'),
        kind: String(l.kind || 'page'),
      }))
      .filter((l) => l.label && l.url)
  } catch { /* interlinks optional */ }

  // ── 3.5 Keyword clusters → canonical-page resolution (anti-cannibalization) ──
  // Cluster every analyzed query, resolve each cluster to ONE page (existing
  // owner URL / shipped job, or a new unique page), and feed the engine's
  // relatedByTerm so opportunities carry their full cluster.
  let clusterResult = { byTerm: {} as Record<string, ClusterResolution>, relatedByTerm: {} as Record<string, string[]> }
  try {
    const registry = await loadOwnershipRegistry()
    clusterResult = await buildKeywordClusters({
      queries: deduped.map((q) => ({ term: q.term, impressions: q.impressions, clicks: q.clicks, position: q.position })),
      region: regionFilter || 'US',
      registry: (registry.rows ?? []) as Array<{ primary_keyword?: string; owner_url?: string | null; owner_host?: string | null; action?: string }>,
      coverage: coverage.map((c) => ({ title: c.title, topic: c.topic, primaryKeyword: c.primaryKeyword, status: c.status, url: c.url })),
      minImpressions,
    })
  } catch {
    /* clustering optional — radar still works without it */
  }

  // ── 4. Run the Opportunity Intelligence Engine ──────────────────────────
  const result = scoreOpportunities({
    queries: deduped,
    coverage,
    interlinks,
    region: regionFilter || 'US',
    relatedByTerm: clusterResult.relatedByTerm,
    limit: limit * 2,
  })

  // ── 5. Map engine output → WarRoomResult ────────────────────────────────
  const queue: WarOpportunity[] = result.opportunities
    .filter((o) => o.play !== 'cannibalization') // surface in UI warnings, not actionable queue
    .map((o, i) => {
      const expCtr = expectedCtrAtPosition(o.position)
      const ctrGap = Math.max(0, expCtr - o.ctr)
      const estimatedGain = Math.round(ctrGap * o.impressions) || Math.round(expCtr * o.impressions * 0.5)
      // Strike-seed routing (Phase C): the five locked pages carry their owner
      // URL / repo / file path so auto-run expands them instead of a sibling.
      const seedTarget = matchStrikeSeed(o.topic, o.sourcePage)
      const cell = bestCellForTerm(o.topic)
      const crucible = scoreCrucible({
        term: o.topic,
        impressions: o.impressions,
        clicks: o.clicks,
        ctr: o.ctr,
        position: o.position,
        intent: o.intent,
        play: o.play,
        stage: cell.stage,
        country: cell.country,
        revenue: o.revenue,
        volume: o.volume,
        keywordDifficulty: o.keywordDifficulty,
        referringDomains: o.referringDomains,
        competitorReferringDomains: o.competitorReferringDomains,
        backlinkTargetsAvailable: o.backlinkTargetsAvailable,
      })
      return {
        id: o.topic,
        term: o.topic,
        play: (PLAY_MAP[o.play] || PLAY_MAP.content_gap) as WarPlay,
        priorityScore: crucible.killed ? 0 : crucible.total,
        impressions: o.impressions,
        clicks: o.clicks,
        ctr: o.ctr,
        position: o.position,
        expectedCtr: expCtr,
        ctrGap,
        estimatedGainClicks: estimatedGain,
        region: regionFilter || cell.country || 'US',
        contentType: o.contentType,
        host: seedTarget ? seedTarget.host : null,
        repo: seedTarget ? seedTarget.repo : null,
        ownerUrl: seedTarget ? seedTarget.canonicalUrl : null,
        filePath: seedTarget ? seedTarget.filePath : null,
        authorityScore: 100 - o.difficultyScore,
        contentAngle: null,
        writeHint: o.signals.slice(0, 2).join('; '),
        rationale: [...o.signals, ...crucible.reasons.slice(0, 2)].join(' · '),
        shipHint: 'pr' as const,
        // Engine-native (for progressive UI adoption)
        opportunityScore: o.opportunityScore,
        demandScore: o.demandScore,
        upsideScore: o.upsideScore,
        trendScore: o.trendScore,
        difficultyScore: o.difficultyScore,
        trend: o.trend,
        enginePlay: o.play,
        intent: o.intent,
        signals: o.signals,
        interlinks: o.interlinks,
        coverage: o.coverage,
        history: o.history,
        positionDelta: o.positionDelta,
        cluster: clusterResult.byTerm[o.topic],
        revenue: o.revenue,
        crucibleScore: crucible.total,
        crucibleKill: crucible.killReason,
        service: crucible.service,
        stage: cell.stage,
      }
    })
    .filter((w) => !w.crucibleKill)
    .sort((a, b) => (b.crucibleScore || 0) - (a.crucibleScore || 0))

  const buckets: Record<string, WarOpportunity[]> = {
    strike_distance: [], deep_demand_build: [], decay_refresh: [],
    page1_defend: [], cannibal_merge: [], aeo_entity_hub: [], title_ctr_rewrite: [],
  }
  for (const w of queue) {
    const b = buckets[w.play] || (buckets[w.play] = [])
    if (b.length < 12) b.push(w)
  }
  // Cannibalization warnings from engine
  for (const c of result.cannibalization.slice(0, 8)) {
    buckets.cannibal_merge.push({
      id: c.term,
      term: c.term,
      play: 'cannibal_merge',
      priorityScore: 0,
      impressions: c.impressions,
      clicks: 0, ctr: 0, position: 51,
      expectedCtr: 0, ctrGap: 0, estimatedGainClicks: 0,
      region: regionFilter || 'US', contentType: 'article',
      host: null, repo: null, ownerUrl: null, filePath: null,
      authorityScore: 0, contentAngle: null,
      writeHint: `Cannibal: ${c.pages.join(', ')}`,
      rationale: `${c.pages.length} pages target "${c.term}" — consolidate`,
      shipHint: 'none',
      opportunityScore: 0, demandScore: 0, upsideScore: 0,
      trendScore: 0, difficultyScore: 100,
      trend: 'flat', enginePlay: 'cannibalization', intent: 'informational',
      signals: [`⚠ ${c.pages.length} existing pages target this term`],
      pages: c.pages.map((p) => ({ url: p, impressions: c.impressions / c.pages.length, clicks: 0, position: 0 })),
    })
  }

  const nonCannibal = queue.filter((w) => w.play !== 'cannibal_merge')
  const autoRunTerms = nonCannibal.slice(0, 8).map((w) => w.term)
  const actionable = nonCannibal.length
  const gainSum = nonCannibal.reduce((s, w) => s + w.estimatedGainClicks, 0)
  const avgAuth = actionable
    ? Math.round(nonCannibal.reduce((s, w) => s + w.authorityScore, 0) / actionable)
    : 0

  return {
    source,
    siteUrl,
    rangeDays: days,
    generatedAt: now,
    summary: `War Room · ${source} · ${queue.length} plays · ${actionable} actionable · ~${Math.round(gainSum)} est. clicks gain`,
    warnings,
    queue,
    buckets,
    autoRunTerms,
    autoRunBody: {
      terms: autoRunTerms,
      limit: Math.min(5, autoRunTerms.length),
      shipMode: 'merge',
      minAuditScore: 65,
      maxRefine: 2,
      skipRecent: true,
      useKeywordPlan: false,
    },
    kpis: {
      queriesAnalyzed: deduped.length,
      actionable,
      estimatedGainClicksSum: Math.round(gainSum),
      avgAuthority: avgAuth,
      liveGsc: source === 'live',
    },
    historyAvailable: source === 'live' && historyByTerm.size > 0,
    range: liveRange,
    snapshot: snapshotMeta,
  }
}
// Legacy compatibility exports (used by auto-run-stream)

export function inferContentType(term: string, _play?: WarPlay): string {
  return classifyDestinationType(term)
}

export function playWriteHint(play: WarPlay, opts?: { position?: number; expectedCtr?: number; ctr?: number; pages?: Array<{ url: string }> }): string {
  const pos = opts?.position?.toFixed(1) ?? '?'
  if (play === 'title_ctr_rewrite') return 'PLAY title_ctr_rewrite (pos ' + pos + '). Rewrite title + meta + H1 to maximize CTR.'
  if (play === 'strike_distance') return 'PLAY strike_distance (pos ' + pos + '). Expand with comparison table, checklist, FAQs.'
  if (play === 'page1_defend') return 'PLAY page1_defend (pos ' + pos + '). Protect: refresh dates, add FAQs.'
  if (play === 'deep_demand_build') return 'PLAY deep_demand_build (pos ' + pos + '). Build definitive guide.'
  if (play === 'cannibal_merge') return 'PLAY cannibal_merge. Write ONE canonical pillar.'
  if (play === 'aeo_entity_hub') return 'PLAY aeo_entity_hub. AI-friendly definitions, entities, FAQs, JSON-LD.'
  if (play === 'decay_refresh') return 'PLAY decay_refresh. Update dated claims, refresh source links.'
  return 'Write practitioner-grade immigration content optimized for SEO + AEO.'
}

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
