/**
 * Link-validity engine — the guarantee that no drafted article ever ships
 * with a made-up or dead link.
 *
 * 2026-08 incident: the AI was told to "use contextual internal links" but
 * was never handed a concrete URL allowlist, so it invented
 * https://www.example.com/… links that shipped live. Independently, the
 * interlink registry pointed at a dead domain (caseworks.com has no DNS),
 * so even registry-fed links would have 404ed.
 *
 * External citations were a second hole: models invent uscis.gov / gov.uk
 * paths that 404, or drop competitor / shortener URLs. Those now have to
 * be a crème-de-la-crème authority (gov / official school / named body),
 * on-topic for the article, AND resolve live.
 *
 * This module is the single source of truth for link validity:
 *  - extractLinks / auditLinksSync  → pure, synchronous structural checks
 *    (placeholder domains, malformed URLs, insecure http:// internal links,
 *    internal paths missing from the verified set, untrusted externals).
 *  - fetchLiveEstateUrls            → the live sitemap becomes the verified
 *    internal URL set (cached 1h).
 *  - verifyUrlsLive                 → cached, concurrency-limited HEAD→GET
 *    live checks (TTL 5m) so dead links are caught with real evidence.
 *  - auditLinksLive                 → async full audit (structural + live)
 *    for BOTH estate and external http(s) links.
 *  - filterLiveInternalUrls         → used by the interlink registry so only
 *    fully-live URLs ever reach a brief or a prompt.
 *  - filterVerifiedCitationUrls / sanitizeDraftLinksLive
 *                                   → briefing + post-draft: only live,
 *                                     on-topic cream authorities remain.
 */

import {
  DISCIPLINE_AUTHORITIES,
  claimIsLicensingExam,
  inferArticleClaim,
  isAuthorityHost,
  isCitationRelevant,
  isCreamSource,
  isKnownDisciplineHost,
  isPrimaryDisciplineAuthority,
  isReputablePublication,
  shouldKeepExternalHref,
  sourcesForBrief,
  type CitationContext,
} from './officialSources'
import { applyCitationPolicy, citationContextForContent } from './citationPolicy'

export const ESTATE_BASE = 'https://legal.yousafeconsultancy.com'

/**
 * Verified-live estate hub anchors per region (every URL confirmed HTTP 200
 * against the live estate — 2026-08-13). Used as the ultimate internal-link
 * fallback for briefs, prompts, and deterministic repairs so the drafting AI
 * ALWAYS receives ≥2 real estate URLs to weave in — never a made-up or dead
 * link. These match the audit's internal-link detector (they contain
 * `yousafeconsultancy.com`), so a draft that carries them clears the
 * INTERNAL_LINKS check without any repair.
 */
export const ESTATE_ANCHOR_LINKS: Record<string, Array<{ label: string; url: string }>> = {
  US: [
    { label: 'US Immigration Hub — CaseWorks Guides', url: `${ESTATE_BASE}/us/` },
    { label: 'YouSafe Consultancy — Immigration Services', url: 'https://yousafeconsultancy.com/' },
  ],
  UK: [
    { label: 'UK Immigration Hub — CaseWorks Guides', url: `${ESTATE_BASE}/uk/` },
    { label: 'YouSafe Consultancy — Immigration Services', url: 'https://yousafeconsultancy.com/' },
  ],
  CA: [
    { label: 'Canada Immigration Hub — CaseWorks Guides', url: `${ESTATE_BASE}/ca/` },
    { label: 'YouSafe Consultancy — Immigration Services', url: 'https://yousafeconsultancy.com/' },
  ],
  AU: [
    { label: 'Australia Immigration Hub — CaseWorks Guides', url: `${ESTATE_BASE}/au/` },
    { label: 'YouSafe Consultancy — Immigration Services', url: 'https://yousafeconsultancy.com/' },
  ],
}

export interface BriefInterlink {
  label: string
  url: string
  placement: string
}

/**
 * Guarantee a brief never carries fewer than `min` verified internal links.
 *
 * 1. Model-chosen targets are kept ONLY when present in the allowlist — a
 *    hallucinated URL from the model is dropped, never shipped.
 * 2. The allowlist tops up until `min` is met (deduped by normalized URL).
 * 3. If the allowlist itself is empty, verified-live region anchors fill the
 *    gap — so the Research brief ALWAYS returns ≥2 estate links end-to-end
 *    and the draft-time INTERNAL_LINKS audit can clear without repairs.
 */
export function ensureBriefInterlinks(
  allowlist: Array<{ label?: string; url: string }>,
  modelTargets: Array<{ label?: string; url?: string; placement?: string }>,
  opts: { min?: number; max?: number; region?: string } = {},
): BriefInterlink[] {
  const min = opts.min ?? 2
  const max = opts.max ?? 6
  const allowUrls = new Set(allowlist.map((l) => normalizeEstateUrl(l.url)))
  const chosen: BriefInterlink[] = []
  const used = new Set<string>()

  const push = (url: string, label: string, placement: string) => {
    const key = normalizeEstateUrl(url)
    if (used.has(key)) return
    chosen.push({ label, url, placement })
    used.add(key)
  }

  for (const t of modelTargets) {
    if (!t || typeof t.url !== 'string' || !t.url.trim()) continue
    if (allowUrls.size > 0 && !allowUrls.has(normalizeEstateUrl(t.url))) continue
    push(t.url, String(t.label || t.url), String(t.placement || 'contextually relevant section'))
    if (chosen.length >= max) return chosen
  }
  for (const l of allowlist) {
    if (chosen.length >= min) break
    push(l.url, String(l.label || l.url), 'contextually relevant section')
  }
  if (chosen.length < min) {
    const regionKey = String(opts.region || 'US').toUpperCase().slice(0, 2)
    const anchors = ESTATE_ANCHOR_LINKS[regionKey] || ESTATE_ANCHOR_LINKS.US
    for (const a of anchors) {
      if (chosen.length >= min) break
      push(a.url, a.label, 'Related guides section')
    }
  }
  return chosen
}

