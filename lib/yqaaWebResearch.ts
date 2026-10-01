import { explicitYqaaJurisdiction, yqaaOriginSite, type YqaaIndexedChunk } from '@/lib/yqaaKnowledgeDb'
import { sanitizeYqaaPublicQuestion } from '@/lib/jevAdvisory'
import { callSystemSuperGrokWebSearch } from '@/lib/superGrokAssistant'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const OFFICIAL_DOMAINS: Record<string, string[]> = {
  Australia: ['gov.au', 'legislation.gov.au'],
  Canada: ['canada.ca', 'justice.gc.ca', 'cmhc-schl.gc.ca'],
  'United Kingdom': ['gov.uk', 'legislation.gov.uk'],
  'United States': ['uscis.gov', 'dhs.gov', 'ice.gov', 'travel.state.gov', 'dol.gov', 'hud.gov', 'usa.gov'],
}
const ORIGIN_JURISDICTION: Record<string, string> = {
  australia: 'Australia', canada: 'Canada', uk: 'United Kingdom', usa: 'United States',
}

export function yqaaNeedsFreshWebResearch(query: string): boolean {
  return /\b(?:latest|current|currently|today|recent|recently|newest|up[- ]to[- ]date|as of|right now|search (?:the )?web|search online|look (?:it )?up|check (?:the )?web|verify online)\b/i.test(String(query || ''))
}

function scopedOfficialDomains(query: string, jurisdiction: string | null): string[] | undefined {
  if (!jurisdiction) return ['usa.gov', 'canada.ca', 'gov.uk', 'gov.au']
  if (jurisdiction === 'United States') {
    if (/\b(?:OPT|optional practical training|f-?1|student visa|immigrat|visa|work permit|employment authorization|ead)\b/i.test(query)) {
      return ['uscis.gov', 'dhs.gov', 'ice.gov', 'travel.state.gov', 'dol.gov']
    }
    if (/\b(?:housing|tenant|landlord|evict|rent)\b/i.test(query)) return ['hud.gov', 'usa.gov']
  }
  return OFFICIAL_DOMAINS[jurisdiction]?.slice(0, 5)
}

export function yqaaResearchScope(query: string, hostname?: string | null) {
  const jurisdiction = explicitYqaaJurisdiction(query) || ORIGIN_JURISDICTION[yqaaOriginSite(hostname) || ''] || null
  const regulated = /\b(legal|law|visa|immigrat|permit|housing|tenant|landlord|evict|regulat|rule|requirement|eligib|tax|health|medical|current|latest|today)\w*/i.test(query)
  return {
    jurisdiction,
    officialOnly: regulated,
    allowedDomains: regulated ? scopedOfficialDomains(query, jurisdiction) : undefined,
  }
}

function safeCitation(raw: string, allowedDomains?: string[]): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
    const host = url.hostname.toLowerCase()
    if (allowedDomains && !allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null
    if (/\/(?:account|dashboard|orders?|messages?|checkout|profile|admin)(?:\/|$)/i.test(url.pathname)) return null
    return `${url.origin}${url.pathname}`.slice(0, 500)
  } catch { return null }
}

type BrowserActionEnvelope<T> = {
  success?: boolean
  result?: T
  meta?: { status?: number; title?: string; finalUrl?: string }
}

function browserBinding(): BrowserQuickActionBinding | null {
  try {
    return (getCloudflareContext().env as CloudflareEnv & { BROWSER?: BrowserQuickActionBinding }).BROWSER || null
  } catch {
    return null
  }
}

async function browserAction<T>(
  browser: BrowserQuickActionBinding,
  action: 'links' | 'markdown',
  options: Record<string, unknown>,
): Promise<BrowserActionEnvelope<T> | null> {
  const response = await browser.quickAction(action, options)
  const declared = Number(response.headers.get('content-length') || 0)
  if (!response.ok || declared > 750_000) return null
  const raw = await response.text()
  if (raw.length > 750_000) return null
  try {
    const parsed = JSON.parse(raw) as BrowserActionEnvelope<T>
    return parsed?.success === false ? null : parsed
  } catch {
    return null
  }
}

