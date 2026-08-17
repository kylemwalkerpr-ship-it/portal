/**
 * Adaptive LLM-audit query selector.
 *
 * The masthead used to slice DEFAULT_AUDIT_QUERIES from index 0, so every
 * run opened with "How do I get a student visa for Canada from Nigeria?".
 *
 * This module builds a scored pool from planner demand, knowledge titles,
 * prior visibility losses, and a first-order query graph (token Jaccard =
 * Markov adjacency). Highest expected SEO-citation lift wins. Selection is
 * deterministic for a given clock so tests and the daily cron stay replayable.
 *
 * Weighting follows the Master SEO Engine ingestion spec (subsystem layers,
 * not a flat list): novelty, loss-recovery, demand, adjacency, planner.
 */

export type QuerySource =
  | 'seed'
  | 'plan'
  | 'knowledge'
  | 'gsc'
  | 'prior_loss'
  | 'prior_win'
  | 'markov'

export interface PriorAudit {
  query: string
  cited: boolean
  shareOfVoice: number
  createdAt: string
}

export interface PlanSignal {
  primaryTerm: string
  relatedTerms?: string[]
  faq?: string[]
  opportunityScore?: number
  impressions?: number
}

export interface QueryCandidate {
  query: string
  source: QuerySource
  score: number
  reasons: string[]
}

const STOP = new Set([
  'the', 'and', 'for', 'how', 'do', 'i', 'a', 'an', 'to', 'of', 'in', 'on', 'my',
  'is', 'are', 'what', 'when', 'who', 'can', 'you', 'from', 'with', 'your',
])

const QUERY_RE = /(visa|permit|immigration|opt|pgwp|cas|i-20|green card|ilr|crs|subclass|skilled worker|f-1|h-1b|study|spouse|nomination|express entry|citizenship)/i

