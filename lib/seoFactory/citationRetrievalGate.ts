/**
 * Retrieval-time citation gating.
 *
 * A source being reputable does not mean it belongs in every brief. Generic
 * intergovernmental homepages were leaking into country-specific visa briefs
 * because they were tagged ALL + broad topics such as immigration/work.
 * This module keeps those pages available only when the article actually
 * names the organisation or the narrow subject that makes it relevant.
 */

import type { CitationContext, OfficialSource } from './officialSources'

export type CitationLike = Pick<OfficialSource, 'url'> & Partial<Pick<OfficialSource, 'title'>>

type RetrievalRule = {
  host: string
  /** Only root/homepage-like URLs are gated. Deep claim-specific pages stay eligible. */
  homepage: (path: string) => boolean
  require: RegExp
}

const ROOTISH = (path: string) => path === '/' || path === ''

const RETRIEVAL_RULES: RetrievalRule[] = [
  {
    host: 'iom.int',
    homepage: ROOTISH,
    require: /\b(?:iom|international organi[sz]ation for migration|migration governance|humanitarian migration|forced displacement|resettlement)\b/i,
  },
  {
    host: 'unhcr.org',
    homepage: ROOTISH,
    require: /\b(?:unhcr|refugee(?:s)?|asylum|refoulement|forced displacement|displaced (?:people|persons?))\b/i,
  },
  {
    host: 'ilo.org',
    homepage: ROOTISH,
    require: /\b(?:ilo|international labou?r organi[sz]ation|labou?r standards?|workers?' rights|workplace rights|minimum wage|employment standards?)\b/i,
  },
  {
    host: 'oecd.org',
    homepage: ROOTISH,
    require: /\b(?:oecd|organi[sz]ation for economic co-?operation|education at a glance|comparative education|international education data)\b/i,
  },
  {
    host: 'who.int',
    homepage: ROOTISH,
    require: /\b(?:who|world health organi[sz]ation|public health|vaccin(?:e|ation)|medical exam|health requirement)\b/i,
  },
  {
    host: 'ielts.org',
    homepage: ROOTISH,
    require: /\b(?:ielts|english language test|language test|language score)\b/i,
  },
  {
    host: 'ets.org',
    homepage: (path) => /^\/(?:toefl(?:\.html)?|)?\/?$/i.test(path),
    require: /\b(?:toefl|ets|english language test|language test)\b/i,
  },
  {
    host: 'pearsonpte.com',
    homepage: ROOTISH,
    require: /\b(?:pte(?: academic)?|pearson test of english|english language test|language test)\b/i,
  },
]

function hostAndPath(url: string): { host: string; path: string } | null {
  try {
    const u = new URL(String(url || '').trim())
    if (!/^https?:$/i.test(u.protocol)) return null
    return {
      host: u.hostname.toLowerCase().replace(/^www\./, ''),
      path: u.pathname || '/',
    }
  } catch {
    return null
  }
}

function retrievalBlob(ctx?: CitationContext | null, title?: string): string {
  return [
    title || '',
    ctx?.topic || '',
    ...(ctx?.keywords || []),
    ctx?.body ? String(ctx.body).slice(0, 5000) : '',
  ]
    .filter(Boolean)
    .join(' ')
}

function matchingRule(url: string): RetrievalRule | null {
  const parsed = hostAndPath(url)
  if (!parsed) return null
  for (const rule of RETRIEVAL_RULES) {
    if ((parsed.host === rule.host || parsed.host.endsWith(`.${rule.host}`)) && rule.homepage(parsed.path)) {
      return rule
    }
  }
  return null
}

/**
 * Reputable-but-generic homepages must earn retrieval by claim fit. Everything
 * else is left to the existing authority/relevance/live-link policies.
 */
export function isRetrievalGatedCitationAllowed(
  url: string,
  ctx?: CitationContext | null,
  title?: string,
): boolean {
  const rule = matchingRule(url)
  if (!rule) return true
  const blob = retrievalBlob(ctx, title)
  return Boolean(blob.trim() && rule.require.test(blob))
}

export function filterRetrievalGatedSources<T extends CitationLike>(
  sources: T[],
  ctx?: CitationContext | null,
): T[] {
  return sources.filter((source) => isRetrievalGatedCitationAllowed(source.url, ctx, source.title))
}

/**
 * URLs that are factual identity and must survive editorial cycle loss.
 * The only URLs deliberately *not* frozen are generic globally scoped
 * homepages covered by RETRIEVAL_RULES. If they are irrelevant, Throughline
 * or masked denoise may delete them; claim-specific deep URLs remain frozen.
 */
export function isCycleProtectedUrl(url: string): boolean {
  const parsed = hostAndPath(url)
  if (!parsed) return false
  return matchingRule(url) === null
}

const URL_RE = /https?:\/\/[^\s)\]>'"`]+/gi

export function cycleProtectedUrls(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of String(text || '').match(URL_RE) || []) {
    const url = raw.replace(/[.,;:]+$/, '').toLowerCase()
    if (!isCycleProtectedUrl(url) || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

export function isDisposableGenericHomepage(url: string): boolean {
  return matchingRule(url) !== null
}
