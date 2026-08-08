/**
 * Keyword Cluster Engine — canonical-page resolution for the SEO Command Center.
 *
 * The anti-cannibalization layer. Instead of generating sibling articles for
 * every GSC query (which then need 301-merge cleanup), this module:
 *
 *   1. Clusters related keywords deterministically (token Jaccard + intent +
 *      region guards) so each cluster answers ONE searcher need.
 *   2. Resolves every cluster to a SINGLE canonical page:
 *        - `expand`  → an existing owner URL / shipped content_job already
 *                      covers the cluster → generation should expand THAT page
 *                      (its keywords merge into the brief), never a sibling.
 *        - `new`     → no coverage → one unique page owns the whole cluster.
 *   3. Emits a per-term resolution map + cluster registry the pipeline and UI
 *      can trust: verifiable, deterministic, explainable (reason on every row).
 */

export type ClusterResolutionMode = 'expand' | 'new'

export interface ClusterResolution {
  clusterId: string
  canonicalTerm: string
  keywords: string[]
  intent: string
  region: string
  totalImpressions: number
  mode: ClusterResolutionMode
  /** Existing page to expand (mode='expand') — repo/filePath from registry or job. */
  targetUrl: string | null
  targetRepo: string | null
  targetFilePath: string | null
  /** Existing content_jobs id when an in-flight/shipped job owns the cluster. */
  existingJobId: string | null
  reason: string
}

export interface ClusterInputQuery {
  term: string
  impressions: number
  clicks?: number
  position?: number
}

export interface ClusterRegistryRow {
  primary_keyword?: string
  owner_url?: string | null
  owner_host?: string | null
  action?: string
}

export interface ClusterCoverageItem {
  title?: string | null
  topic?: string | null
  primaryKeyword?: string | null
  status?: string | null
  url?: string | null
  id?: string | null
}

export interface ClusterEngineResult {
  clusters: Array<{ id: string; canonicalTerm: string; keywords: string[]; intent: string; region: string; totalImpressions: number }>
  /** term (lowercase) → resolution */
  byTerm: Record<string, ClusterResolution>
  /** term (lowercase) → related keyword suggestions for the engine's relatedByTerm */
  relatedByTerm: Record<string, string[]>
  coveredClusters: number
  newClusters: number
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'for', 'on', 'and', 'or', 'with', 'vs', 'is', 'are',
  'how', 'what', 'why', 'when', 'where', 'can', 'do', 'does', 'get', 'your', 'my', 'i',
  '2026', '2025', 'guide', 'complete', 'full', 'best', 'top', 'near', 'new',
])

function tokens(term: string): string[] {
  return (term || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  let shared = 0
  for (const t of a) if (setB.has(t)) shared += 1
  const union = new Set([...a, ...b]).size
  return shared / Math.max(1, union)
}

function phraseContainment(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0
  const setB = new Set(b)
  const hit = a.filter((t) => setB.has(t)).length
  return hit / Math.max(1, a.length)
}

const INTENT_RE: Array<[RegExp, string]> = [
  [/apply|fee|cost|price|pay|enroll|register|hire|book/i, 'transactional'],
  [/best|top|vs|versus|compare|comparison|review|alternative/i, 'commercial'],
  [/near|location|embassy|consulate|university|college|campus|city/i, 'local'],
  [/login|portal|account|status|track|check/i, 'navigational'],
]

function intentOf(term: string): string {
  const t = `${term}`
  for (const [re, label] of INTENT_RE) if (re.test(t)) return label
  return 'informational'
}

const REGION_RE: Array<[RegExp, string]> = [
  [/\bcanada|canadian|ircc|pgwp|express entry|study permit/i, 'CA'],
  [/\buk\b|british|ukvi|graduate route|skilled worker|ilr/i, 'UK'],
  [/\baustralia|australian|485|subclass|home affairs|pte/i, 'AU'],
  [/\b(us|usa)\b|f-?1|opt|uscis|h-?1b|green card|sevis/i, 'US'],
]

function regionOf(term: string, fallback = 'US'): string {
  for (const [re, label] of REGION_RE) if (re.test(term)) return label
  return fallback
}

function sameIntent(a: string, b: string): boolean {
  const ia = intentOf(a)
  const ib = intentOf(b)
  if (ia === ib) return true
  // informational clusters broadly with anything; concrete intents stick together
  if (ia === 'informational' || ib === 'informational') return true
  return false
}

export function clusterKeywords(opts: {
  queries: ClusterInputQuery[]
  region?: string
  minImpressions?: number
}): ClusterEngineResult {
  const region = opts.region || 'US'
  const minImp = opts.minImpressions ?? 1
  const terms: ClusterInputQuery[] = opts.queries
    .filter((q) => (q.term || '').trim().length > 2 && (q.impressions || 0) >= minImp)
    .map((q) => ({ ...q, term: normalize(q.term) }))
    .filter((q) => q.term)

  const n = terms.length
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

  const tokCache = terms.map((q) => tokens(q.term))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const ti = terms[i].term
      const tj = terms[j].term
      if (regionOf(ti, region) !== regionOf(tj, region)) continue
      if (!sameIntent(ti, tj)) continue
      const jac = jaccard(tokCache[i], tokCache[j])
      const cont = Math.max(phraseContainment(tokCache[i], tokCache[j]), phraseContainment(tokCache[j], tokCache[i]))
      if (jac >= 0.34 || cont >= 0.55) union(i, j)
    }
  }

  // Group by root
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r)!.push(i)
  }

  const clusters: ClusterEngineResult['clusters'] = []
  const byTerm: Record<string, ClusterResolution> = {}
  const relatedByTerm: Record<string, string[]> = {}

  for (const [root, idxs] of groups) {
    const members = idxs.map((i) => terms[i])
    members.sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    const canonical = members[0].term
    const keywords = members.map((m) => m.term)
    const intent = intentOf(canonical)
    const reg = regionOf(canonical, region)
    const totalImpressions = members.reduce((s, m) => s + (m.impressions || 0), 0)
    const id = `${slugify(canonical)}-${root}`

    clusters.push({ id, canonicalTerm: canonical, keywords, intent, region: reg, totalImpressions })

    // Seed resolution: net-new unique page owns the whole cluster
    const resolution: ClusterResolution = {
      clusterId: id,
      canonicalTerm: canonical,
      keywords,
      intent,
      region: reg,
      totalImpressions,
      mode: 'new',
      targetUrl: null,
      targetRepo: null,
      targetFilePath: null,
      existingJobId: null,
      reason: `New unique page owns a ${keywords.length}-keyword cluster (${totalImpressions} impressions/mo): ${keywords.slice(0, 5).join(', ')}${keywords.length > 5 ? '…' : ''}`,
    }

    for (const m of members) {
      relatedByTerm[m.term] = keywords.filter((k) => k !== m.term).slice(0, 5)
      byTerm[m.term] = resolution
    }
  }

  const coveredClusters = clusters.filter((c) => byTerm[c.canonicalTerm]?.mode === 'expand').length
  return { clusters, byTerm, relatedByTerm, coveredClusters, newClusters: clusters.length - coveredClusters }
}

