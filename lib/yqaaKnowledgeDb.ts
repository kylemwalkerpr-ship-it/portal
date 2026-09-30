import { selectYqaaKnowledge, shouldUseDeepNetworkKnowledge, type KnowledgeChunk } from '@/lib/messengerSiteKnowledge'
import { getSupabaseAdminClient, isServiceRoleAchieved } from '@/lib/supabase'

export type YqaaIndexedChunk = KnowledgeChunk & {
  chunkKey: string
  sourceKey: string
  jurisdiction?: string
  topicTags: string[]
  fetchedAt?: string
  lastmod?: string
  authorityTier: number
  sectionTitle?: string
  score: number
}

export type YqaaEvidencePack = {
  chunks: YqaaIndexedChunk[]
  source: 'database' | 'bundled' | 'database+bundled'
  retrievalConfidence: number
  freshEnough: boolean
  jurisdictions: string[]
  sites: string[]
}

type SearchRow = {
  chunk_key?: unknown
  source_key?: unknown
  site?: unknown
  repository?: unknown
  source_url?: unknown
  title?: unknown
  section_title?: unknown
  jurisdiction?: unknown
  body?: unknown
  topic_tags?: unknown
  fetched_at?: unknown
  lastmod?: unknown
  authority_tier?: unknown
  score?: unknown
}

const SITE_FOR_HOST: Record<string, string> = {
  'yousafeconsultancy.com': 'main',
  'www.yousafeconsultancy.com': 'main',
  'usa.yousafeconsultancy.com': 'usa',
  'ca.yousafeconsultancy.com': 'canada',
  'uk.yousafeconsultancy.com': 'uk',
  'au.yousafeconsultancy.com': 'australia',
  'legal.yousafeconsultancy.com': 'caseworks',
  'market.yousafeconsultancy.com': 'market',
  'portal.yousafeconsultancy.com': 'portal',
  'support.yousafeconsultancy.com': 'support',
}

export function yqaaOriginSite(hostname?: string | null): string | null {
  return SITE_FOR_HOST[String(hostname || '').toLowerCase().replace(/:\d+$/, '')] || null
}

export function explicitYqaaJurisdiction(query: string): string | null {
  const value = String(query || '')
  if (/\b(australia|australian|subclass\s*(?:500|485)|home affairs)\b/i.test(value)) return 'Australia'
  if (/\b(canada|canadian|ircc|pgwp|study permit)\b/i.test(value)) return 'Canada'
  if (/\b(united kingdom|britain|british|ukvi|\buk\b)\b/i.test(value)) return 'United Kingdom'
  if (/\b(united states|america|american|uscis|\busa\b|\bu\.?s\.?\b|f-?1)\b/i.test(value)) return 'United States'
  return null
}

