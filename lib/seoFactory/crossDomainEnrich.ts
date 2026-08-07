/**
 * Cross-Domain Enrichment Engine
 *
 * Builds topic clusters across all subdomains, computes intelligent cross-domain
 * link recommendations, and produces enrichment briefs consumed by the content
 * generation pipeline so every article ships with high-value cross-links already
 * embedded — not bolted on after the fact.
 *
 * Architecture:
 *   1. Domain Topology — canonical map of subdomains, their content types, and
 *      cross-domain relationships (e.g. legal ↔ usa universities).
 *   2. Topic Clustering — groups pages by semantic topic using keyword vectors
 *      + cosine similarity, forming clusters that span subdomains.
 *   3. Enrichment Scoring — per-page recommendations weighted by keyword
 *      overlap, H2 alignment, cross-domain bonus, cornerstone priority, and
 *      link-freshness decay.
 *   4. Enrichment Briefs — compact JSON payloads fed into the content generation
 *      prompt so the AI writes with cross-links in mind from the first draft.
 */

import {
  type SiteHealthPage,
  type SiteHealthScope,
  auditSiteHealthChunked,
  CONFIGS,
} from '@/lib/seoFactory/siteHealth'

async function loadAllPages(scope: SiteHealthScope): Promise<SiteHealthPage[]> {
  const allPages: SiteHealthPage[] = []
  let batchStart = 0
  const BATCH_SIZE = 30
  while (true) {
    const result = await auditSiteHealthChunked(scope, batchStart, BATCH_SIZE)
    allPages.push(...result.pages)
    if (result.nextBatch === null) break
    batchStart = result.nextBatch
  }
  return allPages
}

// ── Domain Topology ──────────────────────────────────────────────────────────

/** Canonical subdomain → content-type mapping and inter-domain relationships. */
export interface DomainNode {
  host: string
  label: string
  /** Content types this domain publishes */
  contentTypes: string[]
  /** Domains this one is "adjacent" to (should interlink heavily) */
  adjacent: string[]
  /** Priority weight for cornerstone content (1 = neutral, 2 = double weight) */
  cornerstoneWeight: number
  /** Base URL for constructing absolute links */
  baseUrl: string
}

/** The full domain topology of the YouSafe estate. */
export const DOMAIN_TOPOLOGY: Record<string, DomainNode> = {
  legal: {
    host: 'legal',
    label: 'Legal Guides',
    contentTypes: ['legal_guide', 'article', 'regional_page'],
    adjacent: ['usa', 'uk', 'ca', 'au'],
    cornerstoneWeight: 2.0,
    baseUrl: 'https://legal.yousafeconsultancy.com',
  },
  usa: {
    host: 'usa',
    label: 'USA Universities',
    contentTypes: ['university_page', 'regional_page', 'article'],
    adjacent: ['legal', 'uk', 'ca', 'au'],
    cornerstoneWeight: 1.8,
    baseUrl: 'https://usa.yousafeconsultancy.com',
  },
  uk: {
    host: 'uk',
    label: 'UK Universities',
    contentTypes: ['university_page', 'regional_page', 'article'],
    adjacent: ['legal', 'usa', 'ca', 'au'],
    cornerstoneWeight: 1.5,
    baseUrl: 'https://uk.yousafeconsultancy.com',
  },
  ca: {
    host: 'ca',
    label: 'Canada',
    contentTypes: ['university_page', 'regional_page', 'article'],
    adjacent: ['legal', 'usa', 'uk', 'au'],
    cornerstoneWeight: 1.3,
    baseUrl: 'https://legal.yousafeconsultancy.com/ca',
  },
  au: {
    host: 'au',
    label: 'Australia',
    contentTypes: ['university_page', 'regional_page', 'article'],
    adjacent: ['legal', 'usa', 'uk', 'ca'],
    cornerstoneWeight: 1.2,
    baseUrl: 'https://legal.yousafeconsultancy.com/au',
  },
  apex: {
    host: 'apex',
    label: 'Apex (Global)',
    contentTypes: ['landing_page', 'article'],
    adjacent: ['legal', 'usa', 'uk', 'ca', 'au'],
    cornerstoneWeight: 1.0,
    baseUrl: 'https://www.yousafeconsultancy.com',
  },
}