export const ESTATE_HOSTS = new Set<string>([
  'legal.yousafeconsultancy.com',
  'yousafeconsultancy.com',
  'www.yousafeconsultancy.com',
  'market.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'support.yousafeconsultancy.com',
  'caseworks.com',
  'www.caseworks.com',
])

/**
 * Future-proof estate link detector regex — matches any host under the
 * estate root domains (yousafeconsultancy.com / caseworks.com) including
 * current subdomains (legal., portal., market., www., country codes) and ANY
 * future subdomain, plus their bare roots. Used for counting internal/estate
 * links in the audit and the deterministic repair so the two never disagree.
 */
export const ESTATE_LINK_RE =
  /(?:https?:\/\/)?(?:[a-z0-9-]+\.)*(?:yousafeconsultancy\.com|caseworks\.com)/gi

/**
 * Count internal/estate links in draft body text:
 *  - root-relative markdown links (`](`/path`)
 *  - absolute estate-host links (any subdomain of yousafeconsultancy.com or
 *    caseworks.com) — matches the audit's INTERNAL_LINKS check exactly.
 */
export function countEstateLinks(body: string): number {
  // JSON-LD / fenced code often mention legal.yousafeconsultancy.com (publisher
  // logo, og:image). Those are not dofollow internal links — counting them
  // skipped the internal_links repair and failed CI.
  const prose = String(body || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
  return (
    (prose.match(/\]\(\//g) || []).length +
    (prose.match(ESTATE_LINK_RE) || []).length
  )
}

/** Hosts that are obviously placeholder / made-up (hard blockers). */
export const PLACEHOLDER_HOST_RE =
  /(^|\.)(example\.(com|org|net|test)|yourdomain\.com|your-domain\.com|yoursite\.com|yourwebsite\.com|yourwebsite|your-site|your-url|mysite\.com|mywebsite|sitename\.com|websitename|domain\.com|sample\.com|test\.com|website\.com|site\.com|localhost|anything\.com|somesite|lorem\.com|placeholder\.com)$/i

/** Placeholder tokens inside a path (also hard blockers). */
export const PLACEHOLDER_PATH_RE =
  /\b(example|sample-page|placeholder|lorem-ipsum|your-site|your-url|todo|fixme|dummy|test-page)\b/i

export type LinkSeverity = 'blocker' | 'warning'

export interface LinkRef {
  /** Raw match (anchor text for markdown, href attr for HTML). */
  raw: string
  /** The URL as written. */
  url: string
}

export interface LinkAuditFinding {
  code:
    | 'placeholder_link'
    | 'malformed_link'
    | 'dead_internal_link'
    | 'unverified_internal_link'
    | 'insecure_internal_link'
    | 'unreachable_internal_link'
    | 'dead_external_link'
    | 'untrusted_external_link'
    | 'irrelevant_external_link'
    | 'unreachable_external_link'
  severity: LinkSeverity
  url: string
  message: string
  status?: number
}

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g
const HTML_HREF_RE = /href=["']([^"']+)["']/gi

/** Normalize a citation URL for allowlist comparison. */
export function normalizeCitationUrl(url: string): string {
  let u = url.trim()
  u = u.split('#')[0]
  if (u.length > 1 && u.endsWith('/')) u = u.slice(0, -1)
  return u
}

/** Normalize an internal URL for comparison: base rewrite + slash/hash strip. */
export function normalizeEstateUrl(url: string): string {
  let u = url.trim()
  // Dead legacy base → live estate base.
  u = u.replace(/^https?:\/\/(www\.)?caseworks\.com/i, ESTATE_BASE)
  u = u.replace(/^https?:\/\/(www\.)?yousafeconsultancy\.com\//i, 'https://www.yousafeconsultancy.com/')
  u = u.replace(/^https?:\/\/legal\.yousafeconsultancy\.com\//i, ESTATE_BASE + '/')
  // Drop fragment + trailing slash (except root).
  u = u.split('#')[0]
  if (u.length > 1 && u.endsWith('/')) u = u.slice(0, -1)
  return u
}

/**
 * Resolve a link to its absolute normalized estate form for set comparison.
 * Relative estate paths (e.g. `/us/student-visas/`) resolve against the live
 * estate base so they compare correctly against an absolute verified set —
 * otherwise every relative internal link would be flagged unverified.
 */
export function resolveEstateUrl(url: string): string {
  const u = url.trim()
  if (u.startsWith('/')) return normalizeEstateUrl(`${ESTATE_BASE}${u}`)
  return normalizeEstateUrl(u)
}

/** True for estate URLs (absolute estate hosts or root-relative paths). */
export function isEstateUrl(url: string): boolean {
  const u = url.trim()
  if (u.startsWith('/')) return true
  if (/^https?:\/\//i.test(u)) {
    try {
      return ESTATE_HOSTS.has(new URL(u).hostname.toLowerCase())
    } catch {
      return false
    }
  }
  return false
}

/** Extract markdown + HTML + bare http(s) links from a draft body. */
export function extractLinks(content: string): LinkRef[] {
  const out: LinkRef[] = []
  const seen = new Set<string>()
  const push = (raw: string, url: string) => {
    const clean = stripTrailingPunct(url.trim())
    if (!clean || seen.has(clean) || isSkippableHref(clean)) return
    seen.add(clean)
    out.push({ raw, url: clean })
  }
  let m: RegExpExecArray | null
  const markdown = new RegExp(MARKDOWN_LINK_RE.source, 'g')
  while ((m = markdown.exec(content)) !== null) {
    // Skip images: ![alt](url)
    if (m.index > 0 && content[m.index - 1] === '!') continue
    push(m[1] || '', m[2] || '')
  }
  const html = new RegExp(HTML_HREF_RE.source, 'gi')
  while ((m = html.exec(content)) !== null) {
    push('', m[1] || '')
  }
  const bare = /https?:\/\/[^\s)<>\]"'`]+/gi
  while ((m = bare.exec(content)) !== null) {
    push('', m[0] || '')
  }
  return out
}

const SKIP_PREFIXES = ['#', 'mailto:', 'tel:', 'javascript:', 'data:']
const SKIP_HOSTS = new Set(['schema.org', 'www.schema.org', 'w3.org', 'www.w3.org'])

export function isSkippableHref(url: string): boolean {
  const u = url.trim()
  if (!u) return true
  if (SKIP_PREFIXES.some((p) => u.toLowerCase().startsWith(p))) return true
  if (!/^https?:\/\//i.test(u)) return false
  try {
    return SKIP_HOSTS.has(new URL(u).hostname.toLowerCase())
  } catch {
    return false
  }
}

export function isExternalHttpUrl(url: string): boolean {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return false
  return !isEstateUrl(u) && !isSkippableHref(u)
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[.,;:!?]+$/g, '')
}

export function isPlaceholderUrl(url: string): { hit: boolean; what?: string } {
  const u = url.trim()
  if (!u) return { hit: false }
  // Placeholder path tokens anywhere in the raw string (covers relative
  // paths and anchors).
  const pathMatch = u.match(PLACEHOLDER_PATH_RE)
  if (pathMatch) return { hit: true, what: pathMatch[0] }
  // Bare placeholder tokens with no scheme at all.
  if (/^(example|sample|your-site|your-url|placeholder|lorem-ipsum)\b/i.test(u)) {
    return { hit: true, what: u }
  }
  // Hostname-scoped check for absolute URLs — the host regex is anchored, so
  // it must run against the hostname alone, never the full URL string.
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u)
      const host = parsed.hostname.replace(/^www\./i, '')
      if (PLACEHOLDER_HOST_RE.test(host)) return { hit: true, what: parsed.hostname }
    } catch {
      return { hit: false }
    }
  }
  return { hit: false }
}

export function isMalformedUrl(url: string): boolean {
  const u = url.trim()
  if (!u) return true
  if (/\s/.test(u)) return true
  if (/^javascript:/i.test(u)) return true
  // No scheme and not relative/anchor → junk.
  if (!/^https?:\/\//i.test(u) && !u.startsWith('/') && !u.startsWith('#') && !/^(mailto|tel|data):/i.test(u)) {
    return true
  }
  return false
}

/**
 * Detect URLs where a sentence word has been concatenated onto the TLD.
 * The AI often produces `https://www.canada.On` (where "On" is the next
 * word in the sentence) instead of `https://www.canada.ca`.
 *
 * Returns the cleaned URL if a fix is possible, or the original if not.
 */
export function cleanTldSentenceWords(url: string): string {
  const u = url.trim()
  if (!/^https?:\/\//i.test(u)) return url
  try {
    const parsed = new URL(u)
    // Extract hostname preserving case — URL.hostname lowercases, which
    // breaks detection of sentence words that start with a capital letter.
    const rawHost = u.replace(/^https?:\/\/([^/]+).*$/i, '$1')
    const host = parsed.hostname // lowercase version for matching

    // Pattern 1: domain.TLD + sentence word appended (case-insensitive)
    // e.g. immi.homeaffairs.gov.au.Meanwhile → immi.homeaffairs.gov.au
    const appendMatch = rawHost.match(/^(.+?\.(?:ca|com|org|net|gov|edu|co\.uk|co\.nz|co\.za|com\.au|gov\.uk|gov\.ca|gov\.au|gov\.nz|gov\.sg|gov\.ie))\.([A-Za-z][a-z]+)$/)
    if (appendMatch) {
      parsed.hostname = appendMatch[1]
      return parsed.toString()
    }

    // Pattern 2: known country name + sentence word (replaced TLD)
    // e.g. www.canada.On → www.canada.ca, www.quebec.Typically → www.quebec.ca
    const TLD_MAP: Record<string, string> = {
      'canada': '.ca', 'quebec': '.ca', 'britain': '.co.uk',
      'america': '.gov', 'australia': '.gov.au',
      'uscis': '.gov', 'homeaffairs': '.gov.au', 'gov': '.gov',
    }
    for (const [country, tld] of Object.entries(TLD_MAP)) {
      const re = new RegExp(`^(.+\.${country})\.([A-Za-z][a-z]+)$`, 'i')
      const m = rawHost.match(re)
      if (m) {
        parsed.hostname = m[1] + tld
        return parsed.toString()
      }
    }
  } catch { /* invalid URL — leave as-is */ }
  return url
}

/**
 * Strip sentence-word suffixes from markdown link text.
 * E.g. `[Canada On](https://www.canada.On)` → `[Canada](https://www.canada.ca)`
 * The link text often has the same sentence word appended.
 */
export function cleanLinkTextSentenceWord(text: string, url: string): string {
  // If the URL was cleaned (TLD sentence word removed/replaced), check if
  // the link text ends with the sentence word that was in the original URL.
  const urlDiff = url !== cleanTldSentenceWords(url)
  if (!urlDiff) return text
  const cleanedUrl = cleanTldSentenceWords(url)
  // Find the sentence word by comparing hostnames — the word after the
  // common prefix is what got replaced/stripped.
  const origHost = (() => { try { return new URL(url).hostname } catch { return '' } })()
  const cleanHost = (() => { try { return new URL(cleanedUrl).hostname } catch { return '' } })()
  if (origHost === cleanHost) return text
  // Find common prefix length (case-insensitive — URL.hostname lowercases)
  const origLower = origHost.toLowerCase()
  const cleanLower = cleanHost.toLowerCase()
  let prefixLen = 0
  while (prefixLen < origLower.length && prefixLen < cleanLower.length && origLower[prefixLen] === cleanLower[prefixLen]) {
    prefixLen++
  }
  // The remaining part of the original hostname is the sentence word
  const strippedWord = origHost.slice(prefixLen)
  // Case-insensitive check: text might have 'On' while hostname has 'on'
  if (strippedWord && text.toLowerCase().endsWith(' ' + strippedWord.toLowerCase())) {
    // Find the actual ending in the original text and remove it
    const lowerText = text.toLowerCase()
    const lowerWord = ' ' + strippedWord.toLowerCase()
    const idx = lowerText.lastIndexOf(lowerWord)
    if (idx >= 0) {
      return text.slice(0, idx)
    }
  }
  return text
}

/**
 * Synchronous structural audit — no network. Pass the verified internal URL
 * set (from the brief's interlink allowlist and/or the live sitemap) to also
 * flag internal paths that are not known to exist.
 */
export function auditLinksSync(
  content: string,
  knownLiveUrls?: Set<string> | string[],
  externalAllowlist?: string[],
  citationContext?: CitationContext,
): LinkAuditFinding[] {
  const live = knownLiveUrls
    ? new Set(Array.from(knownLiveUrls).map((u) => normalizeEstateUrl(u)))
    : null
  void externalAllowlist
  const findings: LinkAuditFinding[] = []
  const links = extractLinks(content)

  for (const { url } of links) {
    if (SKIP_PREFIXES.some((p) => url.trim().startsWith(p)) || isSkippableHref(url)) continue
    const placeholder = isPlaceholderUrl(url)
    if (placeholder.hit) {
      findings.push({
        code: 'placeholder_link',
        severity: 'blocker',
        url,
        message: `Placeholder / invented URL — replace with a real, verified link${placeholder.what ? ` (found: ${placeholder.what})` : ''}.`,
      })
      continue
    }
    if (isMalformedUrl(url)) {
      findings.push({
        code: 'malformed_link',
        severity: 'blocker',
        url,
        message: 'Malformed link URL — no scheme and not a relative path or anchor.',
      })
      continue
    }
    if (isEstateUrl(url)) {
      const normalized = resolveEstateUrl(url)
      if (/^http:\/\//i.test(url.trim())) {
        findings.push({
          code: 'insecure_internal_link',
          severity: 'warning',
          url,
          message: 'Internal link uses http:// — upgrade to https://.',
        })
      }
      if (live && !live.has(normalized)) {
        findings.push({
          code: 'unverified_internal_link',
          severity: 'warning',
          url,
          message: 'Internal link is not in the verified live URL set — confirm it resolves before shipping.',
        })
      }
      continue
    }
    if (isExternalHttpUrl(url)) {
      const localCtx: CitationContext = {
        ...citationContext,
        topic: citationContext?.topic || inferArticleClaim(content),
        body: `${citationContext?.body || ''} ${content.slice(0, 2500)}`,
      }
      if (!isCreamSource(url, localCtx)) {
        findings.push({
          code: 'untrusted_external_link',
          severity: 'warning',
          url,
          message: `Untrusted external link (${url}) — not a government, official school, named authority, or the issuing body for this article’s claim.`,
        })
        continue
      }
      if (citationContext && !isCitationRelevant(url, citationContext)) {
        findings.push({
          code: 'irrelevant_external_link',
          severity: 'warning',
          url,
          message: `Official page may be a weak fit for this article (${url}) — keep it if live; only swap or remove when the link is dead or clearly unrelated to the topic.`,
        })
        continue
      }
    }
  }
  return findings
}

// ── live verification (cached, concurrency-limited) ────────────────────────

const LIVE_CACHE = new Map<string, { ok: boolean; status: number; finalUrl: string; at: number }>()
const LIVE_TTL_MS = 5 * 60_000
let sitemapCache: { at: number; urls: Set<string> } | null = null
const SITEMAP_TTL_MS = 60 * 60_000

export function resetLinkAuditCaches(): void {
  LIVE_CACHE.clear()
  sitemapCache = null
}

export function sitemapBaseUrl(): string {
  return process.env.ESTATE_SITEMAP_URL || `${ESTATE_BASE}/sitemap.xml`
}

async function fetchEstateSitemap(): Promise<Set<string>> {
  const now = Date.now()
  if (sitemapCache && now - sitemapCache.at < SITEMAP_TTL_MS) return sitemapCache.urls
  const urls = new Set<string>()
  try {
    const res = await fetch(sitemapBaseUrl(), {
      signal: AbortSignal.timeout(Number(process.env.LINK_AUDIT_FETCH_TIMEOUT_MS || 15000)),
    })
    if (res.ok) {
      const xml = await res.text()
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
        urls.add(normalizeEstateUrl(m[1].trim()))
      }
    }
  } catch {
    // Sitemap unreachable — fall back to whatever we have cached or an empty set.
  }
  if (urls.size > 0) sitemapCache = { at: now, urls }
  return urls
}

/** The verified internal URL set: live sitemap ∪ anything the caller adds. */
export async function fetchLiveEstateUrls(extra?: Set<string> | string[]): Promise<Set<string>> {
  const set = await fetchEstateSitemap()
  if (extra) {
    for (const u of extra) set.add(normalizeEstateUrl(u))
  }
  return set
}

async function checkOne(url: string): Promise<{ ok: boolean; status: number; finalUrl: string }> {
  const target = /^https?:\/\//i.test(url) ? url : `${ESTATE_BASE}${url.startsWith('/') ? url : `/${url}`}`
  try {
    let res = await fetch(target, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(Number(process.env.LINK_AUDIT_FETCH_TIMEOUT_MS || 8000)),
    })
    // Some estates return 405/403 for HEAD — retry as GET.
    if ([405, 403, 501].includes(res.status)) {
      res = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(Number(process.env.LINK_AUDIT_FETCH_TIMEOUT_MS || 8000)),
      })
    }
    const ok = res.status >= 200 && res.status < 400
    return { ok, status: res.status, finalUrl: res.url || target }
  } catch {
    return { ok: false, status: 0, finalUrl: target }
  }
}

