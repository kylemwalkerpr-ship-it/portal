/**
 * Citation policy — the only contract Content Studio may use.
 *
 * Research, draft, scaffold, remediator, quality, audit, and ship must call
 * these helpers. Do not inject or gate on a raw `.gov` / `.edu` regex, and
 * do not invent URLs. Same-region immigration / school authorities are
 * always valid on this estate.
 */

import {
  inferArticleClaim,
  isCitationRelevant,
  isCreamSource,
  sourcesForBrief,
  type CitationContext,
  type OfficialSource,
} from './officialSources'
import { isRetrievalGatedCitationAllowed } from './citationRetrievalGate'

/**
 * Public TLDs we will recover when a sentence word has been glued onto the
 * host (`yousafeconsultancy.Inthiscasecom` → `yousafeconsultancy.com`).
 * Longer compound TLDs MUST precede their suffixes so `co.uk` wins over `co`.
 */
const GLUED_TLD_ALT =
  'co\\.uk|com\\.au|gov\\.uk|gov\\.au|gc\\.ca|co\\.nz|gov\\.sg|gov\\.ca|co\\.za|gov\\.us|com|org|net|edu|gov|io|co|us|uk|au|ca|info|biz|me|app|dev|int|mil'

const HOST_OK_RE = /^[a-z0-9.-]+\.[a-z]{2,}$/i
const TLD_THEN_CAP_RE = new RegExp(`^(.*\\.(?:${GLUED_TLD_ALT}))([A-Z][A-Za-z].*)$`)
const LABEL_GLUED_TLD_RE = new RegExp(`^([A-Z][A-Za-z]*?)(${GLUED_TLD_ALT})$`, 'i')
const TLD_TRUNC_RE = new RegExp(`^([a-z0-9.-]+\\.(?:${GLUED_TLD_ALT}))(.*)$`, 'i')

export interface SanitizedExtractedUrl {
  url: string | null
  leftover: string
}

/**
 * Recover a real URL when markdown/prose was glued onto the hostname.
 *
 * Live defect: `https://market.yousafeconsultancy.Inthiscasecom/gigs/…`
 * was extracted as one token because `/https?:\/\/[^\s)<>\]"'`]+/` swallows
 * camelCase words after `.com`. Split the host when a TLD is immediately
 * followed by a capital letter (Inthiscase / Asaresult / Onreview), require
 * the recovered hostname to match `/^[a-z0-9.-]+\.[a-z]{2,}$/i`, and otherwise
 * insert a dot before the glued word or truncate at the real TLD.
 */
export function sanitizeExtractedUrl(raw: string): SanitizedExtractedUrl {
  const original = String(raw || '').trim()
  if (!original) return { url: null, leftover: '' }
  const stripped = original.replace(/[.,);]+$/, '')
  const schemeMatch = stripped.match(/^(https?:\/\/)(.+)$/i)
  if (!schemeMatch) return { url: null, leftover: original }

  const scheme = schemeMatch[1]
  const rest = schemeMatch[2]
  const pathAt = rest.search(/[/?#]/)
  const authorityEnd = pathAt >= 0 ? pathAt : rest.length
  let authority = rest.slice(0, authorityEnd)
  const path = rest.slice(authorityEnd)

  let userinfo = ''
  const at = authority.lastIndexOf('@')
  if (at >= 0) {
    userinfo = authority.slice(0, at + 1)
    authority = authority.slice(at + 1)
  }

  let port = ''
  if (!authority.startsWith('[')) {
    const colon = authority.lastIndexOf(':')
    if (colon > 0 && /^\d+$/.test(authority.slice(colon + 1))) {
      port = authority.slice(colon)
      authority = authority.slice(0, colon)
    }
  }

  const split = splitGluedHostname(authority)
  let host = split.host
  const leftover = split.leftover

  host = host.replace(/\.+$/, '')
  const hostLower = host.toLowerCase()
  if (!HOST_OK_RE.test(hostLower)) {
    return { url: null, leftover: leftover || original }
  }

  return {
    url: `${scheme}${userinfo}${hostLower}${port}${path}`,
    leftover,
  }
}

function splitGluedHostname(host: string): { host: string; leftover: string } {
  let h = host
  let leftover = ''

  const tldThenCap = h.match(TLD_THEN_CAP_RE)
  if (tldThenCap) {
    h = tldThenCap[1]
    leftover = tldThenCap[2]
  }

  const lastDot = h.lastIndexOf('.')
  if (lastDot > 0) {
    const last = h.slice(lastDot + 1)
    const glued = last.match(LABEL_GLUED_TLD_RE)
    if (glued && glued[1]) {
      h = `${h.slice(0, lastDot)}.${glued[2].toLowerCase()}`
      leftover = leftover || glued[1]
    }
  }

  if (!HOST_OK_RE.test(h.toLowerCase())) {
    const insert = h.match(/^([a-z0-9.-]*[a-z0-9])([A-Z][A-Za-z].*)$/)
    if (insert) {
      leftover = leftover || insert[2]
      h = insert[1]
    }
  }

  if (!HOST_OK_RE.test(h.toLowerCase())) {
    const trunc = h.match(TLD_TRUNC_RE)
    if (trunc && HOST_OK_RE.test(trunc[1])) {
      leftover = leftover || trunc[2] || h.slice(trunc[1].length)
      h = trunc[1]
    }
  }

  return { host: h, leftover }
}

export function extractHttpUrls(content: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /https?:\/\/[^\s)<>\]"'`]+/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(String(content || ''))) !== null) {
    const { url } = sanitizeExtractedUrl(m[0])
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

export function unglueDocumentUrls(content: string): { content: string; changed: number } {
  const src = String(content || '')
  if (!src) return { content: src, changed: 0 }
  let changed = 0
  const rewrite = (raw: string): string => {
    const recovered = sanitizeExtractedUrl(raw)
    if (recovered.url && recovered.url !== raw) {
      changed++
      return recovered.url
    }
    return raw
  }
  let out = src.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (whole, text: string, url: string) => {
    const next = rewrite(url)
    return next === url ? whole : `[${text}](${next})`
  })
  out = out.replace(/https?:\/\/[^\s)<>\]"'`]+/g, (url: string, offset: number) => {
    if (offset >= 2 && out.slice(offset - 2, offset) === '](') return url
    return rewrite(url)
  })
  return { content: out, changed }
}

