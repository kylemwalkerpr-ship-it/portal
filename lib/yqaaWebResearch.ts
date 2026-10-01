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


const BROWSER_SOURCE_KEY = 'web:cloudflare_browser'
const MAX_BROWSER_DISCOVERY_URLS = 3

type QuickActionEnvelope = {
  success?: boolean
  result?: unknown
  meta?: { status?: number; title?: string; finalUrl?: string }
}

function parseQuickActionEnvelope(raw: string): QuickActionEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as QuickActionEnvelope
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function publicSearchUrl(query: string, domains?: string[]): string {
  const siteClause = domains?.length ? domains.slice(0, 5).map((domain) => `site:${domain}`).join(' OR ') : ''
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`${query} ${siteClause}`.trim())}`
}

export function decodeSearchResultUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) {
      const redirected = url.searchParams.get('uddg')
      return redirected?.startsWith('https://') ? redirected : null
    }
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function queryTerms(query: string): string[] {
  const stop = new Set(['what', 'when', 'where', 'which', 'with', 'from', 'that', 'this', 'these', 'those', 'latest', 'current', 'currently', 'today', 'recent', 'recently', 'news', 'update', 'updates', 'search', 'live', 'web', 'internet', 'official', 'sources', 'source', 'guide', 'guides', 'please', 'about', 'rules', 'rule', 'and', 'the', 'for', 'are', 'is', 'of', 'to', 'in', 'on'])
  return [...new Set(String(query || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{1,30}/g) || [])]
    .filter((term) => !stop.has(term))
    .slice(0, 12)
}

function markdownTitle(markdown: string, fallback: string): string {
  const frontmatter = markdown.match(/^---\s*[\s\S]{0,1600}?\btitle:\s*["']?([^\n"']+)/i)?.[1]?.trim()
  if (frontmatter) return frontmatter.slice(0, 220)
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading?.slice(0, 220) || fallback
}

function markdownExcerpt(markdown: string, query: string): string {
  const clean = markdown
    .replace(/^---[\s\S]{0,2400}?---\s*/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
  const terms = queryTerms(query)
  const blocks = clean
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length >= 45 && part.length <= 2800)
  const ranked = blocks.map((block, index) => {
    const lower = block.toLowerCase()
    const tokenScore = terms.reduce((sum, term) => sum + (lower.includes(term) ? 3 : 0), 0)
    const headingScore = /^#{1,4}\s/.test(block) ? 1 : 0
    const navPenalty = /^(menu|sign in|create account|topics|forms|tools|resources|newsroom|citizenship|green card)\b/i.test(block) ? 8 : 0
    return { block, index, score: tokenScore + headingScore - navPenalty }
  }).sort((a, b) => b.score - a.score || a.index - b.index)
  const selected = ranked.filter((item) => item.score > 0).slice(0, 5)
  const fallback = selected.length ? selected : ranked.filter((item) => item.score >= 0).slice(0, 3)
  return sanitizeYqaaPublicQuestion(
    fallback.sort((a, b) => a.index - b.index).map((item) => item.block).join('\n\n').slice(0, 3800),
  ).trim()
}

export async function researchYqaaWithCloudflareBrowser(
  query: string,
  allowedDomains?: string[],
  jurisdiction?: string | null,
  officialOnly = false,
): Promise<YqaaIndexedChunk[]> {
  let browser: BrowserQuickActionBinding | undefined
  try {
    const workerEnv = getCloudflareContext().env as CloudflareEnv & { BROWSER?: BrowserQuickActionBinding }
    browser = workerEnv.BROWSER
  } catch {
    return []
  }
  if (!browser?.quickAction) return []

  try {
    const discovery = await browser.quickAction('links', {
      url: publicSearchUrl(query, allowedDomains),
      rejectResourceTypes: ['image', 'font', 'media', 'stylesheet'],
      gotoOptions: { waitUntil: 'domcontentloaded', timeout: 12_000 },
    })
    if (!discovery.ok) return []
    const payload = parseQuickActionEnvelope(await discovery.text())
    if (!payload?.success || !Array.isArray(payload.result) || Number(payload.meta?.status || 200) >= 400) return []

    const urls: string[] = []
    for (const item of payload.result) {
      if (typeof item !== 'string') continue
      const decoded = decodeSearchResultUrl(item)
      const safe = decoded ? safeCitation(decoded, allowedDomains) : null
      if (!safe || urls.includes(safe)) continue
      urls.push(safe)
      if (urls.length >= MAX_BROWSER_DISCOVERY_URLS) break
    }
    if (!urls.length) return []

    const chunks: YqaaIndexedChunk[] = []
    for (const sourceUrl of urls) {
      try {
        const page = await browser.quickAction('markdown', {
          url: sourceUrl,
          rejectResourceTypes: ['image', 'font', 'media', 'stylesheet'],
          gotoOptions: { waitUntil: 'domcontentloaded', timeout: 15_000 },
        })
        if (!page.ok) continue
        const pagePayload = parseQuickActionEnvelope(await page.text())
        if (!pagePayload?.success || typeof pagePayload.result !== 'string' || Number(pagePayload.meta?.status || 200) >= 400) continue
        const finalUrl = safeCitation(pagePayload.meta?.finalUrl || sourceUrl, allowedDomains)
        if (!finalUrl) continue
        const body = markdownExcerpt(pagePayload.result, query)
        if (body.length < 80) continue
        chunks.push({
          id: `browser:${chunks.length + 1}`,
          chunkKey: `browser:${chunks.length + 1}`,
          sourceKey: BROWSER_SOURCE_KEY,
          title: markdownTitle(pagePayload.result, pagePayload.meta?.title || new URL(finalUrl).hostname),
          body,
          source: finalUrl,
          sourceUrl: finalUrl,
          site: officialOnly ? 'official-web' : 'public-web',
          jurisdiction: jurisdiction || undefined,
          topicTags: [],
          fetchedAt: new Date().toISOString(),
          authorityTier: officialOnly ? 5 : 3,
          score: 8,
        })
      } catch (err) {
        console.warn('[yqaaWebResearch] Browser page extraction failed', err instanceof Error ? err.message.slice(0, 160) : 'unknown')
      }
    }
    return chunks.slice(0, MAX_BROWSER_DISCOVERY_URLS)
  } catch (err) {
    console.warn('[yqaaWebResearch] Cloudflare Browser fallback failed', err instanceof Error ? err.message.slice(0, 160) : 'unknown')
    return []
  }
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
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split('.').map(Number)
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return null
    }
    if (host.includes(':')) return null
    if (allowedDomains?.length && !allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null
    if (/\/(?:account|dashboard|orders?|messages?|checkout|profile|admin)(?:\/|$)/i.test(url.pathname)) return null
    return `${url.origin}${url.pathname}`.slice(0, 500)
  } catch { return null }
}

/** Keep only public, citation-linked search findings; a model summary alone is not evidence. */
export async function researchYqaaPublicWeb(query: string, hostname?: string | null): Promise<YqaaIndexedChunk[]> {
  const scope = yqaaResearchScope(query, hostname)
  const publicQuestion = sanitizeYqaaPublicQuestion(query)
  try {
    const result = await callSystemSuperGrokWebSearch(
      `${publicQuestion}\nJurisdiction: ${scope.jurisdiction || 'unspecified'}. Cite each factual sentence with its source URL.`,
      scope.allowedDomains,
    )
    if (result.webSearchCalls >= 1) {
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
      if (chunks.length) return chunks
    }
  } catch (err) {
    console.warn('[yqaaWebResearch] xAI search unavailable; trying Cloudflare Browser fallback', err instanceof Error ? err.message.slice(0, 160) : 'unknown')
  }

  // Browser fallback: public unauthenticated discovery only. Regulated/YMYL
  // queries remain restricted to the jurisdiction's primary/official domains;
  // ordinary informational queries may use other public HTTPS sources.
  return researchYqaaWithCloudflareBrowser(publicQuestion, scope.allowedDomains, scope.jurisdiction, scope.officialOnly)
}
