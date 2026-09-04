/**
 * Phase 8 — cannibalization *detection*. Recommends only; never merges/deletes.
 * Existing cannibalMerge.ts remains the human-approved executor.
 */

import { jaccard, tokens } from './keywordCluster'
import { normalizeUrl } from './coverageLinks'

export type CannibalAction = 'merge' | 'differentiate' | 'canonical-review' | 'ignore'

export interface CannibalizationCandidate {
  pageA: string
  pageB: string
  overlapScore: number
  sharedQueries: string[]
  sharedClusters: string[]
  recommendedAction: CannibalAction
  reasons: string[]
}

export type CannibalPageMeta = {
  url: string
  title?: string
  h1?: string
  clusterIds?: string[]
  entities?: string[]
  impressions?: number
}

export type CannibalGscHit = {
  query: string
  page: string
  impressions?: number
  position?: number
}

function intentBucket(q: string): string {
  const t = q.toLowerCase()
  if (/apply|fee|cost|price|pay|enroll|hire|book/.test(t)) return 'transactional'
  if (/best|top|vs|compare|review/.test(t)) return 'commercial'
  if (/login|portal|account|status|track/.test(t)) return 'navigational'
  return 'informational'
}

export function detectCannibalization(opts: {
  hits: CannibalGscHit[]
  pages?: CannibalPageMeta[]
  minSharedQueries?: number
}): CannibalizationCandidate[] {
  const minShared = opts.minSharedQueries ?? 1
  const meta = new Map<string, CannibalPageMeta>()
  for (const p of opts.pages || []) meta.set(normalizeUrl(p.url), p)

  const queriesByPage = new Map<string, Map<string, CannibalGscHit>>()
  for (const hit of opts.hits) {
    const page = normalizeUrl(hit.page)
    const q = String(hit.query || '').trim().toLowerCase()
    if (!page || !q || !/^https?:\/\//i.test(hit.page)) continue
    if (!queriesByPage.has(page)) queriesByPage.set(page, new Map())
    queriesByPage.get(page)!.set(q, hit)
  }

  const pages = [...queriesByPage.keys()].sort()
  const out: CannibalizationCandidate[] = []

  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = pages[i]
      const b = pages[j]
      const qa = queriesByPage.get(a)!
      const qb = queriesByPage.get(b)!
      const sharedQueries = [...qa.keys()].filter((q) => qb.has(q))
      if (sharedQueries.length < minShared) continue

      const ma = meta.get(a)
      const mb = meta.get(b)
      const titleA = ma?.h1 || ma?.title || ''
      const titleB = mb?.h1 || mb?.title || ''
      const titleSim = titleA && titleB ? jaccard(tokens(titleA), tokens(titleB)) : 0
      const clustersA = new Set(ma?.clusterIds || [])
      const clustersB = new Set(mb?.clusterIds || [])
      const sharedClusters = [...clustersA].filter((c) => clustersB.has(c))
      const entA = new Set((ma?.entities || []).map((e) => e.toLowerCase()))
      const entB = new Set((mb?.entities || []).map((e) => e.toLowerCase()))
      let sharedEnt = 0
      for (const e of entA) if (entB.has(e)) sharedEnt++
      const intents = new Set(sharedQueries.map(intentBucket))
      const sameIntent = intents.size === 1

      const signals = [
        sharedQueries.length >= 1,
        titleSim >= 0.34,
        sharedClusters.length >= 1,
        sharedEnt >= 2,
        sameIntent && sharedQueries.length >= 2,
      ].filter(Boolean).length

      if (signals < 2) continue

      const overlapScore = Math.round(
        Math.min(
          100,
          sharedQueries.length * 18 +
            titleSim * 40 +
            sharedClusters.length * 12 +
            Math.min(20, sharedEnt * 8) +
            (sameIntent ? 10 : 0),
        ),
      )

      const reasons: string[] = [
        `${sharedQueries.length} shared GSC quer${sharedQueries.length === 1 ? 'y' : 'ies'}: ${sharedQueries.slice(0, 5).join(', ')}`,
      ]
      if (titleSim >= 0.34) reasons.push(`Title/H1 Jaccard ${(titleSim * 100).toFixed(0)}%`)
      if (sharedClusters.length) reasons.push(`Shared clusters: ${sharedClusters.join(', ')}`)
      if (sharedEnt >= 2) reasons.push(`${sharedEnt} shared entities`)
      if (sameIntent) reasons.push(`Same search intent (${[...intents][0]})`)

      let recommendedAction: CannibalAction = 'canonical-review'
      if (overlapScore >= 70 && titleSim >= 0.45) {
        recommendedAction = 'merge'
        reasons.push('Recommend merge — human must approve; nothing is deleted automatically')
      } else if (overlapScore >= 45 && !sameIntent) {
        recommendedAction = 'differentiate'
        reasons.push('Recommend differentiate — intents diverge')
      } else if (overlapScore >= 40) {
        recommendedAction = 'canonical-review'
        reasons.push('Recommend canonical review')
      } else {
        recommendedAction = 'ignore'
      }

      if (recommendedAction === 'ignore') continue

      out.push({
        pageA: a,
        pageB: b,
        overlapScore,
        sharedQueries,
        sharedClusters,
        recommendedAction,
        reasons,
      })
    }
  }

  out.sort((x, y) => y.overlapScore - x.overlapScore)
  return out
}
