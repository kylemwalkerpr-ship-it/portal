/**
 * Bridge first-party GSC scores (opportunities/score) into the Discover
 * work plan (Master Engine / radar). The two surfaces used to rank the
 * same seo_gsc_rows independently — this module is the single merge.
 *
 * Formula A (CREATE/REFRESH/DEFEND/CONSOLIDATE/WATCH + 0–100 score) is
 * evidence. Formula B (playbook deskScore) stays the decision scorer.
 * Unmatched first-party rows that clear the act-on bar become new work-plan
 * cards so Sync GSC can actually queue a brief.
 */
import { isJunkQuery, sanitizeDemandTerm } from './queryNoise'

export type GscSeoAction = 'CREATE' | 'REFRESH' | 'DEFEND' | 'CONSOLIDATE' | 'WATCH'

export type GscScoredRow = {
  query?: string
  page?: string
  action?: GscSeoAction | string
  score?: number
  confidence?: number
  impressions?: number
  clicks?: number
  ctr?: number
  position?: number
  actionReasons?: string[]
}

export type GscPlay = 'content_gap' | 'quick_win' | 'refresh' | 'defend' | 'cannibalization'

export type GscWorkPlanEvidence = {
  impressions: number
  clicks: number
  ctr: number
  position: number
  score: number
  action: GscSeoAction
  page?: string
}

export type GscSuggestionSeed = {
  topic: string
  title: string
  primaryKeyword: string
  keywords: string[]
  play: GscPlay
  impressions: number
  clicks: number
  ctr: number
  position: number
  opportunityScore: number
  sourcePage?: string
  reason: string
  signals: string[]
  action: GscSeoAction
}

const ACTIONS: GscSeoAction[] = ['CREATE', 'REFRESH', 'DEFEND', 'CONSOLIDATE', 'WATCH']

export function gscTopicKey(query: string | undefined | null): string {
  return sanitizeDemandTerm(String(query || '')).toLowerCase()
}

export function gscActionToPlay(action: string | undefined): GscPlay {
  switch (String(action || '').toUpperCase()) {
    case 'CREATE':
      return 'content_gap'
    case 'CONSOLIDATE':
      return 'cannibalization'
    case 'DEFEND':
      return 'defend'
    case 'REFRESH':
      return 'refresh'
    default:
      return 'quick_win'
  }
}

function asAction(value: string | undefined): GscSeoAction {
  const upper = String(value || 'WATCH').toUpperCase()
  return (ACTIONS as string[]).includes(upper) ? (upper as GscSeoAction) : 'WATCH'
}

/** Promote first-party rows that the engine should actually act on. */
export function shouldPromoteGscRow(row: GscScoredRow): boolean {
  const query = String(row.query || '').trim()
  if (!query || isJunkQuery(query)) return false
  const action = asAction(row.action)
  const score = Number(row.score) || 0
  if (action === 'WATCH' && score < 60) return false
  if (action === 'DEFEND' && score < 50) return false
  if (score < 22) return false
  return true
}

export function gscEvidenceFromRow(row: GscScoredRow): GscWorkPlanEvidence | null {
  if (!shouldPromoteGscRow(row)) return null
  const action = asAction(row.action)
  return {
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    position: Number(row.position) || 0,
    score: Number(row.score) || 0,
    action,
    page: row.page ? String(row.page) : undefined,
  }
}

/**
 * Blend Master Engine deskScore (Formula B) with first-party GSC score
 * (Formula A). Engine play stays authoritative; GSC can lift or confirm.
 */
export function blendDeskWithGsc(deskScore: number, gscScore: number): number {
  const desk = Number.isFinite(deskScore) ? deskScore : 0
  const gsc = Number.isFinite(gscScore) ? gscScore : 0
  if (gsc <= 0) return Math.max(0, Math.min(100, Math.round(desk)))
  return Math.max(0, Math.min(100, Math.round(desk * 0.62 + gsc * 0.38)))
}

export function formatGscEvidenceLine(ev: GscWorkPlanEvidence): string {
  const ctrPct = ev.ctr > 1 ? ev.ctr : ev.ctr * 100
  const pos = ev.position > 0 ? (ev.position >= 10 ? String(Math.round(ev.position)) : ev.position.toFixed(1)) : '—'
  return `First-party GSC · ${ev.impressions.toLocaleString('en-US')} impressions · ${ev.clicks.toLocaleString('en-US')} clicks · pos ${pos} · CTR ${ctrPct.toFixed(1)}% · ${ev.action}`
}

export function titleFromGscQuery(query: string, action?: string): string {
  const titled = sanitizeDemandTerm(query).replace(/\b([a-z])/g, (ch) => ch.toUpperCase())
  const a = String(action || '').toUpperCase()
  if (a === 'CREATE') return `Fill the gap: ${titled}`
  if (a === 'REFRESH') return `Refresh: ${titled}`
  if (a === 'CONSOLIDATE') return `Consolidate: ${titled}`
  if (a === 'DEFEND') return `Defend: ${titled}`
  return titled
}

export function gscRowToSuggestionSeed(row: GscScoredRow): GscSuggestionSeed | null {
  const evidence = gscEvidenceFromRow(row)
  if (!evidence) return null
  const topic = sanitizeDemandTerm(String(row.query || ''))
  if (!topic) return null
  const play = gscActionToPlay(evidence.action)
  const reasons = Array.isArray(row.actionReasons) ? row.actionReasons.map((r) => String(r || '').trim()).filter(Boolean) : []
  const line = formatGscEvidenceLine(evidence)
  return {
    topic,
    title: titleFromGscQuery(topic, evidence.action),
    primaryKeyword: topic,
    keywords: [topic],
    play,
    impressions: evidence.impressions,
    clicks: evidence.clicks,
    ctr: evidence.ctr,
    position: evidence.position,
    opportunityScore: evidence.score,
    sourcePage: evidence.page,
    reason: reasons[0] || line,
    signals: [line, ...reasons].slice(0, 6),
    action: evidence.action,
  }
}

export function mergeGscIntoTopics<T extends { topic: string }>(
  existing: T[],
  rows: GscScoredRow[],
): { matched: Map<string, GscWorkPlanEvidence>; unmatched: Array<GscScoredRow & { evidence: GscWorkPlanEvidence }> } {
  const index = new Map<string, T>()
  for (const item of existing) {
    const key = gscTopicKey(item.topic)
    if (key && !index.has(key)) index.set(key, item)
  }
  const matched = new Map<string, GscWorkPlanEvidence>()
  const unmatched: Array<GscScoredRow & { evidence: GscWorkPlanEvidence }> = []
  for (const row of rows) {
    const evidence = gscEvidenceFromRow(row)
    if (!evidence) continue
    const key = gscTopicKey(row.query)
    if (!key) continue
    if (index.has(key)) matched.set(key, evidence)
    else unmatched.push({ ...row, evidence })
  }
  return { matched, unmatched }
}
