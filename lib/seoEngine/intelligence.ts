/**
 * SEO intelligence nexus.
 *
 * This is deliberately deterministic. It does not claim to reproduce a search
 * engine's ranking model; it joins observable evidence (GSC, crawl/index
 * checks, first-party guidance, policy sources, content inventory and shipped
 * outcomes) into an auditable decision surface for the Studio.
 */

import type { Opportunity, Play } from '@/lib/seoFactory/opportunityEngine'

export const INTELLIGENCE_MODEL_VERSION = 'seo-intelligence-v1'

export type EvidenceKind =
  | 'gsc'
  | 'knowledge'
  | 'crawl'
  | 'index'
  | 'structured_data'
  | 'internal_link'
  | 'backlink'
  | 'llm_visibility'
  | 'content_inventory'
  | 'outcome'

export interface EvidenceLineage {
  kind: EvidenceKind
  id?: string
  url?: string
  observedAt: string
  source: string
  authority: number
  excerpt?: string
}

export interface RegenerationFilters {
  /** Include only these opportunity plays. Empty means all plays. */
  plays?: Play[]
  /** Never create a sibling for a cannibalized term unless explicitly requested. */
  excludeCannibalization?: boolean
  /** Minimum explainable opportunity score (0-100). */
  minOpportunityScore?: number
  /** Maximum estimated difficulty (0-100). */
  maxDifficultyScore?: number
  /** Optional audience/country or intent narrowing. */
  region?: string
  intents?: string[]
  /** Exclude terms the operator has already seen or shipped. */
  excludeTopics?: string[]
  /** Ranking-model floor: items carry an optional `rankingScore` (0-100). */
  minRankingScore?: number
  /** Evidence-confidence floor: items carry an optional `confidence` (0-1). */
  minConfidence?: number
  /** AEO/GEO citation-potential floor: items carry an optional `aeoGeoScore` (0-100). */
  minAeoGeo?: number
  /** Only items whose evidence is fresher than this window (days). Uses `freshness`
   *  (0-1) when present, else derives from `observedAt` via the 45-day half-life. */
  freshnessWindowDays?: number
}

export interface PredictiveSignal {
  modelVersion: string
  topic: string
  play: Play
  opportunityScore: number
  confidence: number
  freshness: number
  rankability: number
  evidence: EvidenceLineage[]
  reasons: string[]
  regenerationEligible: boolean
}

export interface QueueLineageEvent {
  id: string
  ts: number
  status: string
  actor: 'engine' | 'studio' | 'gate' | 'github' | 'cron' | 'system'
  message: string
  evidence?: Record<string, unknown>
}

export interface QueueLineageNode {
  id: string
  sourceJobId: string | null
  status: string
  createdAt: string | null
  title?: string | null
  topic?: string | null
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
}