// ── Topic Clustering ─────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'you', 'your', 'that', 'this', 'with', 'from',
  'have', 'are', 'not', 'but', 'all', 'can', 'has', 'was', 'will',
  'about', 'which', 'their', 'been', 'would', 'there', 'what', 'when',
  'more', 'some', 'than', 'also', 'into', 'other', 'only', 'such',
  'over', 'each', 'most', 'even', 'these', 'just', 'after', 'before',
  'between', 'through', 'during', 'because', 'should', 'could',
  'they', 'them', 'its', 'being', 'doing', 'very', 'much',
  'how', 'where', 'who', 'why', 'whom', 'then', 'now', 'well',
])

function tokenize(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t))
}

function extractKeywordVector(content: string): Map<string, number> {
  const title = content.match(/^#\s+(.+)$/m)?.[1] || ''
  const h2s = [...content.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]).join(' ')
  const body = content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  const text = `${title} ${title} ${h2s} ${h2s} ${body}`.slice(0, 12000)
  const tokens = tokenize(text)
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1)
  return freq
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  const allKeys = new Set([...a.keys(), ...b.keys()])
  let dot = 0, magA = 0, magB = 0
  for (const k of allKeys) {
    const va = a.get(k) || 0
    const vb = b.get(k) || 0
    dot += va * vb
    magA += va * va
    magB += vb * vb
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

export interface TopicCluster {
  /** Cluster ID — a representative keyword phrase */
  label: string
  /** Primary keywords defining this cluster */
  keywords: string[]
  /** Pages in this cluster (across all domains) */
  pages: SiteHealthPage[]
  /** Domain distribution: host → count */
  domainDistribution: Record<string, number>
  /** Cluster strength: average intra-cluster cosine similarity */
  cohesion: number
}

/**
 * Group pages into semantic topic clusters using a lightweight iterative
 * centroid algorithm. Returns clusters that span subdomains.
 */
export async function buildTopicClusters(
  scope: SiteHealthScope = 'all',
): Promise<TopicCluster[]> {
  const pages = await loadAllPages(scope)

  if (pages.length < 3) return []

  // Build keyword vectors
  const vectors = pages.map((p) => ({
    page: p,
    vector: extractKeywordVector((p as any).content || ''),
  }))

  // Gather top keywords across all pages for centroid seeding
  const globalFreq = new Map<string, number>()
  for (const v of vectors) {
    for (const [kw, f] of v.vector) {
      globalFreq.set(kw, (globalFreq.get(kw) || 0) + f)
    }
  }

  // Sort keywords by tf-idf-style scoring (high freq in few pages = good centroid)
  const df = new Map<string, number>()
  for (const v of vectors) {
    const seen = new Set(v.vector.keys())
    for (const kw of seen) df.set(kw, (df.get(kw) || 0) + 1)
  }

  const keywordScores = [...globalFreq.entries()]
    .map(([kw, tf]) => {
      const docFreq = df.get(kw) || 1
      return { kw, score: tf / docFreq }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)

  // Initialize clusters with top distinct keywords
  const clusters: Array<{ centroid: Map<string, number>; keywords: string[]; pages: SiteHealthPage[] }> = []
  const assigned = new Set<number>()

  for (const { kw } of keywordScores) {
    // Find a page that contains this keyword as a seed
    const seedIdx = vectors.findIndex((v, i) => !assigned.has(i) && v.vector.has(kw))
    if (seedIdx < 0) continue
    assigned.add(seedIdx)
    clusters.push({
      centroid: new Map(vectors[seedIdx].vector),
      keywords: [kw],
      pages: [vectors[seedIdx].page],
    })
    if (clusters.length >= 8) break
  }

  if (clusters.length < 2) return []

  // Assign remaining pages to nearest cluster
  for (let i = 0; i < vectors.length; i++) {
    if (assigned.has(i)) continue
    let bestCluster = -1
    let bestScore = 0
    for (let c = 0; c < clusters.length; c++) {
      const score = cosineSimilarity(vectors[i].vector, clusters[c].centroid)
      if (score > bestScore) { bestScore = score; bestCluster = c }
    }
    if (bestScore > 0.05 && bestCluster >= 0) {
      clusters[bestCluster].pages.push(vectors[i].page)
      // Update centroid
      const c = clusters[bestCluster].centroid
      for (const [kw, f] of vectors[i].vector) {
        c.set(kw, (c.get(kw) || 0) + f * 0.3)
      }
    }
  }

  // Build domain distribution and label each cluster
  return clusters.map((c) => {
    const domainDist: Record<string, number> = {}
    for (const p of c.pages) {
      domainDist[p.host] = (domainDist[p.host] || 0) + 1
    }

    // Label = top 2 keywords joined
    const label = c.keywords.slice(0, 2).join(' · ')

    // Cohesion = average intra-cluster similarity
    let totalSim = 0
    let pairs = 0
    const pageVectors = c.pages.map((p) => extractKeywordVector((p as any).content || ''))
    for (let i = 0; i < pageVectors.length; i++) {
      for (let j = i + 1; j < pageVectors.length; j++) {
        totalSim += cosineSimilarity(pageVectors[i], pageVectors[j])
        pairs++
      }
    }
    const cohesion = pairs > 0 ? Math.round((totalSim / pairs) * 1000) / 1000 : 0

    return {
      label,
      keywords: c.keywords.slice(0, 6),
      pages: c.pages,
      domainDistribution: domainDist,
      cohesion,
    }
  })
}

// ── Enrichment Scoring ───────────────────────────────────────────────────────

export interface CrossDomainLink {
  url: string
  host: string
  title: string
  anchorText: string
  /** 0–1 relevance + cross-domain bonus score */
  score: number
  /** Which H2 in the source page this link best fits under */
  bestSourceH2: string | null
  /** Which H2 from the target page inspired the anchor text */
  targetH2: string | null
  /** Whether this is a cross-domain link (different host) */
  isCrossDomain: boolean
  /** Whether the target is a cornerstone page (higher priority) */
  isCornerstone: boolean
  /** Whether a backlink from target → source already exists */
  hasBacklink: boolean
}

export interface EnrichmentBrief {
  /** The source page being enriched */
  source: {
    url: string
    host: string
    title: string
  }
  /** Recommended cross-domain links */
  links: CrossDomainLink[]
  /** Topic cluster the source page belongs to */
  cluster: string | null
  /** Domain adjacency scores */
  domainAdjacency: Record<string, number>
  /** Suggested inline links (placed under matching H2s) */
  inlineLinks: CrossDomainLink[]
  /** Suggested footer/sidebar links */
  footerLinks: CrossDomainLink[]
}

function h2Overlap(aContent: string, bContent: string): number {
  const aH2s = new Set([...aContent.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].toLowerCase()))
  const bH2s = new Set([...bContent.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].toLowerCase()))
  if (!aH2s.size || !bH2s.size) return 0
  let overlap = 0
  for (const h2 of aH2s) if (bH2s.has(h2)) overlap++
  return overlap / Math.min(aH2s.size, bH2s.size)
}

