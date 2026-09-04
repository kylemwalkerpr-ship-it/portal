/**
 * Phase 3 — deterministic Jaccard grouping for discovered keywords.
 * Reuses token + Jaccard from keywordCluster. No embeddings, no network.
 */

import { jaccard, tokens } from './keywordCluster'

function containment(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  return a.filter((t) => setB.has(t)).length / Math.max(1, a.length)
}
import { normalizeKeyword, type KeywordCandidate } from './keywordDiscover'

export type ClusteringConfig = {
  jaccardThreshold: number
  minClusterSize: number
  keepSingletons: boolean
}

export const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  jaccardThreshold: 0.34,
  minClusterSize: 1,
  keepSingletons: true,
}

export type KeywordTopicCluster = {
  id: string
  label: string
  keywords: KeywordCandidate[]
  entities: string[]
}

export function titleCaseLabel(phrase: string): string {
  return String(phrase || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ')
}

/** Dominant readable phrase: shortest member that still covers the shared tokens. */
export function clusterLabel(keywords: string[]): string {
  if (!keywords.length) return ''
  const tokSets = keywords.map((k) => tokens(k))
  const freq = new Map<string, number>()
  for (const set of tokSets) {
    for (const t of new Set(set)) freq.set(t, (freq.get(t) || 0) + 1)
  }
  const shared = [...freq.entries()].filter(([, n]) => n >= Math.max(2, Math.ceil(keywords.length * 0.5))).map(([t]) => t)
  const scored = keywords
    .map((k, i) => {
      const set = new Set(tokSets[i])
      const cover = shared.length ? shared.filter((t) => set.has(t)).length / shared.length : 1
      return { k, cover, len: k.length }
    })
    .sort((a, b) => b.cover - a.cover || a.len - b.len)
  return titleCaseLabel(scored[0]?.k || keywords[0])
}

export function groupKeywords(
  candidates: KeywordCandidate[],
  config: Partial<ClusteringConfig> = {},
): KeywordTopicCluster[] {
  const cfg = { ...DEFAULT_CLUSTERING_CONFIG, ...config }
  const items = candidates.filter((c) => c.normalized || normalizeKeyword(c.keyword))
  const n = items.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const tok = items.map((c) => tokens(c.normalized || c.keyword))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const jac = jaccard(tok[i], tok[j])
      const cont = Math.max(containment(tok[i], tok[j]), containment(tok[j], tok[i]))
      if (jac >= cfg.jaccardThreshold || cont >= Math.max(0.55, cfg.jaccardThreshold)) union(i, j)
    }
  }

  const buckets = new Map<number, KeywordCandidate[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!buckets.has(r)) buckets.set(r, [])
    buckets.get(r)!.push(items[i])
  }

  const clusters: KeywordTopicCluster[] = []
  for (const [root, members] of buckets) {
    if (members.length < cfg.minClusterSize) continue
    if (!cfg.keepSingletons && members.length < 2) continue
    const phrases = members.map((m) => m.keyword)
    const label = clusterLabel(phrases)
    const entitySet = new Set(tokens(label))
    clusters.push({
      id: `cl_${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}_${root}`,
      label,
      keywords: members.sort((a, b) => a.normalized.localeCompare(b.normalized)),
      entities: [...entitySet],
    })
  }
  clusters.sort((a, b) => b.keywords.length - a.keywords.length || a.label.localeCompare(b.label))
  return clusters
}