function duckDuckGoTarget(raw: string): string {
  try {
    const url = new URL(raw)
    if ((url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) && url.pathname === '/l/') {
      return url.searchParams.get('uddg') || raw
    }
    return raw
  } catch {
    return raw
  }
}

function searchTerms(query: string): string[] {
  const stop = new Set(['what', 'when', 'where', 'which', 'with', 'from', 'that', 'this', 'these', 'those', 'latest', 'current', 'today', 'news', 'updates', 'update', 'rules', 'guides', 'guide', 'search', 'live', 'web', 'official', 'sources', 'source', 'students', 'student'])
  return [...new Set(String(query || '').toLowerCase().match(/[a-z0-9-]{3,}/g) || [])]
    .filter((term) => !stop.has(term))
    .slice(0, 12)
}

function markdownEvidence(markdown: string, query: string): { title?: string; body: string } {
  const title = markdown.match(/^---[\s\S]*?^title:\s*["']?([^\n"']+)/m)?.[1]?.trim()
  const withoutFrontmatter = markdown.replace(/^---\s*[\s\S]*?\n---\s*/m, '')
  const cleanLines = withoutFrontmatter
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .split(/\n+/)
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s*/, '').replace(/[|*_`>]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 35 && line.length <= 1600)
  const terms = searchTerms(query)
  const ranked = cleanLines.map((line, index) => {
    const lower = line.toLowerCase()
    let score = 0
    for (const term of terms) if (lower.includes(term)) score += term === 'opt' || term === 'f-1' ? 4 : 1
    if (/last (?:reviewed|updated)|effective|optional practical training|stem opt|f-1/i.test(line)) score += 2
    return { line, index, score }
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 6)

  const indexes = new Set<number>()
  for (const entry of ranked) {
    indexes.add(entry.index)
    if (entry.index > 0) indexes.add(entry.index - 1)
    if (entry.index + 1 < cleanLines.length) indexes.add(entry.index + 1)
  }
  let body = [...indexes].sort((a, b) => a - b).map((index) => cleanLines[index]).join('\n')
  if (body.length < 120) body = cleanLines.slice(0, 12).join('\n')
  return { title, body: body.slice(0, 4200) }
}

async function researchViaCloudflareBrowser(
  query: string,
  scope: ReturnType<typeof yqaaResearchScope>,
): Promise<YqaaIndexedChunk[]> {
  const browser = browserBinding()
  if (!browser) return []
  const publicQuestion = sanitizeYqaaPublicQuestion(query)
  const domainClause = scope.allowedDomains?.length
    ? ` (${scope.allowedDomains.slice(0, 5).map((domain) => `site:${domain}`).join(' OR ')})`
    : ''
  const discoveryUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${publicQuestion}${domainClause}`)}`
  const links = await browserAction<string[]>(browser, 'links', {
    url: discoveryUrl,
    rejectResourceTypes: ['image', 'font', 'media', 'stylesheet'],
    gotoOptions: { waitUntil: 'domcontentloaded', timeout: 12_000 },
  })
  const candidates: string[] = []
  for (const raw of Array.isArray(links?.result) ? links!.result! : []) {
    const sourceUrl = safeCitation(duckDuckGoTarget(raw), scope.allowedDomains)
    if (!sourceUrl || candidates.includes(sourceUrl)) continue
    candidates.push(sourceUrl)
    if (candidates.length >= 3) break
  }
  const chunks: YqaaIndexedChunk[] = []
  for (const sourceUrl of candidates) {
    try {
      const page = await browserAction<string>(browser, 'markdown', {
        url: sourceUrl,
        rejectResourceTypes: ['image', 'font', 'media', 'stylesheet'],
        gotoOptions: { waitUntil: 'domcontentloaded', timeout: 15_000 },
      })
      if (typeof page?.result !== 'string' || page.result.length < 80) continue
      const extracted = markdownEvidence(page.result, publicQuestion)
      if (extracted.body.length < 80) continue
      chunks.push({
        id: `browser-web:${chunks.length + 1}`,
        chunkKey: `browser-web:${chunks.length + 1}`,
        sourceKey: 'cloudflare:browser_search',
        title: extracted.title || page.meta?.title || new URL(sourceUrl).hostname,
        body: extracted.body,
        source: sourceUrl,
        sourceUrl,
        site: 'official-web',
        jurisdiction: scope.jurisdiction || undefined,
        topicTags: [],
        fetchedAt: new Date().toISOString(),
        authorityTier: scope.officialOnly ? 5 : 3,
        score: 8,
      })
    } catch (err) {
      console.warn('[system-assistant] Browser research page fetch failed', err instanceof Error ? err.message : 'unknown')
    }
  }
  return chunks
}

function xaiEvidenceChunks(
  result: Awaited<ReturnType<typeof callSystemSuperGrokWebSearch>>,
  scope: ReturnType<typeof yqaaResearchScope>,
): YqaaIndexedChunk[] {
  if (result.webSearchCalls < 1) return []
  const cited = new Set(result.citations.map((url) => safeCitation(url, scope.allowedDomains)).filter(Boolean))
  const chunks: YqaaIndexedChunk[] = []
  const addChunk = (rawUrl: string, rawExcerpt: string, rawTitle?: string) => {
    const sourceUrl = safeCitation(rawUrl, scope.allowedDomains)
    if (!sourceUrl || !cited.has(sourceUrl) || chunks.some((chunk) => chunk.sourceUrl === sourceUrl)) return
    const excerpt = sanitizeYqaaPublicQuestion(rawExcerpt.replace(/\[\[\d+\]\]\(https:\/\/[^\s)]+\)/g, '')).trim()
    if (excerpt.length < 25) return
    chunks.push({
      id: `web:${chunks.length + 1}`, chunkKey: `web:${chunks.length + 1}`, sourceKey: 'xai:web_search',
      title: String(rawTitle || '').trim() || new URL(sourceUrl).hostname, body: excerpt, source: sourceUrl, sourceUrl,
      site: 'official-web', jurisdiction: scope.jurisdiction || undefined, topicTags: [],
      fetchedAt: new Date().toISOString(), authorityTier: scope.officialOnly ? 5 : 3, score: 8,
    })
  }
  for (const source of result.sources || []) {
    if (chunks.length >= 3) break
    addChunk(source.url, source.snippet || '', source.title)
  }
  const links = /\[\[\d+\]\]\((https:\/\/[^\s)]+)\)/g
  for (const match of result.text.matchAll(links)) {
    if (chunks.length >= 3) break
    const before = result.text.slice(Math.max(0, match.index! - 750), match.index!)
    const sentence = before.split(/(?<=[.!?])\s+/).at(-1)?.trim() || ''
    addChunk(match[1], sentence)
  }
  return chunks
}

/** Keep only public, citation-linked search findings; a model summary alone is not evidence. */
export async function researchYqaaPublicWeb(query: string, hostname?: string | null): Promise<YqaaIndexedChunk[]> {
  const scope = yqaaResearchScope(query, hostname)
  const publicQuestion = sanitizeYqaaPublicQuestion(query)

  // For regulated/current/YMYL research, deterministic official-source browser
  // retrieval is both safer and faster than asking a model to decide whether
  // to invoke a provider-side search tool.
  if (scope.officialOnly) {
    try {
      const browserEvidence = await researchViaCloudflareBrowser(query, scope)
      if (browserEvidence.length) return browserEvidence
    } catch (err) {
      console.warn('[system-assistant] Cloudflare Browser research failed', err instanceof Error ? err.message : 'unknown')
    }
  }

  try {
    const result = await callSystemSuperGrokWebSearch(
      `${publicQuestion}\nJurisdiction: ${scope.jurisdiction || 'unspecified'}. Cite each factual sentence with its source URL.`,
      scope.allowedDomains,
    )
    const chunks = xaiEvidenceChunks(result, scope)
    if (chunks.length) return chunks
  } catch (err) {
    console.warn('[system-assistant] xAI web research unavailable', err instanceof Error ? err.message : 'unknown')
  }

  // Non-YMYL and provider-search failure both get the same bounded browser
  // fallback. safeCitation() still rejects credentialed/private URLs.
  try {
    return await researchViaCloudflareBrowser(query, scope)
  } catch (err) {
    console.warn('[system-assistant] Cloudflare Browser fallback unavailable', err instanceof Error ? err.message : 'unknown')
    return []
  }
}
