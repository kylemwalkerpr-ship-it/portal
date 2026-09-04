/**
 * Phase 5 — cluster coverage + internal-link suggestions.
 * Deterministic. Reuses entities/tokens. No paid link APIs.
 */

import { tokens, jaccard } from './keywordCluster'
import { extractEntities, extractHeadings } from './topicGraph'
import { normalizeKeyword } from './keywordDiscover'

export type CoverageBreakdown = {
  keywordVariants: number
  entities: number
  subtopics: number
  questions: number
  internalLinks: number
  freshness: number
  score: number
  reasons: string[]
}

export type InternalLinkSuggestion = {
  targetUrl: string
  targetTitle: string
  relevance: number
  suggestedAnchor: string
  reason: string
}

export type CoverageCorpusPage = {
  url: string
  title: string
  bodyText?: string
  primaryKeyword?: string
}

const MD_LINK = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi

export function extractMarkdownUrls(md: string): string[] {
  const out: string[] = []
  const re = new RegExp(MD_LINK.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(String(md || '')))) out.push(normalizeUrl(m[1]))
  return [...new Set(out)]
}

export function normalizeUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '').toLowerCase()
}

/** Controlled insert — never self-link or duplicate an existing markdown URL. */
export function applyInternalLinkMarkdown(
  md: string,
  suggestion: InternalLinkSuggestion,
  currentUrl?: string,
): { content: string; applied: boolean; reason?: string } {
  const raw = String(suggestion.targetUrl || '').trim()
  if (!/^https?:\/\//i.test(raw)) return { content: md, applied: false, reason: 'invalid-url' }
  const target = normalizeUrl(raw)
  if (currentUrl && normalizeUrl(currentUrl) === target) {
    return { content: md, applied: false, reason: 'self-link' }
  }
  if (extractMarkdownUrls(md).includes(target)) {
    return { content: md, applied: false, reason: 'already-linked' }
  }
  const anchor = String(suggestion.suggestedAnchor || suggestion.targetTitle || 'related guide')
    .replace(/[\[\]]/g, '')
    .trim()
    .slice(0, 80) || 'related guide'
  const href = raw.replace(/\/+$/, '')
  const snippet = `\n\nSee [${anchor}](${href}).\n`
  return { content: String(md || '').replace(/\s*$/, '') + snippet, applied: true }
}

function presentNaturally(haystack: string, phrase: string): boolean {
  const h = normalizeKeyword(haystack)
  const p = normalizeKeyword(phrase)
  if (!p || p.length < 3) return false
  return h.includes(p)
}

export function scoreClusterCoverage(opts: {
  title: string
  bodyText: string
  clusterKeywords: string[]
  requiredEntities?: string[]
  updatedAt?: string
}): CoverageBreakdown {
  const text = `${opts.title}\n${opts.bodyText}`
  const kws = opts.clusterKeywords.map(normalizeKeyword).filter((k) => k.length >= 3)
  const unique = [...new Set(kws)]
  const hitKw = unique.filter((k) => presentNaturally(text, k)).length
  const keywordVariants = unique.length ? Math.round((hitKw / unique.length) * 100) : 0

  const ents = opts.requiredEntities?.length ? opts.requiredEntities : extractEntities(text)
  const entHit = ents.filter((e) => presentNaturally(text, e)).length
  const entities = ents.length ? Math.round((entHit / Math.min(ents.length, 12)) * 100) : 50

  const heads = extractHeadings(opts.bodyText)
  const subtopics = Math.min(100, heads.length * 18)
  const questions = /\?/.test(opts.bodyText) || /^#{1,3}\s+.*\?/m.test(opts.bodyText) || /faq/i.test(opts.bodyText)
    ? 80
    : heads.some((h) => /^(how|what|when|why|can|do)\b/i.test(h))
      ? 60
      : 20
  const links = extractMarkdownUrls(opts.bodyText).filter((u) => /yousafeconsultancy\.com/i.test(u) || u.startsWith('/'))
  const internalLinks = Math.min(100, links.length * 25)

  let freshness = 40
  if (opts.updatedAt) {
    const age = Date.now() - Date.parse(opts.updatedAt)
    if (Number.isFinite(age)) {
      const days = age / 86400000
      freshness = days < 90 ? 100 : days < 180 ? 70 : days < 365 ? 40 : 15
    }
  }

  const score = Math.round(
    keywordVariants * 0.25 +
      entities * 0.2 +
      subtopics * 0.15 +
      questions * 0.15 +
      internalLinks * 0.15 +
      freshness * 0.1,
  )
  const reasons: string[] = []
  reasons.push(`${hitKw}/${unique.length || 0} cluster variants present (not stuffed — presence once counts)`)
  reasons.push(`${heads.length} H2/H3 subtopics`)
  reasons.push(`${links.length} internal links`)
  if (questions >= 60) reasons.push('question/FAQ coverage')
  return {
    keywordVariants,
    entities: Math.min(100, entities),
    subtopics,
    questions,
    internalLinks,
    freshness,
    score: Math.max(0, Math.min(100, score)),
    reasons,
  }
}

export function suggestInternalLinks(opts: {
  currentUrl: string
  currentTitle: string
  currentBody: string
  corpus: CoverageCorpusPage[]
  limit?: number
}): InternalLinkSuggestion[] {
  const self = normalizeUrl(opts.currentUrl)
  const already = new Set(extractMarkdownUrls(opts.currentBody))
  if (self) already.add(self)
  const sourceTok = tokens(`${opts.currentTitle} ${opts.currentBody.slice(0, 4000)}`)
  const sourceEnt = extractEntities(`${opts.currentTitle}\n${opts.currentBody.slice(0, 4000)}`)
  const out: InternalLinkSuggestion[] = []

  for (const page of opts.corpus) {
    const url = normalizeUrl(page.url)
    if (!url || !/^https?:\/\//i.test(page.url)) continue
    if (url === self || already.has(url)) continue
    const targetTok = tokens(`${page.title} ${page.primaryKeyword || ''} ${String(page.bodyText || '').slice(0, 1500)}`)
    const jac = jaccard(sourceTok, targetTok)
    const sharedEnt = sourceEnt.filter((e) =>
      presentNaturally(`${page.title} ${page.bodyText || ''} ${page.primaryKeyword || ''}`, e),
    )
    const relevance = Math.round(Math.min(100, jac * 70 + Math.min(30, sharedEnt.length * 10)))
    if (relevance < 18) continue
    const suggestedAnchor =
      sharedEnt[0] ||
      page.primaryKeyword ||
      page.title.split(/[:|—–-]/)[0].trim().slice(0, 60)
    out.push({
      targetUrl: page.url.replace(/\/+$/, ''),
      targetTitle: page.title,
      relevance,
      suggestedAnchor,
      reason: sharedEnt.length
        ? `Shares ${sharedEnt.slice(0, 3).join(', ')} (${relevance}% token overlap)`
        : `Token overlap ${relevance}% with “${page.title.slice(0, 48)}”`,
    })
  }
  out.sort((a, b) => b.relevance - a.relevance)
  const seen = new Set<string>()
  const unique: InternalLinkSuggestion[] = []
  for (const s of out) {
    const k = normalizeUrl(s.targetUrl)
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(s)
    if (unique.length >= (opts.limit ?? 8)) break
  }
  return unique
}