/** Concurrent, cached live check of internal URLs. 0 status = network/timeout. */
export async function verifyUrlsLive(urls: string[]): Promise<Map<string, { ok: boolean; status: number; finalUrl: string; at: number }>> {
  const now = Date.now()
  const out = new Map<string, { ok: boolean; status: number; finalUrl: string; at: number }>()
  const todo: string[] = []
  for (const u of urls) {
    const cached = LIVE_CACHE.get(u)
    if (cached && now - cached.at < LIVE_TTL_MS) out.set(u, cached)
    else todo.push(u)
  }
  const concurrency = Number(process.env.LINK_AUDIT_CONCURRENCY || 4)
  let cursor = 0
  const worker = async () => {
    while (cursor < todo.length) {
      const u = todo[cursor++]
      const result = await checkOne(u)
      const entry = { ...result, at: Date.now() }
      LIVE_CACHE.set(u, entry)
      out.set(u, entry)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, todo.length)) }, worker))
  return out
}

export function classifyLiveStatus(
  url: string,
  status: number,
): { ok: boolean; blocker: boolean; code: LinkAuditFinding['code']; message: string } {
  const estate = isEstateUrl(url)
  // Issuing bodies (.org boards, Pearson, IELTS) often 403 bot crawlers the
  // same way .gov does. Exempt them from "dead" without making the host cream.
  const authority = isAuthorityHost(url) || isKnownDisciplineHost(url) || isReputablePublication(url)
  if (status >= 200 && status < 400) {
    return { ok: true, blocker: false, code: estate ? 'dead_internal_link' : 'dead_external_link', message: '' }
  }
  // Official hosts often 403/429 bot crawlers while remaining live for readers.
  if (!estate && authority && [401, 403, 405, 429].includes(status)) {
    return { ok: true, blocker: false, code: 'dead_external_link', message: '' }
  }
  if (status === 404 || status === 410) {
    return {
      ok: false,
      blocker: true,
      code: estate ? 'dead_internal_link' : 'dead_external_link',
      message: estate
        ? `Internal link does not resolve (HTTP ${status}) — remove it or replace with a verified estate URL.`
        : `External link is dead (HTTP ${status}) — do not invent government paths. Use a live official URL.`,
    }
  }
  if (status === 0 || status >= 500) {
    return {
      ok: false,
      blocker: !authority,
      code: estate ? 'unreachable_internal_link' : 'unreachable_external_link',
      message: `Link unreachable right now (HTTP ${status || 'network error'}) — re-verify before shipping.`,
    }
  }
  return {
    ok: false,
    blocker: true,
    code: estate ? 'dead_internal_link' : 'dead_external_link',
    message: estate
      ? `Internal link does not resolve (HTTP ${status}) — remove it or replace with a verified estate URL.`
      : `External link is not live (HTTP ${status}) — replace with a working official source.`,
  }
}