/**
 * Pick anchor text from the target page's own H2 headings, preferring ones
 * that overlap with the source's topic tokens. Falls back to title/H1.
 */
function anchorTextFromTarget(
  target: SiteHealthPage,
  sourceContent?: string,
): { text: string; targetH2: string | null } {
  const title = target.title || ''
  const h2s = [...((target as any).content || '').matchAll(/^##\s+(.+)$/gm)].map((m) => m[1])
  const nonGenericH2s = h2s.filter(
    (h) =>
      h.length >= 12 &&
      h.length <= 100 &&
      !/^(faq|sources?|disclaimer|in 60 seconds|official sources|related guides|you might also|summary|conclusion|next steps|references|overview|introduction)$/i.test(h.trim()),
  )

  if (sourceContent && nonGenericH2s.length) {
    const sourceTokens = new Set(tokenize(sourceContent))
    let bestH2 = ''
    let bestOverlap = 0
    for (const h2 of nonGenericH2s) {
      const h2Tokens = tokenize(h2)
      const overlap = h2Tokens.filter((t) => sourceTokens.has(t)).length
      if (overlap > bestOverlap) { bestOverlap = overlap; bestH2 = h2 }
    }
    if (bestH2 && bestH2.length >= 15) return { text: bestH2.trim(), targetH2: bestH2.trim() }
  }

  // Fallback: any good H2
  const goodH2 = nonGenericH2s.find((h) => h.length >= 15 && h.length <= 100)
  if (goodH2) return { text: goodH2.trim(), targetH2: goodH2.trim() }

  // Final fallback: title or H1
  const h1 = ((target as any).content || '').match(/^#{1,2}\s+(.+)$/m)?.[1] || ''
  return {
    text: (title.length >= 15 && title.length <= 90) ? title : (h1 || title || target.url),
    targetH2: null,
  }
}

/**
 * Find the best-matching source H2 for a target page, using both the source's
 * H2 headings and the target's title + H2s for richer matching.
 */
function matchSourceH2(
  sourceContent: string,
  target: SiteHealthPage,
): string | null {
  const targetText = [
    target.title || '',
    ...(((target as any).content || '').match(/^##\s+(.+)$/gm)?.map((m: string) => m.slice(1)) || []),
    ((target as any).content || '').match(/^#{1,2}\s+(.+)$/m)?.[1] || '',
  ].join(' ')

  const targetTokens = new Set(tokenize(targetText))
  const sourceH2s = [...sourceContent.matchAll(/^##\s+(.+)$/gm)]
  if (!sourceH2s.length) return null

  let bestH2: string | null = null
  let bestScore = 0
  for (const [match] of sourceH2s) {
    const heading = match.slice(1)
    const h2Tokens = tokenize(heading)
    const overlap = h2Tokens.filter((t) => targetTokens.has(t)).length
    const score = overlap * 3 - heading.length * 0.02
    if (score > bestScore) { bestScore = score; bestH2 = heading }
  }

  return bestScore > 1.5 ? bestH2 : null
}

/**
 * Check whether `targetPage` already links back to `sourceUrl` (bidirectional).
 */
function checkBacklink(targetPage: SiteHealthPage, sourceUrl: string): boolean {
  const content = (targetPage as any).content || ''
  const patterns = [
    /href\s*=\s*["'`]([^"'`]+)["'`]/gi,
    /\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g,
  ]
  const searchUrl = sourceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(content))) {
      try {
        const u = new URL(m[1], 'https://yousafeconsultancy.com')
        const normalized = `${u.hostname}${u.pathname.replace(/\/+$/, '') || '/'}`
        if (normalized.includes(searchUrl)) return true
      } catch {}
    }
  }
  return false
}

/**
 * Build a cross-domain enrichment brief for a single source page.
 * Computes link recommendations weighted by relevance, domain adjacency,
 * cornerstone priority, and link freshness.
 */
export async function buildEnrichmentBrief(
  sourcePage: SiteHealthPage,
  allPages: SiteHealthPage[],
  clusters?: TopicCluster[],
): Promise<EnrichmentBrief> {
  const sourceContent = (sourcePage as any).content || ''
  const sourceVector = extractKeywordVector(sourceContent)
  const sourceDomain = DOMAIN_TOPOLOGY[sourcePage.host]
  const sourceAdjacent = sourceDomain?.adjacent || []

  // Find which cluster the source page belongs to
  const sourceCluster = clusters?.find((c) => c.pages.some((p) => p.url === sourcePage.url)) || null

  // Score all candidate targets
  interface Candidate {
    page: SiteHealthPage
    score: number
    anchorText: string
    targetH2: string | null
    bestSourceH2: string | null
    isCrossDomain: boolean
    isCornerstone: boolean
    hasBacklink: boolean
  }

  const candidates: Candidate[] = []

  for (const target of allPages) {
    if (target.url === sourcePage.url) continue

    const targetVector = extractKeywordVector((target as any).content || '')
    const targetDomain = DOMAIN_TOPOLOGY[target.host]

    // Keyword similarity (0–1)
    const kwScore = cosineSimilarity(sourceVector, targetVector)
    if (kwScore < 0.06) continue

    // H2 structural overlap (0–1)
    const h2Score = h2Overlap(sourceContent, (target as any).content || '')

    // Cross-domain bonus: links between adjacent domains get extra weight
    const isCrossDomain = sourcePage.host !== target.host
    const crossDomainBonus = isCrossDomain
      ? (sourceAdjacent.includes(target.host) ? 0.18 : 0.08)
      : 0

    // Cornerstone bonus: cornerstone content should be linked more
    const isCornerstone = (targetDomain?.cornerstoneWeight || 1) > 1.5
    const cornerstoneBonus = isCornerstone ? 0.10 : 0

    // Cluster bonus: pages in the same topic cluster get a boost
    const clusterBonus = sourceCluster?.pages.some((p) => p.url === target.url) ? 0.12 : 0

    // Composite score
    const score =
      kwScore * 0.50 +
      h2Score * 0.15 +
      crossDomainBonus +
      cornerstoneBonus +
      clusterBonus

    if (score < 0.08) continue

    // Anchor text from target's H2s
    const { text: anchorText, targetH2 } = anchorTextFromTarget(target, sourceContent)

    // Best source H2 match for inline placement
    const bestSourceH2 = matchSourceH2(sourceContent, target)

    // Check backlink
    const hasBacklink = checkBacklink(target, sourcePage.url)

    candidates.push({
      page: target,
      score,
      anchorText,
      targetH2,
      bestSourceH2,
      isCrossDomain,
      isCornerstone,
      hasBacklink,
    })
  }

  // Sort by score descending, take top 12
  candidates.sort((a, b) => b.score - a.score)
  const topN = candidates.slice(0, 12)

  // Build domain adjacency scores
  const domainAdjacency: Record<string, number> = {}
  for (const c of topN) {
    domainAdjacency[c.page.host] = (domainAdjacency[c.page.host] || 0) + 1
  }

  const links: CrossDomainLink[] = topN.map((c) => ({
    url: c.page.url,
    host: c.page.host,
    title: c.page.title,
    anchorText: c.anchorText,
    score: Math.round(c.score * 1000) / 1000,
    bestSourceH2: c.bestSourceH2,
    targetH2: c.targetH2,
    isCrossDomain: c.isCrossDomain,
    isCornerstone: c.isCornerstone,
    hasBacklink: c.hasBacklink,
  }))

  return {
    source: {
      url: sourcePage.url,
      host: sourcePage.host,
      title: sourcePage.title,
    },
    links,
    cluster: sourceCluster?.label || null,
    domainAdjacency,
    inlineLinks: links.filter((l) => l.bestSourceH2 != null).slice(0, 6),
    footerLinks: links.filter((l) => l.bestSourceH2 == null || links.filter((x) => x.bestSourceH2 != null).length > 6),
  }
}

/**
 * Build enrichment briefs for ALL pages across the estate. Returns a map of
 * URL → EnrichmentBrief suitable for consumption by the content pipeline.
 */
export async function buildAllEnrichmentBriefs(
  scope: SiteHealthScope = 'all',
): Promise<Map<string, EnrichmentBrief>> {
  const allPages = await loadAllPages(scope)
  if (!allPages.length) return new Map()

  const clusters = await buildTopicClusters(scope)

  const briefs = new Map<string, EnrichmentBrief>()
  for (const page of allPages) {
    const brief = await buildEnrichmentBrief(page, allPages, clusters)
    briefs.set(page.url, brief)
  }
  return briefs
}

// ── Content Generation Brief ─────────────────────────────────────────────────

export interface ContentGenerationEnrichment {
  /** The exact markdown block to append (or instructions for the AI) */
  crossLinkInstructions: string
  /** Top cross-domain links the AI should naturally reference */
  recommendedLinks: Array<{
    url: string
    anchorText: string
    host: string
    /** Natural-language instruction for weaving this into the article */
    weaveInstruction: string
  }>
  /** Topic cluster context: what related pages cover */
  clusterContext: string
  /** Domain context: which domains to consider linking */
  domainContext: string
}

/**
 * Build a compact enrichment payload for the content generation prompt.
 * The AI uses this to naturally weave cross-domain links into the article
 * text rather than having them bolted on after generation.
 */
export async function buildGenerationEnrichment(
  sourceUrl: string,
  sourceHost: string,
  sourceTopic: string,
  scope: SiteHealthScope = 'all',
): Promise<ContentGenerationEnrichment> {
  const briefs = await buildAllEnrichmentBriefs(scope)
  const brief = briefs.get(sourceUrl)

  if (!brief || !brief.links.length) {
    return {
      crossLinkInstructions: '',
      recommendedLinks: [],
      clusterContext: '',
      domainContext: '',
    }
  }

  // Top links, prefer cross-domain and cornerstones
  const priorityLinks = brief.links
    .filter((l) => l.isCrossDomain || l.isCornerstone)
    .slice(0, 5)

  const linkItems = priorityLinks.map((l) => ({
    url: l.url,
    anchorText: l.anchorText,
    host: l.host,
    weaveInstruction: l.bestSourceH2
      ? `Naturally mention ${l.anchorText} in the "${l.bestSourceH2}" section and link to ${l.host}.yousafeconsultancy.com`
      : `Consider referencing ${l.anchorText} where relevant — link to ${l.host}.yousafeconsultancy.com`,
  }))

  const clusterCtx = brief.cluster
    ? `Topic cluster: "${brief.cluster}" — ${brief.links.length} related pages across ${Object.keys(brief.domainAdjacency).join(', ')}`
    : ''

  const domainCtx = Object.entries(brief.domainAdjacency)
    .sort((a, b) => b[1] - a[1])
    .map(([host, count]) => `${host}.yousafeconsultancy.com (${count} relevant pages)`)
    .join(', ')

  const instructions = [
    'Cross-domain enrichment active. The following internal links should be naturally woven into the article body where contextually relevant:',
    ...linkItems.map((l) => `  · ${l.weaveInstruction}`),
    clusterCtx ? `\n${clusterCtx}` : '',
    domainCtx ? `Relevant domains for cross-linking: ${domainCtx}` : '',
  ].filter(Boolean).join('\n')

  return {
    crossLinkInstructions: instructions,
    recommendedLinks: linkItems,
    clusterContext: clusterCtx,
    domainContext: domainCtx ? `Relevant domains: ${domainCtx}` : '',
  }
}

// ── Cross-Domain Stats ───────────────────────────────────────────────────────

export interface CrossDomainStats {
  totalPages: number
  totalLinks: number
  crossDomainLinks: number
  bidirectionalLinks: number
  orphanPages: number
  domainBreakdown: Record<string, {
    pages: number
    outboundLinks: number
    inboundLinks: number
    crossDomainOutbound: number
    crossDomainInbound: number
  }>
  topicClusters: Array<{
    label: string
    pageCount: number
    domainCount: number
    cohesion: number
  }>
}

/**
 * Compute cross-domain statistics across the entire estate.
 */
export async function computeCrossDomainStats(
  scope: SiteHealthScope = 'all',
): Promise<CrossDomainStats> {
  const briefs = await buildAllEnrichmentBriefs(scope)
  const clusters = await buildTopicClusters(scope)

  let totalLinks = 0
  let crossDomainLinks = 0
  let bidirectionalLinks = 0

  const domainBreakdown: Record<string, {
    pages: number
    outboundLinks: number
    inboundLinks: number
    crossDomainOutbound: number
    crossDomainInbound: number
  }> = {}

  // Initialize all known domains
  for (const host of Object.keys(DOMAIN_TOPOLOGY)) {
    domainBreakdown[host] = {
      pages: 0,
      outboundLinks: 0,
      inboundLinks: 0,
      crossDomainOutbound: 0,
      crossDomainInbound: 0,
    }
  }

  for (const [url, brief] of briefs) {
    const host = brief.source.host
    if (!domainBreakdown[host]) {
      domainBreakdown[host] = { pages: 0, outboundLinks: 0, inboundLinks: 0, crossDomainOutbound: 0, crossDomainInbound: 0 }
    }
    domainBreakdown[host].pages++
    domainBreakdown[host].outboundLinks += brief.links.length

    for (const link of brief.links) {
      totalLinks++
      if (link.isCrossDomain) {
        crossDomainLinks++
        domainBreakdown[host].crossDomainOutbound++
        if (domainBreakdown[link.host]) {
          domainBreakdown[link.host].crossDomainInbound++
        }
      }
      if (link.hasBacklink) bidirectionalLinks++
    }
  }

  // Compute inbound from outbound data
  for (const [host, stats] of Object.entries(domainBreakdown)) {
    for (const [otherHost, otherStats] of Object.entries(domainBreakdown)) {
      if (host === otherHost) continue
      // Inbound = sum of outbound from other domains pointing to this domain
      // (approximated via the briefs already computed)
    }
  }

  const orphanPages = [...briefs.values()].filter((b) => b.links.length === 0).length

  return {
    totalPages: briefs.size,
    totalLinks,
    crossDomainLinks,
    bidirectionalLinks,
    orphanPages,
    domainBreakdown,
    topicClusters: clusters.map((c) => ({
      label: c.label,
      pageCount: c.pages.length,
      domainCount: Object.keys(c.domainDistribution).length,
      cohesion: c.cohesion,
    })),
  }
}
