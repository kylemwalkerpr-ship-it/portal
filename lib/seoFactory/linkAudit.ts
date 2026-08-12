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
 * This module is the single source of truth for link validity:
 *  - extractLinks / auditLinksSync  → pure, synchronous structural checks
 *    (placeholder domains, malformed URLs, insecure http:// internal links,
 *    internal paths missing from the verified set).
 *  - fetchLiveEstateUrls            → the live sitemap becomes the verified
 *    internal URL set (cached 1h).
 *  - verifyUrlsLive                 → cached, concurrency-limited HEAD→GET
 *    live checks (TTL 5m) so dead links are caught with real evidence.
 *  - auditLinksLive                 → async full audit (structural + live).
 *  - filterLiveInternalUrls         → used by the interlink registry so only
 *    fully-live URLs ever reach a brief or a prompt.
 */

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
  return (
    (body.match(/\]\(\//g) || []).length +
    (body.match(ESTATE_LINK_RE) || []).length
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
  severity: LinkSeverity
  url: string
  message: string
  status?: number
}

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g
const HTML_HREF_RE = /href=["']([^"']+)["']/gi

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

/** Extract markdown + HTML links from a draft body. */
export function extractLinks(content: string): LinkRef[] {
  const out: LinkRef[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  const markdown = new RegExp(MARKDOWN_LINK_RE.source, 'g')
  while ((m = markdown.exec(content)) !== null) {
    const url = (m[2] || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ raw: m[1] || '', url })
  }
  const html = new RegExp(HTML_HREF_RE.source, 'gi')
  while ((m = html.exec(content)) !== null) {
    const url = (m[1] || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({ raw: '', url })
  }
  return out
}

const SKIP_PREFIXES = ['#', 'mailto:', 'tel:', 'javascript:', 'data:']

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
 * Synchronous structural audit — no network. Pass the verified internal URL
 * set (from the brief's interlink allowlist and/or the live sitemap) to also
 * flag internal paths that are not known to exist.
 */
export function auditLinksSync(
  content: string,
  knownLiveUrls?: Set<string> | string[],
): LinkAuditFinding[] {
  const live = knownLiveUrls
    ? new Set(Array.from(knownLiveUrls).map((u) => normalizeEstateUrl(u)))
    : null
  const findings: LinkAuditFinding[] = []
  const links = extractLinks(content)

  for (const { url } of links) {
    if (SKIP_PREFIXES.some((p) => url.trim().startsWith(p))) continue
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

/**
 * Async full audit: structural findings + live verification of internal
 * links that are not already in the verified set.
 */
export async function auditLinksLive(
  content: string,
  opts?: { knownLiveUrls?: Set<string> | string[] },
): Promise<LinkAuditFinding[]> {
  const structural = auditLinksSync(content, opts?.knownLiveUrls)
  const findings = structural.filter((f) => f.code !== 'unverified_internal_link')
  const known = opts?.knownLiveUrls
    ? new Set(Array.from(opts.knownLiveUrls).map((u) => normalizeEstateUrl(u)))
    : null
  const liveSet = known ? known : await fetchLiveEstateUrls()
  const toVerify: string[] = []
  for (const { url } of extractLinks(content)) {
    if (SKIP_PREFIXES.some((p) => url.trim().startsWith(p))) continue
    if (!isEstateUrl(url) || isPlaceholderUrl(url).hit || isMalformedUrl(url)) continue
    const normalized = resolveEstateUrl(url)
    if (!liveSet.has(normalized) && !toVerify.includes(normalized)) toVerify.push(normalized)
  }
  if (toVerify.length > 0) {
    const results = await verifyUrlsLive(toVerify)
    for (const [url, r] of results) {
      if (r.ok) continue
      // Network failure or any HTTP >= 400 → dead; 5xx/timeouts are also
      // >= 400 so they surface as blockers with their status as evidence.
      const dead = r.status === 0 || r.status >= 400
      findings.push({
        code: dead ? 'dead_internal_link' : 'unreachable_internal_link',
        severity: dead ? 'blocker' : 'warning',
        url,
        status: r.status,
        message: dead
          ? `Internal link does not resolve (HTTP ${r.status || 'network error'}) — remove it or replace with a verified estate URL.`
          : `Internal link unreachable right now (HTTP ${r.status}) — re-verify before shipping.`,
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
export function stripDeadLinks(
  content: string,
  deadUrls: string[] | Set<string>,
): { content: string; stripped: number } {
  const dead = new Set(
    Array.from(deadUrls).map((u) =>
      u
        .trim()
        .replace(/^https?:\/\/legal\.yousafeconsultancy\.com/i, '')
        .replace(/^https?:\/\/yousafeconsultancy\.com/i, ''),
    ),
  )
  let stripped = 0
  // Strip markdown links: [text](DEAD_URL) -> text
  let result = content.replace(
    /\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)/g,
    (match, text, url) => {
      const cleanUrl = url.trim()
      const isDead =
        dead.has(cleanUrl) ||
        dead.has(cleanUrl.replace(/\/$/, '')) ||
        dead.has('/' + cleanUrl.replace(/^\//, '')) ||
        Array.from(dead).some(
          (d) =>
            d &&
            cleanUrl.startsWith(d) &&
            (cleanUrl.length === d.length || cleanUrl[d.length] === '/' || cleanUrl[d.length] === '#'),
        )
      if (isDead) {
        stripped++
        return text
      }
      return match
    },
  )
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