function normalizeTopic(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Linear freshness decay with a 45-day half-life. */
export function freshnessScore(observedAt: string | Date, now = Date.now(), halfLifeDays = 45): number {
  const time = new Date(observedAt).getTime()
  if (!Number.isFinite(time)) return 0
  const ageDays = Math.max(0, (now - time) / 86_400_000)
  return clamp(Math.pow(0.5, ageDays / Math.max(1, halfLifeDays)))
}

/**
 * Confidence is evidence quality, not a ranking factor. Multiple independent
 * observations increase confidence with diminishing returns; stale evidence
 * cannot dominate a fresh crawl/index or first-party policy signal.
 */
export function confidenceFromEvidence(evidence: EvidenceLineage[], now = Date.now()): number {
  if (!evidence.length) return 0
  const weighted = evidence.reduce((sum, item) => {
    const freshness = freshnessScore(item.observedAt, now)
    return sum + clamp(item.authority) * (0.35 + freshness * 0.65)
  }, 0)
  const independence = new Set(evidence.map((item) => item.kind)).size
  const diversityBonus = Math.min(0.15, Math.max(0, independence - 1) * 0.03)
  return clamp(weighted / evidence.length + diversityBonus)
}

export function buildPredictiveSignal(
  opportunity: Pick<Opportunity, 'topic' | 'play' | 'opportunityScore' | 'difficultyScore' | 'signals' | 'sourcePage'>,
  evidence: EvidenceLineage[] = [],
  now = Date.now(),
): PredictiveSignal {
  const freshness = evidence.length
    ? evidence.reduce((sum, item) => sum + freshnessScore(item.observedAt, now), 0) / evidence.length
    : 0
  const rankability = clamp(1 - (Number(opportunity.difficultyScore) || 100) / 100)
  const confidence = confidenceFromEvidence(evidence, now)
  const reasons = [...(opportunity.signals || [])]
  if (!evidence.length) reasons.push('No persisted evidence lineage yet — treat as exploratory.')
  if (freshness < 0.5) reasons.push('Evidence is aging — re-check GSC/crawl/policy sources before shipping.')
  if (opportunity.play === 'cannibalization') reasons.push('Existing coverage overlaps this query — consolidate or expand the canonical page.')
  return {
    modelVersion: INTELLIGENCE_MODEL_VERSION,
    topic: opportunity.topic,
    play: opportunity.play,
    opportunityScore: Math.max(0, Math.min(100, Number(opportunity.opportunityScore) || 0)),
    confidence,
    freshness,
    rankability,
    evidence,
    reasons,
    regenerationEligible: opportunity.play !== 'cannibalization' && confidence >= 0.35,
  }
}

/** Apply operator-safe filters without the old "fallback to excluded items" bug. */
export function filterRegenerationCandidates<T extends {
  topic?: string
  play?: Play
  opportunityScore?: number
  difficultyScore?: number
  intent?: string
  region?: string
  rankingScore?: number
  confidence?: number
  aeoGeoScore?: number
  freshness?: number
  observedAt?: string | Date
}>(items: T[], filters: RegenerationFilters = {}): T[] {
  const plays = new Set(filters.plays || [])
  const excluded = new Set((filters.excludeTopics || []).map(normalizeTopic).filter(Boolean))
  const min = Number.isFinite(filters.minOpportunityScore) ? Number(filters.minOpportunityScore) : 0
  const maxDifficulty = Number.isFinite(filters.maxDifficultyScore) ? Number(filters.maxDifficultyScore) : 100
  const intents = new Set((filters.intents || []).map((v) => String(v).toLowerCase()))
  const region = String(filters.region || '').toLowerCase()
  const minRanking = Number.isFinite(filters.minRankingScore) ? Number(filters.minRankingScore) : 0
  const minConfidence = Number.isFinite(filters.minConfidence) ? Number(filters.minConfidence) : 0
  const minAeoGeo = Number.isFinite(filters.minAeoGeo) ? Number(filters.minAeoGeo) : 0
  const freshnessWindowDays = Number.isFinite(filters.freshnessWindowDays) ? Math.max(0, Number(filters.freshnessWindowDays)) : null
  const minFreshness = freshnessWindowDays == null ? 0 : Math.pow(0.5, freshnessWindowDays / 45)
  const now = Date.now()

  return items.filter((item) => {
    const topic = normalizeTopic(item.topic)
    if (excluded.has(topic)) return false
    if (plays.size && !plays.has(item.play as Play)) return false
    if (filters.excludeCannibalization !== false && item.play === 'cannibalization') return false
    if ((Number(item.opportunityScore) || 0) < min) return false
    const difficulty = item.difficultyScore == null ? 100 : Number(item.difficultyScore)
    if (difficulty > maxDifficulty) return false
    if (intents.size && !intents.has(String(item.intent || '').toLowerCase())) return false
    if (region && String(item.region || '').toLowerCase() && String(item.region || '').toLowerCase() !== region) return false
    // ── Ranking-model filters (strict; an item lacking the field fails the gate) ──
    if (minRanking > 0 && (Number(item.rankingScore) || 0) < minRanking) return false
    if (minConfidence > 0 && (Number(item.confidence) || 0) < minConfidence) return false
    if (minAeoGeo > 0 && (Number(item.aeoGeoScore) || 0) < minAeoGeo) return false
    if (freshnessWindowDays != null) {
      // `Number(undefined)` is NaN — nullish coalescing does NOT catch that, so
      // fall back to observedAt explicitly when the field is absent.
      const raw = item.freshness == null ? Number.NaN : Number(item.freshness)
      const fresh = Number.isFinite(raw) ? raw : freshnessScore(item.observedAt, now)
      if (Number.isFinite(fresh) && fresh < minFreshness) return false
    }
    return true
  })
}

/** Append an immutable event while bounding storage for Worker-safe polling. */
export function appendQueueLineageEvent(
  existing: unknown,
  event: Omit<QueueLineageEvent, 'id' | 'ts'> & Partial<Pick<QueueLineageEvent, 'id' | 'ts'>>,
  max = 300,
): QueueLineageEvent[] {
  const previous = Array.isArray(existing) ? existing : []
  const next: QueueLineageEvent = {
    id: event.id || `lineage-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: event.ts || Date.now(),
    status: String(event.status || 'unknown'),
    actor: event.actor || 'system',
    message: String(event.message || '').slice(0, 2000),
    evidence: event.evidence,
  }
  return [...previous, next].slice(-Math.max(1, max)) as QueueLineageEvent[]
}

export function lineageFromJob(row: {
  id: string
  source_job_id?: string | null
  status?: string | null
  created_at?: string | null
  title?: string | null
  topic?: string | null
}): QueueLineageNode {
  return {
    id: row.id,
    sourceJobId: row.source_job_id || null,
    status: row.status || 'unknown',
    createdAt: row.created_at || null,
    title: row.title,
    topic: row.topic,
  }
}

export function formatLineageLabel(node: QueueLineageNode): string {
  const topic = node.topic || node.title || node.id.slice(0, 8)
  return `${topic} · ${node.status}`
}

export { normalizeTopic }