export function buildCitationContext(opts: {
  region?: string | null
  topic?: string | null
  title?: string | null
  primaryKeyword?: string | null
  keywords?: string[]
  body?: string | null
}): CitationContext {
  const keywords = [opts.primaryKeyword, ...(opts.keywords || [])]
    .map((k) => String(k || '').trim())
    .filter(Boolean)
  const topic = String(opts.topic || opts.primaryKeyword || opts.title || inferArticleClaim(opts.body || '') || '')
    .trim() || undefined
  return {
    region: opts.region || undefined,
    topic,
    keywords,
    body: opts.body ? String(opts.body).slice(0, 4000) : undefined,
  }
}

export function citationContextForContent(
  content: string,
  opts?: {
    region?: string | null
    topic?: string | null
    title?: string | null
    primaryKeyword?: string | null
    keywords?: string[]
  },
): CitationContext {
  return buildCitationContext({
    region: opts?.region,
    topic: opts?.topic || opts?.primaryKeyword || opts?.title,
    title: opts?.title,
    primaryKeyword: opts?.primaryKeyword,
    keywords: opts?.keywords,
    body: content,
  })
}

/** True when the draft already cites a retrieval-approved official URL for this brief. */
export function articleHasOfficialCitation(content: string, ctx?: CitationContext | null): boolean {
  for (const url of extractHttpUrls(content)) {
    if (
      isCreamSource(url, ctx) &&
      isCitationRelevant(url, ctx) &&
      isRetrievalGatedCitationAllowed(url, ctx)
    ) return true
  }
  return false
}

/** Topic-ranked official pages that are allowed on this brief. Never invents. */
export function pickOfficialCitations(ctx?: CitationContext | null, limit = 2): OfficialSource[] {
  return sourcesForBrief(ctx)
    .filter((s) =>
      isCreamSource(s.url, ctx) &&
      isCitationRelevant(s.url, ctx) &&
      isRetrievalGatedCitationAllowed(s.url, ctx, s.title),
    )
    .slice(0, Math.max(1, limit))
}

function injectOfficialSources(content: string, sources: OfficialSource[]): string {
  const missing = sources.filter((s) => s.url && !content.includes(s.url))
  if (!missing.length) return content
  const lines = missing.map((s) => `- [${s.title}](${s.url})`).join('\n')
  const heading = content.search(/^##\s+(official sources|sources|references)\s*$/im)
  if (heading >= 0) {
    const nl = content.indexOf('\n', heading)
    const at = nl >= 0 ? nl + 1 : heading
    return `${content.slice(0, at)}\n${lines}\n${content.slice(at)}`
  }
  return `${content.trimEnd()}\n\n## Official sources\n\n${lines}\n`
}

export function applyCitationPolicy(
  content: string,
  ctx?: CitationContext | null,
): { content: string; applied: string[] } {
  const applied: string[] = []
  const next = String(content || '')
  if (articleHasOfficialCitation(next, ctx)) return { content: next, applied }
  const picks = pickOfficialCitations(ctx, 2)
  if (!picks.length) return { content: next, applied }
  return {
    content: injectOfficialSources(next, picks),
    applied: ['official_citations'],
  }
}
