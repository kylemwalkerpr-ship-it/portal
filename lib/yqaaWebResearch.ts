import { explicitYqaaJurisdiction, yqaaOriginSite, type YqaaIndexedChunk } from '@/lib/yqaaKnowledgeDb'
import { sanitizeYqaaPublicQuestion } from '@/lib/jevAdvisory'
import { callSystemSuperGrokWebSearch } from '@/lib/superGrokAssistant'

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

/** Keep only public, citation-linked search findings; a model summary alone is not evidence. */
export async function researchYqaaPublicWeb(query: string, hostname?: string | null): Promise<YqaaIndexedChunk[]> {
  const scope = yqaaResearchScope(query, hostname)
  const publicQuestion = sanitizeYqaaPublicQuestion(query)
  const result = await callSystemSuperGrokWebSearch(
    `${publicQuestion}\nJurisdiction: ${scope.jurisdiction || 'unspecified'}. Cite each factual sentence with its source URL.`,
    scope.allowedDomains,
  )
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