export function normalizeAuditQuery(q: string): string {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function queryTokens(q: string): Set<string> {
  return new Set(
    normalizeAuditQuery(q)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  )
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

const COUNTRY_TOKENS = new Set(['canada', 'uk', 'britain', 'australia', 'usa', 'america', 'nigeria', 'ghana', 'india', 'china'])
const INTENT_TOKENS = new Set(['visa', 'permit', 'student', 'study', 'spouse', 'worker', 'pr', 'citizenship', 'opt', 'pgwp', 'h1b', 'ilr'])

/** First-order query affinity: Jaccard plus shared country/intent tokens. */
export function queryAffinity(a: string, b: string): number {
  const A = queryTokens(a)
  const B = queryTokens(b)
  let score = jaccard(A, B)
  if ([...COUNTRY_TOKENS].some((t) => A.has(t) && B.has(t))) score += 0.22
  if ([...INTENT_TOKENS].some((t) => A.has(t) && B.has(t))) score += 0.16
  return Math.min(1, score)
}

export function usableQuery(raw: string): string | null {
  const q = String(raw || '').replace(/\s+/g, ' ').trim()
  if (q.length < 8 || q.length > 140) return null
  if (!QUERY_RE.test(q) && q.split(' ').length < 4) return null
  return q
}

function rotateBonus(query: string, salt: string): number {
  let h = 2166136261
  const s = `${normalizeAuditQuery(query)}|${salt}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 19
}

function daySalt(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export function scoreAuditCandidates(input: {
  seeds: string[]
  plans?: PlanSignal[]
  knowledgeTitles?: string[]
  gscQueries?: Array<{ query: string; impressions?: number }>
  priorAudits?: PriorAudit[]
  now?: number
}): QueryCandidate[] {
  const now = input.now ?? Date.now()
  const salt = daySalt(now)
  const byKey = new Map<string, QueryCandidate>()

  const upsert = (raw: string, source: QuerySource, add: number, reason: string) => {
    const query = usableQuery(raw)
    if (!query) return
    const key = normalizeAuditQuery(query)
    const existing = byKey.get(key)
    if (existing) {
      existing.score += add
      existing.reasons.push(reason)
      if (source === 'plan' || source === 'gsc') existing.source = source
      return
    }
    byKey.set(key, { query, source, score: add + rotateBonus(query, salt), reasons: [reason] })
  }

  for (const seed of input.seeds || []) {
    upsert(seed, 'seed', 8, 'seed bank')
  }
  for (const title of input.knowledgeTitles || []) {
    upsert(title, 'knowledge', 16, 'fresh knowledge title')
  }
  for (const g of input.gscQueries || []) {
    const imp = Number(g.impressions) || 0
    const demand = imp > 0 ? Math.min(28, Math.log10(imp + 1) * 10) : 10
    upsert(g.query, 'gsc', demand, imp ? `gsc ${imp} impressions` : 'gsc demand')
  }
  for (const p of input.plans || []) {
    const opp = Math.max(0, Math.min(1, Number(p.opportunityScore) || 0))
    const imp = Number(p.impressions) || 0
    const boost = 12 + opp * 28 + (imp > 0 ? Math.min(12, Math.log10(imp + 1) * 4) : 0)
    upsert(p.primaryTerm, 'plan', boost, `planner opp ${opp.toFixed(2)}`)
    for (const rel of (p.relatedTerms || []).slice(0, 4)) {
      upsert(rel, 'plan', boost * 0.7, 'planner related term')
    }
    for (const faq of (p.faq || []).slice(0, 4)) {
      upsert(faq, 'plan', boost * 0.85, 'planner FAQ')
    }
  }

  const prior = input.priorAudits || []
  const latestByQuery = new Map<string, PriorAudit>()
  for (const row of prior) {
    const key = normalizeAuditQuery(row.query)
    const prev = latestByQuery.get(key)
    if (!prev || Date.parse(row.createdAt) > Date.parse(prev.createdAt)) latestByQuery.set(key, row)
  }

  const COOLDOWN_MS = 5 * 24 * 60 * 60_000
  const RECHECK_LOSS_MS = 2 * 24 * 60 * 60_000
  const RECONFIRM_WIN_MS = 28 * 24 * 60 * 60_000

  for (const [key, row] of latestByQuery) {
    const age = now - Date.parse(row.createdAt)
    const cand = byKey.get(key)
    if (!cand) {
      if (!row.cited && age > RECHECK_LOSS_MS) {
        upsert(row.query, 'prior_loss', 26, 'uncited — re-measure')
      } else if (row.cited && age > RECONFIRM_WIN_MS) {
        upsert(row.query, 'prior_win', 6, 'old win — reconfirm')
      }
      continue
    }
    if (age < COOLDOWN_MS) {
      cand.score -= 55
      cand.reasons.push('recently audited — cooldown')
    } else if (!row.cited) {
      cand.score += 22
      cand.source = 'prior_loss'
      cand.reasons.push('prior loss — still uncited')
    } else {
      cand.score -= 8
      cand.reasons.push('already cited recently')
    }
  }

  const lastRun = prior
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 8)

  if (lastRun.length) {
    for (const cand of byKey.values()) {
      let best = 0
      let from = ''
      for (const prev of lastRun) {
        const sim = queryAffinity(cand.query, prev.query)
        if (sim < 0.22 || sim > 0.94) continue
        const weight = prev.cited ? 0.45 : 1.25
        const edge = sim * weight
        if (edge > best) {
          best = edge
          from = prev.query
        }
      }
      if (best > 0) {
        cand.score += best * 22
        cand.reasons.push(`markov neighbor of “${from.slice(0, 48)}”`)
        if (cand.source === 'seed') cand.source = 'markov'
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.score - a.score || a.query.localeCompare(b.query))
}

/**
 * Take the top-N scored candidates with light diversity: skip a candidate
 * that shares ≥60% tokens with one already picked, unless the pool is thin.
 */
export function selectAuditQueries(candidates: QueryCandidate[], limit: number): QueryCandidate[] {
  const cap = Math.max(1, Math.min(15, limit))
  const picked: QueryCandidate[] = []
  for (const c of candidates) {
    if (picked.length >= cap) break
    const tokens = queryTokens(c.query)
    const tooClose = picked.some((p) => jaccard(tokens, queryTokens(p.query)) >= 0.6)
    if (tooClose && picked.length + (candidates.length - picked.length) > cap) continue
    picked.push(c)
  }
  if (picked.length < cap) {
    for (const c of candidates) {
      if (picked.length >= cap) break
      if (picked.some((p) => normalizeAuditQuery(p.query) === normalizeAuditQuery(c.query))) continue
      picked.push(c)
    }
  }
  return picked
}
