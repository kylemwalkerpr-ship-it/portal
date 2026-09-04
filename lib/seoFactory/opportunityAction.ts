/**
 * Phase 7 — CREATE / REFRESH / DEFEND / CONSOLIDATE / WATCH.
 * Every action ships with reasons. No invented metrics.
 */

import { scoreOpportunityList, type OpportunityEvidence, type OpportunityWeights, type SeoOpportunity } from './opportunityScore'

export type SeoAction = 'CREATE' | 'REFRESH' | 'DEFEND' | 'CONSOLIDATE' | 'WATCH'

export type ClassifiedOpportunity = SeoOpportunity & {
  action: SeoAction
  actionReasons: string[]
}

export type ActionContext = {
  /** Distinct URLs already ranking for this query in the scored set. */
  pagesForQuery: number
  hasRelevantPage: boolean
  coverageScore?: number
  internalLinkCandidates?: number
}

export function classifyOpportunityAction(
  opp: SeoOpportunity,
  ctx: ActionContext,
): ClassifiedOpportunity {
  const reasons: string[] = []
  const pos = opp.position || 0
  const cov = ctx.coverageScore ?? opp.signals.topicalGap != null
    ? 100 - opp.signals.topicalGap
    : undefined
  const fmtImp = opp.impressions.toLocaleString('en-US')
  reasons.push(`+ ${fmtImp} impressions`)
  if (pos) reasons.push(`+ Average position ${pos}`)
  reasons.push(`+ CTR ${(opp.ctr > 1 ? opp.ctr : opp.ctr * 100).toFixed(1)}%`)
  if (cov != null) reasons.push(`+ Existing coverage ${Math.round(cov)}%`)
  if ((ctx.internalLinkCandidates || 0) > 0) {
    reasons.push(`+ ${ctx.internalLinkCandidates} high-relevance internal-link candidates`)
  }

  let action: SeoAction = 'WATCH'
  const extra: string[] = []

  if (opp.confidence < 35 || opp.score < 22 || (opp.impressions < 20 && pos > 40)) {
    action = 'WATCH'
    extra.push('Insufficient evidence or low priority — watch')
  } else if (ctx.pagesForQuery >= 2) {
    action = 'CONSOLIDATE'
    extra.push(`${ctx.pagesForQuery} URLs split this query — cannibalization risk`)
  } else if (pos > 0 && pos <= 5 && (cov == null || cov >= 70) && opp.signals.ctrOpportunity < 40) {
    action = 'DEFEND'
    extra.push('Already strong — targeted maintenance only, avoid a full rewrite')
  } else if (!opp.page || (pos > 30 && (cov == null || cov < 40))) {
    action = 'CREATE'
    extra.push('Demand exists and no sufficiently relevant URL covers the intent')
  } else if (
    pos >= 8 ||
    (cov != null && cov < 70) ||
    opp.signals.ctrOpportunity >= 40 ||
    opp.signals.internalAuthorityGap >= 50
  ) {
    action = 'REFRESH'
    extra.push('Relevant page exists with ranking/CTR/coverage/authority upside')
  } else {
    action = 'WATCH'
    extra.push('Signals mixed — do not ship a new URL yet')
  }

  return {
    ...opp,
    action,
    actionReasons: [...reasons, ...extra.map((e) => `+ ${e}`)],
  }
}

export function scoreAndClassify(
  rows: OpportunityEvidence[],
  weights?: OpportunityWeights,
): ClassifiedOpportunity[] {
  return classifyOpportunityList(scoreOpportunityList(rows, weights))
}

/** Same seed match the Analyze panel uses — pick from the classified list. */
export function pickOpportunityForSeed(
  classified: ClassifiedOpportunity[],
  seed: string,
): ClassifiedOpportunity | undefined {
  const n = String(seed || '').trim().toLowerCase()
  if (!classified.length) return undefined
  if (!n) return classified[0]
  return classified.find((o) => {
    const q = String(o.query || '').toLowerCase()
    return q.includes(n) || n.includes(q.slice(0, 40))
  }) || classified[0]
}

export function classifyOpportunityList(opps: SeoOpportunity[]): ClassifiedOpportunity[] {
  const pagesByQuery = new Map<string, Set<string>>()
  for (const o of opps) {
    const q = o.query.toLowerCase()
    if (!pagesByQuery.has(q)) pagesByQuery.set(q, new Set())
    if (o.page) pagesByQuery.get(q)!.add(o.page)
  }
  return opps.map((o) => {
    const pages = pagesByQuery.get(o.query.toLowerCase()) || new Set()
    const cov = 100 - (o.signals.topicalGap || 0)
    return classifyOpportunityAction(o, {
      pagesForQuery: Math.max(pages.size, o.page ? 1 : 0),
      hasRelevantPage: Boolean(o.page) && pages.size >= 1,
      coverageScore: o.signals.topicalGap ? cov : undefined,
    })
  })
}