/**
 * Async full audit: structural findings + live verification of internal
 * AND external http(s) links that are not already in the verified set.
 */
export async function auditLinksLive(
  content: string,
  opts?: { knownLiveUrls?: Set<string> | string[]; externalAllowlist?: string[]; citationContext?: CitationContext },
): Promise<LinkAuditFinding[]> {
  const structural = auditLinksSync(content, opts?.knownLiveUrls, opts?.externalAllowlist, opts?.citationContext)
  const findings = structural.filter((f) => f.code !== 'unverified_internal_link')
  const liveSet = await fetchLiveEstateUrls(opts?.knownLiveUrls)
  const toVerify: string[] = []
  for (const { url } of extractLinks(content)) {
    if (SKIP_PREFIXES.some((p) => url.trim().startsWith(p)) || isSkippableHref(url)) continue
    if (isPlaceholderUrl(url).hit || isMalformedUrl(url)) continue
    if (isEstateUrl(url)) {
      const normalized = resolveEstateUrl(url)
      if (!liveSet.has(normalized) && !toVerify.includes(normalized)) toVerify.push(normalized)
      continue
    }
    if (isExternalHttpUrl(url) && !toVerify.includes(url)) toVerify.push(url)
  }
  if (toVerify.length > 0) {
    const results = await verifyUrlsLive(toVerify)
    for (const [url, r] of results) {
      const verdict = classifyLiveStatus(url, r.status)
      if (verdict.ok) continue
      findings.push({
        code: verdict.code,
        severity: verdict.blocker ? 'blocker' : 'warning',
        url,
        status: r.status,
        message: verdict.message,
      })
    }
  }
  // Preserve the unverified warnings for URLs that were not live-checked.
  for (const f of structural) {
    if (f.code === 'unverified_internal_link') findings.push(f)
  }
  return findings
}