/**
 * Resolve clusters against the estate: existing owner URLs + shipped content jobs.
 * Mutates the byTerm resolutions in place (mode 'new' → 'expand') and returns
 * the updated result. Deterministic — highest-demand cluster wins ties.
 */
export function resolveClustersToPages(opts: {
  result: ClusterEngineResult
  registry?: ClusterRegistryRow[]
  coverage?: ClusterCoverageItem[]
}): ClusterEngineResult {
  const { result, registry = [], coverage = [] } = opts
  const byTerm = result.byTerm
  const clusters = result.clusters

  // Registry index: normalized primary keyword → row
  const regIndex = new Map<string, ClusterRegistryRow>()
  for (const row of registry) {
    const pk = normalize(row.primary_keyword || '')
    if (pk) {
      const existing = regIndex.get(pk)
      if (!existing || String(row.owner_url || '').length > String(existing.owner_url || '').length) {
        regIndex.set(pk, row)
      }
    }
  }
  const regRows = [...regIndex.values()]

  // Coverage index: shipped/active jobs only
  const SHIPPED = new Set(['merged', 'pr_created', 'deployed', 'drafting', 'publishing', 'pending'])
  const liveCoverage = coverage.filter((c) => SHIPPED.has(String(c.status || 'merged').toLowerCase()))

  for (const cluster of clusters) {
    const res = byTerm[cluster.canonicalTerm]
    if (!res) continue

    // ── Pass 1: existing owner URL in the strategies registry ──
    let bestReg: { row: ClusterRegistryRow; score: number } | null = null
    for (const row of regRows) {
      const a = tokens(cluster.canonicalTerm)
      const b = tokens(row.primary_keyword || '')
      const score = Math.max(jaccard(a, b), phraseContainment(a, b), phraseContainment(b, a))
      if (score >= 0.5 && (!bestReg || score > bestReg.score)) bestReg = { row, score }
    }
    if (bestReg && bestReg.row.owner_url) {
      const row = bestReg.row
      res.mode = 'expand'
      res.targetUrl = String(row.owner_url)
      res.targetRepo = String(row.owner_host || '')
      res.targetFilePath = null // resolved via ownership.filePathFromOwnerUrl at ship time
      res.reason = `Cluster resolves to existing strategy page ${row.owner_url} (${bestReg.score.toFixed(0)}% match) — expand it, do not create a sibling`
      continue
    }

    // ── Pass 2: shipped/in-flight content_jobs already own the cluster ──
    let bestJob: { c: ClusterCoverageItem; score: number } | null = null
    for (const c of liveCoverage) {
      const hay = normalize(`${c.title || ''} ${c.topic || ''} ${c.primaryKeyword || ''}`)
      if (!hay) continue
      const a = tokens(cluster.canonicalTerm)
      const b = tokens(hay)
      const score = Math.max(jaccard(a, b), phraseContainment(a, b), phraseContainment(b, a))
      if (score >= 0.45 && (!bestJob || score > bestJob.score)) bestJob = { c, score }
    }
    if (bestJob && bestJob.c.url) {
      const c = bestJob.c
      res.mode = 'expand'
      res.targetUrl = String(c.url)
      res.targetFilePath = String(c.url)
      res.existingJobId = String(c.id || '')
      res.reason = `Cluster already covered by shipped job “${(c.title || c.topic || '').slice(0, 60)}” (${bestJob.score.toFixed(0)}%) — expand that page, do not create a sibling`
      continue
    }

    res.mode = 'new'
    res.reason = `No estate coverage — one new unique page owns the ${cluster.keywords.length}-keyword cluster (${cluster.totalImpressions} impressions/mo)`
  }

  const covered = clusters.filter((c) => byTerm[c.canonicalTerm]?.mode === 'expand').length
  return { ...result, coveredClusters: covered, newClusters: clusters.length - covered }
}

/** Convenience: full pipeline from raw GSC queries → resolved clusters. */
export async function buildKeywordClusters(opts: {
  queries: ClusterInputQuery[]
  region?: string
  registry?: ClusterRegistryRow[]
  coverage?: ClusterCoverageItem[]
  minImpressions?: number
}): Promise<ClusterEngineResult> {
  const base = clusterKeywords({ queries: opts.queries, region: opts.region, minImpressions: opts.minImpressions })
  return resolveClustersToPages({ result: base, registry: opts.registry, coverage: opts.coverage })
}