function stringValue(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function rowToChunk(row: SearchRow): YqaaIndexedChunk | null {
  const body = stringValue(row.body, 5000)
  const source = stringValue(row.source_url, 1600)
  const publicSourceUrl = /^https:\/\//i.test(source) ? source : undefined
  const curatedCoreSource = /^repo:\/\/kylemwalkerpr-ship-it\/portal\/content\/messenger-kb\//i.test(source)
  if (!body || (!publicSourceUrl && !curatedCoreSource)) return null
  const chunkKey = stringValue(row.chunk_key, 240)
  const sourceKey = stringValue(row.source_key, 240)
  const title = stringValue(row.title, 500) || stringValue(row.section_title, 500) || 'YouSafe knowledge'
  const score = Number(row.score || 0)
  const authorityTier = Math.max(1, Math.min(5, Number(row.authority_tier || 3)))
  return {
    id: chunkKey || sourceKey || source,
    chunkKey,
    sourceKey,
    title,
    sectionTitle: stringValue(row.section_title, 500) || undefined,
    body,
    source,
    site: stringValue(row.site, 80) || undefined,
    sourceUrl: publicSourceUrl,
    repository: stringValue(row.repository, 240) || undefined,
    jurisdiction: stringValue(row.jurisdiction, 120) || undefined,
    topicTags: Array.isArray(row.topic_tags) ? row.topic_tags.map((tag) => stringValue(tag, 80)).filter(Boolean) : [],
    fetchedAt: stringValue(row.fetched_at, 80) || undefined,
    lastmod: stringValue(row.lastmod, 80) || undefined,
    authorityTier,
    score: Number.isFinite(score) ? score : 0,
  }
}

function freshnessWeight(value?: string): number {
  if (!value) return 0.65
  const when = Date.parse(value)
  if (!Number.isFinite(when)) return 0.65
  const days = Math.max(0, (Date.now() - when) / 86_400_000)
  if (days <= 2) return 1
  if (days <= 14) return 0.95
  if (days <= 45) return 0.85
  if (days <= 120) return 0.72
  return 0.55
}

export function evidenceConfidence(chunks: YqaaIndexedChunk[]): number {
  if (!chunks.length) return 0
  const top = chunks.slice(0, 8)
  const scoreSignal = Math.min(1, Math.max(0, top[0]?.score || 0) / 8)
  const breadth = Math.min(1, new Set(top.map((chunk) => chunk.sourceUrl || chunk.source)).size / 4)
  const authority = top.reduce((sum, chunk) => sum + chunk.authorityTier / 5, 0) / top.length
  const freshness = top.reduce((sum, chunk) => sum + freshnessWeight(chunk.fetchedAt), 0) / top.length
  return Math.max(0, Math.min(1, 0.46 * scoreSignal + 0.2 * breadth + 0.2 * authority + 0.14 * freshness))
}

export async function searchYqaaKnowledgeIndex(db: any, opts: {
  query: string
  hostname?: string | null
  limit?: number
}): Promise<YqaaEvidencePack> {
  const originSite = yqaaOriginSite(opts.hostname)
  const jurisdiction = explicitYqaaJurisdiction(opts.query)
  const { data, error } = await db.rpc('search_yqaa_knowledge', {
    p_query: String(opts.query || '').slice(0, 2000),
    p_origin_site: originSite,
    p_jurisdiction: jurisdiction,
    p_limit: Math.max(1, Math.min(24, opts.limit || 12)),
  })
  if (error) throw error
  const chunks = (Array.isArray(data) ? data : []).map(rowToChunk).filter(Boolean) as YqaaIndexedChunk[]
  const retrievalConfidence = evidenceConfidence(chunks)
  return {
    chunks,
    source: 'database',
    retrievalConfidence,
    freshEnough: chunks.length > 0 && chunks.slice(0, 6).every((chunk) => freshnessWeight(chunk.fetchedAt) >= 0.72),
    jurisdictions: [...new Set(chunks.map((chunk) => chunk.jurisdiction).filter(Boolean))] as string[],
    sites: [...new Set(chunks.map((chunk) => chunk.site).filter(Boolean))] as string[],
  }
}



function bundledToIndexed(chunk: KnowledgeChunk, index: number): YqaaIndexedChunk {
  const score = Number(chunk.score || 0)
  return {
    ...chunk,
    chunkKey: `bundled:${String(chunk.id || index)}`,
    sourceKey: `bundled:${String(chunk.source || chunk.id || index)}`,
    jurisdiction: undefined,
    topicTags: [],
    fetchedAt: undefined,
    lastmod: undefined,
    authorityTier: /network-authority|policy|brand-identity/i.test(`${chunk.id} ${chunk.source}`) ? 5 : 3,
    score: Number.isFinite(score) ? score : 0,
  }
}

function bundledConfidence(chunks: YqaaIndexedChunk[]): number {
  if (!chunks.length) return 0
  const positive = chunks.filter((chunk) => chunk.score > 0).length
  const strong = chunks.filter((chunk) => chunk.score >= 4).length
  const breadth = new Set(chunks.map((chunk) => chunk.source)).size
  return Math.max(
    0,
    Math.min(
      0.74,
      0.28 +
        Math.min(0.22, positive * 0.045) +
        Math.min(0.14, strong * 0.05) +
        Math.min(0.1, breadth * 0.02),
    ),
  )
}

function mergeEvidence(
  indexed: YqaaIndexedChunk[],
  bundled: YqaaIndexedChunk[],
  limit: number,
): YqaaIndexedChunk[] {
  const out: YqaaIndexedChunk[] = []
  const seen = new Set<string>()
  const add = (chunk: YqaaIndexedChunk) => {
    const key = chunk.sourceUrl
      ? `url:${chunk.sourceUrl}:${chunk.sectionTitle || chunk.title}`
      : `id:${chunk.id}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(chunk)
  }

  indexed.forEach(add)

  // Always preserve a small canonical guardrail pack even when the DB is rich.
  for (const chunk of bundled) {
    if (
      /network-authority|brand-identity|polic|platform|faq/i.test(
        `${chunk.id} ${chunk.title} ${chunk.source}`,
      )
    ) {
      add(chunk)
    }
  }

  // If indexed evidence is sparse, fill remaining capacity from the ranked bundle.
  if (indexed.length < Math.min(5, limit)) {
    bundled.forEach(add)
  }

  return out.slice(0, Math.max(1, Math.min(24, limit)))
}

export async function loadYqaaEvidence(opts: {
  query: string
  hostname?: string | null
  pageContext?: string | null
  limit?: number
  db?: any
}): Promise<YqaaEvidencePack> {
  const limit = Math.max(1, Math.min(24, opts.limit || 12))
  const deep = shouldUseDeepNetworkKnowledge(opts.query)
  const bundled = selectYqaaKnowledge({
    query: opts.query,
    deep,
    hostname: opts.hostname,
    pageContext: opts.pageContext,
    limit,
  }).map(bundledToIndexed)

  let indexed: YqaaEvidencePack | null = null
  try {
    const db = opts.db || (isServiceRoleAchieved() ? getSupabaseAdminClient() : null)
    if (db) {
      indexed = await searchYqaaKnowledgeIndex(db, {
        query: opts.query,
        hostname: opts.hostname,
        limit,
      })
    }
  } catch (error) {
    console.warn(
      '[yqaaKnowledgeDb] database evidence unavailable',
      error instanceof Error ? error.message.slice(0, 180) : 'unknown',
    )
  }

  if (!indexed?.chunks.length) {
    return {
      chunks: bundled,
      source: 'bundled',
      retrievalConfidence: bundledConfidence(bundled),
      freshEnough: false,
      jurisdictions: [],
      sites: [...new Set(bundled.map((chunk) => chunk.site).filter(Boolean))] as string[],
    }
  }

  const chunks = mergeEvidence(indexed.chunks, bundled, limit)
  return {
    chunks,
    source: bundled.length ? 'database+bundled' : 'database',
    retrievalConfidence: Math.max(indexed.retrievalConfidence, evidenceConfidence(chunks)),
    freshEnough: indexed.freshEnough,
    jurisdictions: indexed.jurisdictions,
    sites: [...new Set(chunks.map((chunk) => chunk.site).filter(Boolean))] as string[],
  }
}