/**
 * Mechanically strip dead / placeholder / invented links from content.
 * Preserves the link text (anchor text) but removes the URL. Used by the
 * review/reaudit pipeline so the AI editor never sees hallucinated URLs
 * and the ship gate never blocks on DEAD_INTERNAL_LINK.
 */
/** Comparable keys so `/us/foo`, `/us/foo/` and the absolute estate URL match. */
export function deadLinkKeys(url: string): string[] {
  const raw = stripTrailingPunct(String(url || '').trim())
  if (!raw) return []
  const keys = new Set<string>([raw, raw.replace(/\/$/, ''), normalizeCitationUrl(raw)])
  try {
    const resolved = resolveEstateUrl(raw)
    keys.add(resolved)
    keys.add(resolved.replace(/\/$/, ''))
    const path = resolved.replace(/^https?:\/\/[^/]+/i, '') || '/'
    keys.add(path)
    keys.add(path.replace(/\/$/, '') || '/')
    keys.add(`${ESTATE_BASE}${path.startsWith('/') ? path : `/${path}`}`)
    keys.add(`${ESTATE_BASE}${(path.replace(/\/$/, '') || '/')}`)
  } catch {
    /* ignore */
  }
  return [...keys].filter(Boolean)
}

function urlIsInDeadSet(url: string, dead: Set<string>): boolean {
  return deadLinkKeys(url).some((k) => dead.has(k))
}

export function stripDeadLinks(
  content: string,
  deadUrls: string[] | Set<string>,
): { content: string; stripped: number } {
  const dead = new Set<string>()
  for (const u of deadUrls) for (const k of deadLinkKeys(u)) dead.add(k)
  let stripped = 0
  // Strip markdown links: [text](DEAD_URL) -> text
  let result = content.replace(
    /\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g,
    (match, text, url) => {
      if (urlIsInDeadSet(url, dead)) {
        stripped++
        return text
      }
      return match
    },
  )
  result = result.replace(
    /<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi,
    (match, _pre, url, _post, inner) => {
      if (urlIsInDeadSet(url, dead)) {
        stripped++
        return inner
      }
      return match
    },
  )
  result = result.replace(/https?:\/\/[^\s)<>\]"'`]+/gi, (url) => {
    if (urlIsInDeadSet(url, dead)) {
      stripped++
      return ''
    }
    return url
  })
  return { content: result, stripped }
}

/** Keep only estate URLs that are verified live (registry → brief → prompt). */
export async function filterLiveInternalUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return []
  const liveSet = await fetchLiveEstateUrls()
  const toVerify = urls
    .map((u) => resolveEstateUrl(u))
    .filter((u) => isEstateUrl(u) && !liveSet.has(u))
  const results = await verifyUrlsLive(toVerify)
  const live = new Set(Array.from(liveSet))
  for (const [u, r] of results) if (r.ok) live.add(u)
  return urls
    .map((u) => resolveEstateUrl(u))
    .filter((u) => live.has(u))
}

const STRIP_CODES = new Set<LinkAuditFinding['code']>([
  'dead_internal_link',
  'dead_external_link',
  'placeholder_link',
  'irrelevant_external_link',
  'malformed_link',
  'unreachable_internal_link',
])

/**
 * Keep only authority (or extra-allowlisted) URLs that resolve for a reader.
 * Used by Full Brief + the drafting prompt so invented .gov paths never
 * become "SOURCES TO CITE".
 */
export async function filterVerifiedCitationUrls(
  urls: string[],
  extraAllowlist?: string[],
  context?: CitationContext,
): Promise<string[]> {
  void extraAllowlist
  const candidates = urls
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .filter((u) => !isPlaceholderUrl(u).hit && !isMalformedUrl(u) && !isSkippableHref(u))
    .filter((u) => isCreamSource(u, context))
    .filter((u) => isCitationRelevant(u, context))
  if (candidates.length === 0) return []
  const results = await verifyUrlsLive(candidates)
  return candidates.filter((u) => {
    const r = results.get(u)
    if (!r) return false
    return classifyLiveStatus(u, r.status).ok
  })
}

export function urlsFromAllowlistLines(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) {
    const m = String(line || '').match(/https?:\/\/[^\s)]+/)
    if (m) out.push(stripTrailingPunct(m[0]))
  }
  return out
}

/** Verified brief sources + live official bank — this is what the model may cite. */
export async function assembleDraftSourceAllowlist(
  region?: string | null,
  extra?: string[],
  context?: CitationContext,
): Promise<string[]> {
  const ctx: CitationContext = { ...context, region: context?.region ?? region }
  const verified = await filterVerifiedCitationUrls(extra || [], undefined, ctx)
  const official = await liveOfficialSources(region, ctx)
  const out: string[] = []
  const seen = new Set<string>()
  const push = (line: string, url: string) => {
    const key = normalizeCitationUrl(url)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(line)
  }
  for (const url of verified) push(url, url)
  for (const s of official) push(`${s.title} — ${s.url}`, s.url)
  return out.slice(0, 8)
}

export async function liveOfficialSources(
  region?: string | null,
  context?: CitationContext,
): Promise<Array<{ title: string; url: string }>> {
  const ctx: CitationContext = { ...context, region: context?.region ?? region }
  const bank = sourcesForBrief(ctx)
  const live = new Set(await filterVerifiedCitationUrls(bank.map((s) => s.url), undefined, ctx))
  const kept = bank.filter((s) => live.has(s.url) || live.has(normalizeCitationUrl(s.url)))
  if (kept.length) return kept.slice(0, 8)
  return bank.slice(0, 2)
}

export type DeadLinkAction = 'replaced' | 'removed_and_injected' | 'removed'

export interface DeadLinkRemediation {
  deadUrl: string
  context: string
  action: DeadLinkAction
  replacement?: { title: string; url: string }
}

function contextAround(content: string, url: string): string {
  const keys = deadLinkKeys(url)
  let idx = -1
  for (const k of keys) {
    idx = content.indexOf(k)
    if (idx >= 0) break
  }
  if (idx < 0) return content.slice(0, 220).replace(/\s+/g, ' ')
  return content.slice(Math.max(0, idx - 180), Math.min(content.length, idx + url.length + 180)).replace(/\s+/g, ' ')
}

function tokenOverlapScore(context: string, title: string, url: string): number {
  const tokens = context
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4)
  const hay = `${title} ${url}`.toLowerCase()
  let score = 0
  for (const t of tokens) if (hay.includes(t)) score += 1
  const ctx = context.toLowerCase()
  if (/\b(hous|rent|meal|dorm|campus|tenant)\b/.test(ctx) && /legal\.yousafeconsultancy|yousafeconsultancy\.com\/?$/.test(url)) score += 3
  if (/\b(visa|opt|permit|uscis|sevis|i-20|ircc|ukvi)\b/.test(ctx) && /uscis|studyinthestates|sevis|canada\.ca|gov\.uk|homeaffairs/.test(url)) score += 3
  if (claimIsLicensingExam({ body: context }) && isKnownDisciplineHost(url)) score += 12
  if (claimIsLicensingExam({ body: context }) && /uscis\.gov|hud\.gov|studyinthestates/.test(url) && !/\b(visa|opt|uscis|i-765)\b/i.test(ctx)) score -= 10
  // Issuing body for this claim always outranks a generic immigration homepage.
  for (const row of DISCIPLINE_AUTHORITIES) {
    if (!row.match.test(ctx)) continue
    const host = (() => {
      try { return new URL(row.url).hostname.replace(/^www\./, '') } catch { return '' }
    })()
    if (host && hay.includes(host.split('.')[0])) score += 8
    if (row.match.test(hay)) score += 4
  }
  return score
}

function pickBestAlternative(
  context: string,
  pool: Array<{ title: string; url: string }>,
): { title: string; url: string } | null {
  if (!pool.length) return null
  let best = pool[0]
  let bestScore = -1
  for (const c of pool) {
    const s = tokenOverlapScore(context, c.title, c.url)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }
  return best
}

function rewriteHref(content: string, deadUrl: string, nextHref: string | null): { content: string; hits: number } {
  const dead = new Set(deadLinkKeys(deadUrl))
  let hits = 0
  let out = content.replace(/\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g, (m, text, href) => {
    if (!urlIsInDeadSet(href, dead)) return m
    hits += 1
    return nextHref ? `[${text}](${nextHref})` : String(text)
  })
  out = out.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (m, _pre, href, _post, inner) => {
    if (!urlIsInDeadSet(href, dead)) return m
    hits += 1
    return nextHref ? `<a href="${nextHref}">${inner}</a>` : String(inner)
  })
  out = out.replace(/https?:\/\/[^\s)<>\]"'`]+/gi, (href) => {
    if (!urlIsInDeadSet(href, dead)) return href
    hits += 1
    return nextHref || ''
  })
  return { content: out, hits }
}

function injectVerifiedSources(content: string, sources: Array<{ title: string; url: string }>): string {
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

/**
 * Read the sentence around each dead/untrusted URL and either:
 *   - swap the href for a live official or estate alternative that fits the
 *     claim (visa → USCIS/IRCC, housing → estate hub), or
 *   - unwrap the dead href and add a new verifiable citation in Official sources.
 * Never invent a URL — the pool is live-checked official + estate anchors.
 */
export async function remediateDeadLinksInContext(
  content: string,
  findings: LinkAuditFinding[],
  opts?: { region?: string; topic?: string; keywords?: string[] },
): Promise<{ content: string; remediations: DeadLinkRemediation[]; stripped: number; injected: number }> {
  const dead = findings.filter((f) => STRIP_CODES.has(f.code))
  if (!dead.length) return { content, remediations: [], stripped: 0, injected: 0 }

  const ctx: CitationContext = {
    region: opts?.region,
    topic: opts?.topic,
    keywords: opts?.keywords,
    body: content.slice(0, 4000),
  }
  const official = await liveOfficialSources(opts?.region, ctx)
  const regionKey = String(opts?.region || 'US').toUpperCase().slice(0, 2)
  const anchors = ESTATE_ANCHOR_LINKS[regionKey] || ESTATE_ANCHOR_LINKS.US
  const pool = [
    ...official.map((s) => ({ title: s.title, url: s.url })),
    ...anchors.map((s) => ({ title: s.label, url: s.url })),
  ]

  let next = content
  const remediations: DeadLinkRemediation[] = []
  const toInject: Array<{ title: string; url: string }> = []
  let stripped = 0

  const safePool = pool.filter((c) => {
    if (isEstateUrl(c.url)) return true
    return isCreamSource(c.url, ctx) && isCitationRelevant(c.url, ctx)
  })

  for (const f of dead) {
    const around = contextAround(next, f.url)
    const localCtx: CitationContext = {
      ...ctx,
      body: around,
    }
    const localPool = safePool.filter((c) => c.url !== f.url && isCitationRelevant(c.url, localCtx))
    const alt = pickBestAlternative(around, localPool.length ? localPool : safePool)
    if (
      (f.code === 'untrusted_external_link' || f.code === 'irrelevant_external_link' || f.code === 'unreachable_external_link')
      && (shouldKeepExternalHref(f.url, localCtx) || shouldKeepExternalHref(f.url, ctx))
    ) continue
    if (
      f.code === 'irrelevant_external_link' &&
      isPrimaryDisciplineAuthority(f.url) &&
      isCitationRelevant(f.url, ctx)
    ) continue

    const preferReplace =
      f.code === 'irrelevant_external_link' ||
      f.code === 'dead_external_link' ||
      f.code === 'dead_internal_link'
    const unwrapOnly = f.code === 'placeholder_link'
    if (alt && preferReplace && !unwrapOnly) {
      const r = rewriteHref(next, f.url, alt.url)
      if (r.hits > 0) {
        next = r.content
        stripped += r.hits
        remediations.push({ deadUrl: f.url, context: around, action: 'replaced', replacement: alt })
        continue
      }
    }
    if (
      (f.code === 'irrelevant_external_link' || f.code === 'untrusted_external_link') &&
      isCreamSource(f.url, ctx)
    ) {
      // Live official/relevant page — leave it rather than unwrap into a bare claim.
      if (!alt || alt.url === f.url) continue
      const r = rewriteHref(next, f.url, alt.url)
      if (r.hits > 0) {
        next = r.content
        stripped += r.hits
        remediations.push({ deadUrl: f.url, context: around, action: 'replaced', replacement: alt })
      }
      continue
    }

    // Untrusted links that are live and not dead/malformed should be preserved —
    // they're flagged as warnings, not blockers, so the human reviewer decides.
    if (f.code === 'untrusted_external_link') continue

    const r = rewriteHref(next, f.url, unwrapOnly ? null : alt?.url || null)
    next = r.content
    stripped += r.hits
    if (unwrapOnly && alt) {
      toInject.push(alt)
      remediations.push({ deadUrl: f.url, context: around, action: 'removed_and_injected', replacement: alt })
    } else if (alt && r.hits > 0) {
      remediations.push({ deadUrl: f.url, context: around, action: 'replaced', replacement: alt })
    } else {
      remediations.push({ deadUrl: f.url, context: around, action: 'removed' })
    }
  }

  const unique: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  for (const s of toInject) {
    if (!s.url || seen.has(s.url) || next.includes(s.url)) continue
    seen.add(s.url)
    unique.push(s)
  }
  if (unique.length) next = injectVerifiedSources(next, unique)
  return { content: next, remediations, stripped, injected: unique.length }
}

/**
 * Post-draft sanitizer: remediates every dead / invented / untrusted URL
 * from article context (replace with a live alternative, or remove and
 * introduce a new verifiable citation). Never invents URLs.
 */
export async function sanitizeDraftLinksLive(
  content: string,
  opts?: {
    region?: string
    topic?: string
    keywords?: string[]
    externalAllowlist?: string[]
    knownLiveUrls?: Set<string> | string[]
  },
): Promise<{
  content: string
  stripped: number
  injected: number
  findings: LinkAuditFinding[]
  remediations: DeadLinkRemediation[]
}> {
  const citationContext = citationContextForContent(content, {
    region: opts?.region,
    topic: opts?.topic,
    keywords: opts?.keywords,
  })
  const findings = await auditLinksLive(content, {
    externalAllowlist: opts?.externalAllowlist,
    knownLiveUrls: opts?.knownLiveUrls,
    citationContext,
  })
  const remediated = await remediateDeadLinksInContext(content, findings, {
    region: opts?.region,
    topic: opts?.topic,
    keywords: opts?.keywords,
  })
  const cited = applyCitationPolicy(remediated.content, citationContext)
  return {
    content: cited.content,
    stripped: remediated.stripped,
    injected: remediated.injected + (cited.applied.length ? 1 : 0),
    findings,
    remediations: remediated.remediations,
  }
}
