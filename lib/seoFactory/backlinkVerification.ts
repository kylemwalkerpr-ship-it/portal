/**
 * lib/seoFactory/backlinkVerification.ts
 *
 * P9 external-authority truth — live verification of a CLAIMED third-party
 * backlink.
 *
 * A backlink target used to become `won` as a status label: no fetched page,
 * no observed anchor href, no durable evidence. This module makes a real win
 * deterministic and reproducible:
 *
 *   1. VALIDATE — the claimed backlink page must be an absolute http(s) URL on
 *      the prospect's own domain (or a subdomain of it); it may never be a
 *      YouSafe-owned host, and localhost/private-IP literals are refused.
 *      The linked destination is NOT chosen by the caller: it is the
 *      `destination_url` PERSISTED on the target row, validated against the
 *      HOST_PUBLIC estate authority (and the ownership registry when that
 *      contradicts it). A request may restate that URL but never substitute
 *      one, and a target with no persisted destination can never win.
 *   2. FETCH SAFELY — redirects are followed MANUALLY with a small hop bound,
 *      and every hop is re-validated and its hostname RESOLVED before it is
 *      requested: absolute http(s), still the prospect domain (or a subdomain),
 *      never a YouSafe host, and every resolved address public (no loopback /
 *      private / link-local / reserved / multicast / unspecified answer). A
 *      redirect that would leave the prospect domain, or land on a private
 *      address, is refused BEFORE the location is fetched — so a hostile page
 *      cannot turn this verifier into an SSRF probe or borrow another site's
 *      anchor. The response must be HTML/XHTML when a content type is
 *      observable, must not declare a body beyond the verification cap, and is
 *      read at most to that cap. A non-2xx response, an oversized or non-HTML
 *      body, a network error or a timeout is an HONEST 'unavailable'
 *      observation, never a fabricated 200.
 *   3. PROOF — only the existing structural `exactAnchorHrefMatch` machinery
 *      decides `link_present`: a real anchor href attribute must normalize to
 *      exactly the claimed target URL. A URL printed in prose, commented out,
 *      or serialized inside a script/JSON payload is NOT a link.
 *   4. RECORD — every attempt that reached the network is appended to
 *      public.seo_backlink_verifications (append-only: UPDATE/DELETE refused by
 *      trigger) — including a hop refused for resolving to a private address.
 *      Absent/unavailable verdicts are recorded as such and can never mark a
 *      win; nothing here ever marks a target `lost`. Provenance is derived, not
 *      asserted: the verifier actor comes from the authenticated admin context
 *      supplied by the route, and an `outreach_id` is persisted only after it
 *      is proven to belong to the same target.
 *   5. WIN — only a 'verified' verdict transitions the target to `won`, and the
 *      row is written with the durable pointer pair (won_verified_at +
 *      won_verification_id) plus the verified page URL, which the DB truth
 *      constraint/guard trigger re-prove (the guard also insists the evidence
 *      was taken against the target's own persisted destination). If the
 *      evidence row cannot be persisted, NO win is written: no proof, no win.
 *
 * Observation fields that cannot be read safely (anchor rel/text, declared
 * canonical, indexability) are recorded as NULL rather than guessed. They are
 * annotations only — they never change the anchor verdict.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { loadOwnershipRegistry } from '@/lib/seoDataLoaders'
import { AUTHORITATIVE_OWNERSHIP_STATUS, HOST_PUBLIC, type OwnershipRow } from '@/lib/seoFactory/ownership'
import {
  isIpLiteral,
  isPrivateOrReservedAddress,
  resolveHostAddresses,
  type HostAddressResolver,
  type HostResolution,
} from '@/lib/seoFactory/hostResolution'
import {
  decodeHtmlEntities,
  exactAnchorHrefMatch,
  extractAnchorHrefs,
  normalizeInterlinkProofUrl,
  stripNonRenderedPayloads,
} from '@/lib/seoFactory/interlinkVerification'

/** Closed method vocabulary (mirrors the migration CHECK constraint). */
export const BACKLINK_VERIFICATION_METHODS = ['live_http_fetch'] as const
export type BacklinkVerificationMethod = (typeof BACKLINK_VERIFICATION_METHODS)[number]
export const BACKLINK_VERIFICATION_METHOD: BacklinkVerificationMethod = 'live_http_fetch'

/** Closed verdict vocabulary (mirrors the migration CHECK constraint). */
export const BACKLINK_VERDICTS = ['verified', 'absent', 'unavailable'] as const
export type BacklinkVerdict = (typeof BACKLINK_VERDICTS)[number]

export const BACKLINK_VERIFIER_USER_AGENT = 'YouSafeBacklinkVerify/1.0'

const FETCH_TIMEOUT_MS = 12_000
/** Redirect hops are bounded: a claimed page, a canonical move, that is all. */
export const MAX_BACKLINK_REDIRECT_HOPS = 3
/** Hard cap on the third-party body this verifier will read (2 MiB). */
export const MAX_BACKLINK_BODY_BYTES = 2 * 1024 * 1024
/** Destination-currentness proof is deliberately small: headers + redirect truth, no body parse. */
export const DESTINATION_LIVE_METHOD = 'live_http_get_no_redirect' as const
const DESTINATION_LIVE_TIMEOUT_MS = 8_000

export interface DestinationLiveObservation {
  current: boolean
  status: number | null
  finalUrl: string | null
  method: typeof DESTINATION_LIVE_METHOD
  error: string | null
}

export type DestinationLiveChecker = (url: string) => Promise<DestinationLiveObservation>

/** Content types that can contain a real anchor. Missing header ⇒ unobservable. */
const HTML_CONTENT_TYPES = ['text/html', 'application/xhtml+xml'] as const
const ANCHOR_TEXT_MAX = 200

// ── URL / host validation ───────────────────────────────────────────────────

function normalizeHost(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
}

/** Hostname of an observed final URL, or null when it cannot be parsed. */
function observedHostname(url: string | null): string | null {
  if (!url) return null
  try {
    return normalizeHost(new URL(url).hostname)
  } catch {
    return null
  }
}

/** The estate hostnames from HOST_PUBLIC (the single ownership source of truth). */
export const ESTATE_HOSTS: readonly string[] = [
  ...new Set(Object.values(HOST_PUBLIC).map((baseUrl) => normalizeHost(new URL(baseUrl).hostname))),
]

/** Every YouSafe-owned host, including subdomains of an estate host. */
export function isYouSafeOwnedHost(host: string): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) return false
  return ESTATE_HOSTS.some((owned) => normalized === owned || normalized.endsWith(`.${owned}`))
}

/**
 * localhost / private, loopback, link-local, CGNAT, multicast and reserved IP
 * LITERALS (plus their IPv4-mapped IPv6 forms), sharing ONE address classifier
 * with the DNS gate so a literal and a resolved answer can never be judged by
 * different rules. `localhost` and the usual internal-only TLDs are refused by
 * name too. This is the cheap first gate on a literal host; a DNS NAME that
 * resolves to such an address is refused separately by the hop resolver before
 * any hop is fetched.
 */
export function isPrivateOrLocalHost(host: string): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) return true
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (/\.(local|internal|home|lan)$/.test(normalized)) return true
  return isIpLiteral(normalized) && isPrivateOrReservedAddress(normalized)
}

/** Prospect domains are compared www-insensitively (seed rows use both forms). */
function normalizeProspectDomain(domain: string | null | undefined): string {
  return normalizeHost(domain).replace(/^www\./, '')
}

/** The claimed host must BE the prospect domain or a subdomain of it. */
export function hostMatchesProspectDomain(host: string, prospectDomain: string): boolean {
  const claimed = normalizeHost(host).replace(/^www\./, '')
  const domain = normalizeProspectDomain(prospectDomain)
  if (!claimed || !domain) return false
  return claimed === domain || claimed.endsWith(`.${domain}`)
}

export interface BacklinkUrlValidation {
  ok: boolean
  /** The exact claimed URL string, recorded as evidence exactly as submitted. */
  url?: string
  host?: string
  reason?: string
}

/**
 * The claimed backlink page: absolute http(s), third-party only, prospect
 * domain (or subdomain), never localhost/private literal and never YouSafe.
 */
export function validateBacklinkSourceUrl(
  rawSource: string,
  prospectDomain: string | null | undefined,
): BacklinkUrlValidation {
  const raw = String(rawSource || '').trim()
  if (!raw) return { ok: false, reason: 'a claimed backlink page URL is required' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'the claimed backlink page URL must be absolute (include https://)' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'the claimed backlink page URL must be http(s)' }
  }
  const host = normalizeHost(parsed.hostname)
  if (!host) return { ok: false, reason: 'the claimed backlink page URL has no host' }
  if (isPrivateOrLocalHost(host)) {
    return { ok: false, reason: `the claimed backlink page host "${host}" is a localhost/private address` }
  }
  if (isYouSafeOwnedHost(host)) {
    return { ok: false, reason: `the claimed backlink page must be a third-party page, not the YouSafe estate (${host})` }
  }
  const domain = normalizeProspectDomain(prospectDomain)
  if (!domain) return { ok: false, reason: 'the prospect domain is required to validate the claimed backlink page host' }
  if (!hostMatchesProspectDomain(host, domain)) {
    return {
      ok: false,
      reason: `the claimed backlink page host "${host}" does not match the prospect domain "${domain}"`,
    }
  }
  return { ok: true, url: raw, host }
}

/**
 * The linked destination: an absolute https URL on an EXACT HOST_PUBLIC
 * YouSafe estate host (no subdomain invention, no third-party target).
 */
export function validateEstateTargetUrl(rawTarget: string): BacklinkUrlValidation {
  const raw = String(rawTarget || '').trim()
  if (!raw) return { ok: false, reason: 'the linked YouSafe target URL is required' }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { ok: false, reason: 'the linked YouSafe target URL must be absolute (include https://)' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'the linked YouSafe target URL must be an absolute https URL' }
  }
  const host = normalizeHost(parsed.hostname)
  if (!ESTATE_HOSTS.includes(host)) {
    return {
      ok: false,
      reason: `the linked target host "${host}" is not a HOST_PUBLIC YouSafe estate host (${ESTATE_HOSTS.join(', ')})`,
    }
  }
  return { ok: true, url: raw, host }
}

export interface OwnedDestinationValidation extends BacklinkUrlValidation {
  /** How ownership of the destination was established. */
  ownership?: 'registry_confirmed' | 'host_public'
}

/**
 * The STRATEGIC YouSafe destination persisted on a target row: an absolute
 * https URL on an exact HOST_PUBLIC estate host. When the ownership registry
 * (the estate's ownership authority) carries a row for that exact canonical, at
 * least one row must mark the canonical as a CONFIRMED owner URL — a registry
 * that only knows the canonical as proposed/unconfirmed is a contradiction of
 * ownership and refuses. When the registry does not mention the URL, the exact
 * HOST_PUBLIC host remains the authority (the canonical is on our own estate).
 */
export async function validateOwnedDestinationUrl(
  rawDestination: string,
): Promise<OwnedDestinationValidation> {
  const estate = validateEstateTargetUrl(rawDestination)
  if (!estate.ok || !estate.url || !estate.host) return { ok: false, reason: estate.reason }

  const wanted = normalizeInterlinkProofUrl(estate.url)
  let rows: OwnershipRow[] = []
  try {
    const registry = await loadOwnershipRegistry()
    rows = (registry?.rows as OwnershipRow[] | undefined) || []
  } catch {
    rows = []
  }
  const matching = rows.filter((row) => normalizeInterlinkProofUrl(String(row?.owner_url || '')) === wanted)
  if (!matching.length) return { ok: true, url: estate.url, host: estate.host, ownership: 'host_public' }
  if (matching.some((row) => String(row?.status || '').trim() === AUTHORITATIVE_OWNERSHIP_STATUS)) {
    return { ok: true, url: estate.url, host: estate.host, ownership: 'registry_confirmed' }
  }
  return {
    ok: false,
    reason:
      `the ownership registry does not confirm ${estate.url} as an owned YouSafe canonical ` +
      `(${matching.map((row) => `${String(row.status || 'unknown')}/${String(row.action || 'unknown')}`).join(', ')})`,
  }
}

export interface DestinationBinding {
  ok: boolean
  url?: string
  host?: string
  ownership?: 'registry_confirmed' | 'host_public'
  reason?: string
}

/**
 * Bind a verification to the destination PERSISTED on the target row.
 *
 * The strategic YouSafe URL is a property of the prospect record, not of the
 * request: a caller may repeat it (for compatibility) but may never choose it.
 * A target without a persisted destination has nothing to verify against and
 * can never be marked won — no fetch, no evidence, no win.
 */
export async function resolvePersistedDestination(
  persistedDestination: string | null | undefined,
  requestedTargetUrl?: string | null,
): Promise<DestinationBinding> {
  const persisted = String(persistedDestination || '').trim()
  if (!persisted) {
    return {
      ok: false,
      reason:
        'the backlink target has no persisted destination_url, so there is no owned YouSafe canonical to verify against',
    }
  }
  const owned = await validateOwnedDestinationUrl(persisted)
  if (!owned.ok || !owned.url) return { ok: false, reason: owned.reason }

  const requested = String(requestedTargetUrl || '').trim()
  if (requested && normalizeInterlinkProofUrl(requested) !== normalizeInterlinkProofUrl(owned.url)) {
    return {
      ok: false,
      reason:
        `the requested target_url (${requested}) does not match the destination_url persisted on this target (${owned.url})`,
    }
  }
  return { ok: true, url: owned.url, host: owned.host, ownership: owned.ownership }
}

// ── Observation helpers (annotations only — never the verdict) ──────────────

const TAG_ATTR_RE = /([^\s"'=<>`/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function readTagAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const body = String(tag || '').replace(/^<\s*\/?\s*[a-zA-Z][a-zA-Z0-9:_-]*/, '')
  TAG_ATTR_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_ATTR_RE.exec(body))) {
    const name = String(match[1] || '').toLowerCase()
    if (!name) continue
    attrs.set(name, decodeHtmlEntities(String(match[2] ?? match[3] ?? match[4] ?? '').trim()))
  }
  return attrs
}

const HEAD_TAG_RE = /<(link|meta)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi
const ANCHOR_TAG_RE = /<a\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi

export interface BacklinkPageFacts {
  /** Declared canonical (resolved against the observed page URL) or null. */
  canonicalUrl: string | null
  /** false when a robots directive said noindex; null when not observable. */
  indexable: boolean | null
}

/**
 * Page-level facts, read from the RENDERED document only (comments, CDATA and
 * script/style/template bodies are stripped first) with the same structural
 * rules the proof path uses. Observation only: a missing canonical or an
 * unreadable robots directive stays NULL instead of being guessed.
 */
export function observeBacklinkPageFacts(
  html: string,
  pageUrl: string | null,
  robotsHeader: string | null,
): BacklinkPageFacts {
  const rendered = stripNonRenderedPayloads(String(html || ''))
  let canonicalHref: string | null = null
  let robotsDirectiveSeen = false
  let noindex = false

  const header = String(robotsHeader || '').toLowerCase()
  if (header) {
    robotsDirectiveSeen = true
    if (/(^|[\s,;])noindex([\s,;]|$)/.test(header) || /(^|[\s,;])none([\s,;]|$)/.test(header)) noindex = true
  }

  HEAD_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HEAD_TAG_RE.exec(rendered))) {
    const name = String(match[1] || '').toLowerCase()
    const attrs = readTagAttributes(`<${name} ${match[2] || ''}>`)
    if (name === 'link') {
      const rel = String(attrs.get('rel') || '').toLowerCase().split(/\s+/).filter(Boolean)
      const href = attrs.get('href')
      if (!canonicalHref && rel.includes('canonical') && href) canonicalHref = href
      continue
    }
    const metaName = String(attrs.get('name') || '').toLowerCase().trim()
    if (metaName !== 'robots' && metaName !== 'googlebot') continue
    const content = String(attrs.get('content') || '').toLowerCase()
    robotsDirectiveSeen = true
    if (/(^|[\s,;])noindex([\s,;]|$)/.test(content) || /(^|[\s,;])none([\s,;]|$)/.test(content)) noindex = true
  }

  let canonicalUrl: string | null = null
  if (canonicalHref) {
    const base = String(pageUrl || '').trim()
    try {
      canonicalUrl = /^https?:\/\//i.test(base) ? new URL(canonicalHref, base).toString() : canonicalHref
    } catch {
      canonicalUrl = canonicalHref
    }
  }

  return { canonicalUrl, indexable: robotsDirectiveSeen ? !noindex : null }
}

export interface BacklinkAnchorFacts {
  anchorText: string | null
  /** rel tokens; [] when the proving anchor carried none; null when unreadable. */
  rel: string[] | null
}

/**
 * Anchor-local observations for the href that already PROVED the link. Returns
 * nulls when the enclosing tag cannot be read safely, so a value is never
 * invented for an anchor the verifier could not parse.
 */
export function observeBacklinkAnchorFacts(html: string, observedHref: string): BacklinkAnchorFacts {
  const rendered = stripNonRenderedPayloads(String(html || ''))
  const wanted = normalizeInterlinkProofUrl(observedHref)
  if (!rendered || !wanted) return { anchorText: null, rel: null }

  ANCHOR_TAG_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = ANCHOR_TAG_RE.exec(rendered))) {
    const attrs = readTagAttributes(`<a ${match[1] || ''}>`)
    const href = attrs.get('href')
    if (!href) continue
    if (normalizeInterlinkProofUrl(href) !== wanted) continue
    const relValue = attrs.get('rel')
    const rel =
      relValue == null
        ? []
        : relValue
            .toLowerCase()
            .split(/\s+/)
            .map((token) => token.trim())
            .filter(Boolean)
    const tagEnd = match.index + match[0].length
    const closeAt = rendered.toLowerCase().indexOf('</a', tagEnd)
    let anchorText: string | null = null
    if (closeAt >= 0) {
      const inner = rendered
        .slice(tagEnd, closeAt)
        .replace(/<[^>]*>/g, ' ')
      const text = decodeHtmlEntities(inner).replace(/\s+/g, ' ').trim()
      anchorText = text ? text.slice(0, ANCHOR_TEXT_MAX) : null
    }
    return { anchorText, rel }
  }
  return { anchorText: null, rel: null }
}

// ── Live verification ───────────────────────────────────────────────────────

export interface BacklinkHopValidation {
  ok: boolean
  url?: string
  host?: string
  reason?: string
}

/**
 * Validate ONE fetch hop before it is requested: absolute http(s), on the
 * persisted prospect domain (or a subdomain), never a YouSafe-owned host and
 * never a localhost/private literal. The same rule applies to the claimed page
 * and to every redirect location, so a claimed page cannot bounce the verifier
 * onto another site (or another prospect) and still be credited with the link.
 */
export function validateFetchHopUrl(rawUrl: string, prospectDomain: string): BacklinkHopValidation {
  const source = validateBacklinkSourceUrl(rawUrl, prospectDomain)
  if (!source.ok || !source.url || !source.host) return { ok: false, reason: source.reason }
  return { ok: true, url: source.url, host: source.host }
}

export interface BacklinkRedirectHop {
  from: string
  status: number
  to: string
}

interface ClaimedSourceObservation {
  html: string | null
  status: number | null
  finalUrl: string | null
  robotsHeader: string | null
  contentType: string | null
  declaredContentLength: number | null
  bytesRead: number | null
  redirects: BacklinkRedirectHop[]
  /** Hosts resolved (and proven public) on the way to the final response. */
  resolved: Array<{ host: string; addresses: string[] }>
  /** A hop that was REFUSED before any request was made to it. */
  blockedUrl: string | null
  blockedReason: string | null
  error: string | null
}

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308])

function readHeader(response: Response, name: string): string | null {
  const headers = response?.headers as { get?: (key: string) => string | null } | undefined
  if (!headers || typeof headers.get !== 'function') return null
  try {
    const value = headers.get(name)
    return typeof value === 'string' && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

function declaredContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/**
 * Prove the persisted YouSafe destination is CURRENT before a verified backlink
 * may become a win. Redirects are intentionally NOT followed: a 3xx means the
 * persisted URL is stale and must be corrected before authority can be credited.
 * The response body is cancelled immediately; currentness needs only status and
 * exact URL identity, keeping the Worker/network cost bounded.
 */
export async function checkDestinationLive(url: string): Promise<DestinationLiveObservation> {
  const exact = String(url || '').trim()
  if (!exact) {
    return {
      current: false,
      status: null,
      finalUrl: null,
      method: DESTINATION_LIVE_METHOD,
      error: 'the persisted destination URL is empty',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DESTINATION_LIVE_TIMEOUT_MS)
  try {
    const response = await fetch(exact, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': BACKLINK_VERIFIER_USER_AGENT,
        Accept: 'text/html,*/*;q=0.8',
      },
      signal: controller.signal,
    })
    const status = Number.isFinite(Number(response?.status)) ? Number(response.status) : null
    const location = status != null && REDIRECT_STATUSES.has(status) ? readHeader(response, 'location') : null
    let finalUrl = typeof response?.url === 'string' && response.url ? response.url : exact
    if (location) {
      try {
        finalUrl = new URL(location, exact).toString()
      } catch {
        finalUrl = location
      }
    }
    try {
      await response.body?.cancel()
    } catch {
      // Body cancellation is resource hygiene, not part of the currentness verdict.
    }

    const success = status != null && status >= 200 && status < 300
    const exactFinal =
      normalizeInterlinkProofUrl(finalUrl) === normalizeInterlinkProofUrl(exact)
    const current = success && exactFinal
    const error = current
      ? null
      : status != null && REDIRECT_STATUSES.has(status)
        ? `the persisted destination redirects (HTTP ${status}) to ${finalUrl}`
        : success
          ? `the destination resolved to ${finalUrl}, not the persisted canonical ${exact}`
          : `the persisted destination responded HTTP ${status ?? 'unknown'}`

    return {
      current,
      status,
      finalUrl,
      method: DESTINATION_LIVE_METHOD,
      error,
    }
  } catch (error) {
    return {
      current: false,
      status: null,
      finalUrl: null,
      method: DESTINATION_LIVE_METHOD,
      error: error instanceof Error ? error.message.slice(0, 300) : 'destination live check failed',
    }
  } finally {
    clearTimeout(timer)
  }
}

interface BoundedBodyRead {
  ok: boolean
  /** Present only when ok is false. */
  reason?: 'too_large' | 'unbounded' | 'read_failed'
  /** Present only when ok is true. */
  text?: string | null
  bytes: number | null
  error?: string
}

/**
 * Read at most `limit` bytes. The response stream is the only bounded path: a
 * runtime that exposes no stream is read only when the declared length proves
 * the body fits, and is otherwise REFUSED. `response.text()` is never called on
 * an unbounded third-party body.
 */
async function readBoundedBody(
  response: Response,
  limit: number,
  declared: number | null,
): Promise<BoundedBodyRead> {
  if (declared === 0) return { ok: true, text: '', bytes: 0 }

  const stream = response?.body as
    | (ReadableStream<Uint8Array> & { getReader?: () => ReadableStreamDefaultReader<Uint8Array> })
    | null
    | undefined
  if (stream && typeof stream.getReader === 'function') {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    try {
      for (;;) {
        const step = await reader.read()
        if (step.done) break
        const value = step.value
        if (!value) continue
        total += value.byteLength
        if (total > limit) {
          try {
            await reader.cancel()
          } catch {
            /* the body is being discarded anyway */
          }
          return { ok: false, reason: 'too_large', text: null, bytes: total }
        }
        chunks.push(value)
      }
    } catch (error) {
      return {
        ok: false,
        reason: 'read_failed',
        text: null,
        bytes: total,
        error: error instanceof Error ? error.message.slice(0, 200) : 'body read failed',
      }
    }

    const joined = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      joined.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { ok: true, text: new TextDecoder('utf-8', { fatal: false }).decode(joined), bytes: total }
  }

  // No stream: only a body whose size is already proven can be read at all.
  if (declared == null || declared > limit) {
    return { ok: false, reason: 'unbounded', text: null, bytes: declared }
  }
  try {
    const text = await response.text()
    const bytes = new TextEncoder().encode(text).byteLength
    if (bytes > limit) return { ok: false, reason: 'too_large', text: null, bytes }
    return { ok: true, text, bytes }
  } catch (error) {
    return {
      ok: false,
      reason: 'read_failed',
      text: null,
      bytes: null,
      error: error instanceof Error ? error.message.slice(0, 200) : 'body read failed',
    }
  }
}

/**
 * Fetch the claimed third-party page with MANUAL redirects, a bounded hop
 * count, a bounded overall timeout and a bounded body. Every hop is validated
 * and its hostname resolved BEFORE the request: a redirect is not followed to a
 * location that has not proven itself safe and same-prospect first.
 *
 * Never throws: every failure is an honest observation.
 */
async function fetchClaimedSource(
  claimedUrl: string,
  prospectDomain: string,
  resolver: HostAddressResolver,
): Promise<ClaimedSourceObservation> {
  const observation: ClaimedSourceObservation = {
    html: null,
    status: null,
    finalUrl: null,
    robotsHeader: null,
    contentType: null,
    declaredContentLength: null,
    bytesRead: null,
    redirects: [],
    resolved: [],
    blockedUrl: null,
    blockedReason: null,
    error: null,
  }
  const deadline = Date.now() + FETCH_TIMEOUT_MS
  let current = claimedUrl

  for (let hop = 0; hop <= MAX_BACKLINK_REDIRECT_HOPS; hop++) {
    // ── Validate and resolve the hop BEFORE requesting it.
    const validated = validateFetchHopUrl(current, prospectDomain)
    if (!validated.ok || !validated.url || !validated.host) {
      observation.blockedUrl = current
      observation.blockedReason = validated.reason || 'the redirect location is not an allowed prospect page'
      return observation
    }
    let resolution: HostResolution
    try {
      resolution = await resolver(validated.host)
    } catch (error) {
      resolution = {
        ok: false,
        addresses: [] as string[],
        reason: error instanceof Error ? error.message.slice(0, 200) : 'host resolution failed',
      }
    }
    observation.resolved.push({ host: validated.host, addresses: resolution.addresses || [] })
    // Fail closed on the RESOLVED SET, not merely on the resolver's own verdict:
    // a resolver that reports success while handing back a private address must
    // never open a connection.
    const offenders = (resolution.addresses || []).filter((address) => isPrivateOrReservedAddress(address))
    if (!resolution.ok || !(resolution.addresses || []).length || offenders.length) {
      observation.blockedUrl = validated.url
      observation.blockedReason =
        resolution.reason ||
        (offenders.length
          ? `"${validated.host}" resolves to a private/reserved address (${offenders.join(', ')})`
          : `"${validated.host}" could not be resolved to a public address`)
      return observation
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      observation.error = 'the claimed backlink page did not answer within the verification timeout'
      return observation
    }

    let response: Response
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), remaining)
    try {
      response = (await fetch(validated.url, {
        redirect: 'manual',
        headers: { 'User-Agent': BACKLINK_VERIFIER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        signal: controller.signal,
      })) as Response
    } catch (error) {
      observation.error =
        error instanceof Error ? error.message.slice(0, 300) : 'the claimed backlink page could not be fetched'
      return observation
    } finally {
      clearTimeout(timer)
    }

    const status = Number.isFinite(Number(response?.status)) ? Number(response.status) : null
    observation.status = status
    observation.finalUrl = validated.url

    // A runtime-reported URL that is not the URL we validated is never trusted.
    const reportedUrl = typeof response?.url === 'string' && response.url ? response.url : null
    if (reportedUrl && normalizeInterlinkProofUrl(reportedUrl) !== normalizeInterlinkProofUrl(validated.url)) {
      const reportedHost = observedHostname(reportedUrl)
      if (!reportedHost || !hostMatchesProspectDomain(reportedHost, prospectDomain)) {
        observation.blockedUrl = reportedUrl
        observation.blockedReason = `the fetch resolved to ${reportedUrl}, which is not on the prospect domain`
        return observation
      }
    }

    if (status != null && REDIRECT_STATUSES.has(status)) {
      const location = readHeader(response, 'location')
      if (!location) {
        observation.error = `the claimed backlink page answered HTTP ${status} without a location`
        return observation
      }
      let next: string
      try {
        next = new URL(location, validated.url).toString()
      } catch {
        observation.blockedUrl = location
        observation.blockedReason = 'the redirect location is not an absolute URL'
        return observation
      }
      observation.redirects.push({ from: validated.url, status, to: next })
      current = next
      // The next iteration validates + resolves this location before fetching.
      continue
    }

    if (status == null || status < 200 || status >= 300) {
      observation.error = `the claimed backlink page responded HTTP ${status ?? 'unknown'}`
      return observation
    }

    observation.robotsHeader = readHeader(response, 'x-robots-tag')
    observation.contentType = readHeader(response, 'content-type')
    const mediaType = observation.contentType
      ? observation.contentType.split(';')[0].trim().toLowerCase()
      : null
    if (mediaType && !(HTML_CONTENT_TYPES as readonly string[]).includes(mediaType)) {
      observation.error = `the claimed backlink page is not an HTML document (content-type ${mediaType})`
      return observation
    }

    const declared = declaredContentLength(readHeader(response, 'content-length'))
    observation.declaredContentLength = declared
    if (declared != null && declared > MAX_BACKLINK_BODY_BYTES) {
      observation.error =
        `the claimed backlink page declares ${declared} bytes, beyond the ` +
        `${MAX_BACKLINK_BODY_BYTES}-byte verification limit`
      return observation
    }

    const body = await readBoundedBody(response, MAX_BACKLINK_BODY_BYTES, declared)
    observation.bytesRead = body.bytes
    if (!body.ok) {
      observation.error =
        body.reason === 'too_large'
          ? `the claimed backlink page body exceeded the ${MAX_BACKLINK_BODY_BYTES}-byte verification limit`
          : body.reason === 'unbounded'
            ? 'the claimed backlink page body could not be read within the verification body limit'
            : `the claimed backlink page body could not be read`
      return observation
    }
    observation.html = body.text ?? null
    return observation
  }

  const lastHop = observation.redirects[observation.redirects.length - 1]
  observation.blockedUrl = current
  observation.blockedReason =
    `the claimed backlink page exceeded ${MAX_BACKLINK_REDIRECT_HOPS} redirects` +
    (lastHop ? ` (last hop ${lastHop.from} → ${lastHop.to})` : '')
  return observation
}

export interface VerifyBacklinkClaimInput {
  /** Exact seo_backlink_targets.id the claim belongs to. */
  targetId: string
  /** The claimed third-party page that is supposed to carry the link. */
  sourceUrl: string
  /**
   * OPTIONAL restatement of the target's persisted `destination_url`, kept for
   * caller compatibility. It must normalize to exactly the persisted
   * destination: the persisted value is the only authority, and a request may
   * never choose a different YouSafe URL.
   */
  requestedTargetUrl?: string | null
  /** Optional outreach touch this claim came from (must belong to the target). */
  outreachId?: string | null
  /**
   * Operator identity. Supplied by the AUTH CONTEXT of the caller (the admin
   * route passes the authenticated profile), never by caller JSON.
   */
  actor?: string | null
  /** Overridable clock (evidence timestamp), defaults to now. */
  now?: string
  /** Injectable host resolver; defaults to the real DNS resolver. */
  resolveHostAddresses?: HostAddressResolver
  /** Injectable owned-destination currentness checker for deterministic tests. */
  checkDestinationLive?: DestinationLiveChecker
}

export interface VerifyBacklinkClaimResult {
  ok: boolean
  verdict: BacklinkVerdict | null
  linkPresent: boolean
  /** The appended evidence row id (null when nothing was persisted). */
  verificationId: string | null
  transitionedToWon: boolean
  /** Target status AFTER this attempt (read, never invented). */
  targetStatus: string | null
  sourceUrl: string | null
  /** The PERSISTED destination this verification was bound to. */
  targetUrl: string | null
  destinationOwnership?: 'registry_confirmed' | 'host_public'
  /** True only when the persisted destination itself was observed live and exact. */
  destinationCurrent: boolean | null
  sourceHttpStatus: number | null
  sourceFinalUrl: string | null
  /** A redirect location refused BEFORE it was fetched. */
  blockedUrl?: string | null
  observedHref: string | null
  evidencePersisted: boolean
  reason?: string
  error?: string
}

interface BacklinkTargetRow {
  id?: string
  domain?: string | null
  status?: string | null
  /** The strategic YouSafe canonical for this prospect (P9, additive). */
  destination_url?: string | null
}

function result(partial: Partial<VerifyBacklinkClaimResult>): VerifyBacklinkClaimResult {
  return {
    ok: false,
    verdict: null,
    linkPresent: false,
    verificationId: null,
    transitionedToWon: false,
    targetStatus: null,
    sourceUrl: null,
    targetUrl: null,
    destinationCurrent: null,
    sourceHttpStatus: null,
    sourceFinalUrl: null,
    blockedUrl: null,
    observedHref: null,
    evidencePersisted: false,
    ...partial,
  }
}

/**
 * Verify one claimed external backlink and, only on positive live proof,
 * transition the target to `won`.
 *
 * Never throws. Validation failures (bad/mismatched source, missing or
 * mismatched persisted destination, outreach provenance that does not belong to
 * this target, unknown target row) perform NO network request and append NO
 * evidence: there is nothing verifiable to record. Every attempt that reached
 * the network — including a hop refused for resolving to a private address —
 * is appended exactly once, and negative/unavailable outcomes can never mark
 * the target won (and never mark it lost).
 */
export async function verifyBacklinkClaim(
  input: VerifyBacklinkClaimInput,
): Promise<VerifyBacklinkClaimResult> {
  const targetId = String(input.targetId || '').trim()
  if (!targetId) return result({ reason: 'target_id is required' })

  try {
    const supabase = createSupabaseAdminClient()
    const { data: targetData, error: targetError } = await supabase
      .from('seo_backlink_targets')
      .select('id,domain,status,destination_url')
      .eq('id', targetId)
      .limit(1)
    if (targetError) {
      return result({ reason: 'target read failed', error: String(targetError.message || '').slice(0, 300) })
    }
    const target = ((targetData as BacklinkTargetRow[] | null) || [])[0]
    if (!target?.id) return result({ reason: 'backlink target not found' })

    const source = validateBacklinkSourceUrl(input.sourceUrl, target.domain)
    if (!source.ok || !source.url || !source.host) return result({ reason: source.reason })

    // The destination comes from the TARGET ROW, never from the caller. A
    // target with no persisted destination cannot win; a request that restates
    // a different YouSafe URL is refused (no fetch, no evidence, no win).
    const destination = await resolvePersistedDestination(target.destination_url, input.requestedTargetUrl)
    if (!destination.ok || !destination.url) return result({ reason: destination.reason })

    // Optional outreach provenance must be PROVEN to belong to this target
    // before it can be written next to the evidence.
    let outreachId: string | null = null
    const requestedOutreachId = String(input.outreachId || '').trim()
    if (requestedOutreachId) {
      const { data: outreachData, error: outreachError } = await supabase
        .from('seo_backlink_outreach')
        .select('id,target_id')
        .eq('id', requestedOutreachId)
        .limit(1)
      if (outreachError) {
        return result({
          reason: 'outreach read failed',
          error: String(outreachError.message || '').slice(0, 300),
        })
      }
      const outreachRow = ((outreachData as Array<{ id?: string; target_id?: string | null }> | null) || [])[0]
      if (!outreachRow?.id || String(outreachRow.target_id || '') !== targetId) {
        return result({
          reason: `the outreach_id ${requestedOutreachId} does not belong to this backlink target, so it cannot be recorded as provenance`,
        })
      }
      outreachId = requestedOutreachId
    }

    const claimedSourceUrl = source.url
    const destinationUrl = destination.url
    const now = String(input.now || new Date().toISOString())
    const observation = await fetchClaimedSource(
      claimedSourceUrl,
      String(target.domain || ''),
      input.resolveHostAddresses || resolveHostAddresses,
    )

    let linkPresent = false
    let observedHref: string | null = null
    let anchorContext: string | null = null
    let anchorText: string | null = null
    let relAttributes: string[] | null = null
    let canonicalUrl: string | null = null
    let indexable: boolean | null = null
    let anchorsExamined: number | null = null
    let verdict: BacklinkVerdict
    const finalHost = observedHostname(observation.finalUrl)
    // A redirect that would leave the prospect's own domain is REFUSED before
    // it is fetched: the anchor would otherwise be attributed to a URL that
    // does not carry it (and the fetch would leave the prospect's estate).
    const redirectLeftProspect = observation.redirects.some((hop) => {
      const hopHost = observedHostname(hop.to)
      return !hopHost || !hostMatchesProspectDomain(hopHost, String(target.domain || ''))
    })

    if (observation.html == null) {
      verdict = 'unavailable'
    } else {
      const proof = exactAnchorHrefMatch(observation.html, destinationUrl, {
        sourceCanonicalUrl: observation.finalUrl || claimedSourceUrl,
      })
      linkPresent = proof.present
      observedHref = proof.observedHref
      anchorContext = proof.context
      anchorsExamined = extractAnchorHrefs(observation.html).length
      const facts = observeBacklinkPageFacts(observation.html, observation.finalUrl || claimedSourceUrl, observation.robotsHeader)
      canonicalUrl = facts.canonicalUrl
      indexable = facts.indexable
      if (proof.present && proof.observedHref) {
        const anchor = observeBacklinkAnchorFacts(observation.html, proof.observedHref)
        anchorText = anchor.anchorText
        relAttributes = anchor.rel
      }
      verdict = linkPresent ? 'verified' : 'absent'
    }

    let destinationLive: DestinationLiveObservation | null = null
    if (verdict === 'verified' && linkPresent && observation.finalUrl) {
      try {
        destinationLive = await (input.checkDestinationLive || checkDestinationLive)(destinationUrl)
      } catch (error) {
        destinationLive = {
          current: false,
          status: null,
          finalUrl: null,
          method: DESTINATION_LIVE_METHOD,
          error: error instanceof Error ? error.message.slice(0, 300) : 'destination live check failed',
        }
      }
    }

    const verifier = String(input.actor || '').trim() || BACKLINK_VERIFIER_USER_AGENT
    const evidenceRow = {
      target_id: targetId,
      outreach_id: outreachId,
      backlink_url: claimedSourceUrl,
      target_url: destinationUrl,
      source_domain: source.host,
      source_http_status: observation.status,
      source_final_url: observation.finalUrl,
      link_present: linkPresent,
      observed_href: observedHref,
      anchor_text: anchorText,
      anchor_context: anchorContext,
      rel_attributes: relAttributes,
      page_canonical_url: canonicalUrl,
      page_indexable: indexable,
      verdict,
      verified_at: now,
      method: BACKLINK_VERIFICATION_METHOD,
      verifier,
      evidence: {
        claimedSource: claimedSourceUrl,
        observedFinalSource: {
          url: observation.finalUrl,
          host: finalHost,
        },
        persistedDestination: {
          url: destinationUrl,
          source: 'target_row',
          ownership: destination.ownership || null,
          requested: String(input.requestedTargetUrl || '').trim() || null,
        },
        destinationLive: destinationLive
          ? {
              checked: true,
              current: destinationLive.current,
              status: destinationLive.status,
              finalUrl: destinationLive.finalUrl,
              method: destinationLive.method,
              error: destinationLive.error,
            }
          : {
              checked: false,
              current: null,
              status: null,
              finalUrl: null,
              method: null,
              error: null,
            },
        // Compatibility aliases retained for existing evidence readers.
        destination: {
          url: destinationUrl,
          source: 'target_row',
          ownership: destination.ownership || null,
          requested: String(input.requestedTargetUrl || '').trim() || null,
        },
        finalUrl: observation.finalUrl,
        finalHost,
        hopCount: observation.redirects.length,
        redirectChain: observation.redirects,
        redirectLeftProspect,
        blockedUrl: observation.blockedUrl,
        blockedReason: observation.blockedReason,
        resolvedHosts: observation.resolved,
        bodyLimitBytes: MAX_BACKLINK_BODY_BYTES,
        bytesRead: observation.bytesRead,
        contentType: observation.contentType,
        declaredContentLength: observation.declaredContentLength,
        httpStatus: observation.status,
        robotsHeader: observation.robotsHeader,
        anchorsExamined,
        fetchError:
          observation.error ||
          observation.blockedReason ||
          (redirectLeftProspect
            ? `the claimed page redirected off the prospect domain to ${observation.finalUrl}`
            : null),
        userAgent: BACKLINK_VERIFIER_USER_AGENT,
        actor: verifier,
        method: BACKLINK_VERIFICATION_METHOD,
        fetchedAt: now,
      },
    }

    const { data: inserted, error: insertError } = await supabase
      .from('seo_backlink_verifications')
      .insert(evidenceRow)
      .select('id')
      .single()
    const verificationId = String((inserted as { id?: string } | null)?.id || '').trim()
    if (insertError || !verificationId) {
      // No durable proof → no win. The verdict is still reported honestly.
      return result({
        verdict,
        linkPresent,
        sourceUrl: claimedSourceUrl,
        targetUrl: destinationUrl,
        destinationCurrent: destinationLive?.current ?? null,
        sourceHttpStatus: observation.status,
        sourceFinalUrl: observation.finalUrl,
        observedHref,
        targetStatus: target.status ?? null,
        reason: 'verification evidence was not persisted',
        error: String(insertError?.message || 'evidence insert returned no id').slice(0, 300),
      })
    }

    if (verdict !== 'verified' || !linkPresent) {
      return result({
        ok: true,
        verdict,
        linkPresent,
        verificationId,
        evidencePersisted: true,
        sourceUrl: claimedSourceUrl,
        targetUrl: destinationUrl,
        destinationOwnership: destination.ownership,
        destinationCurrent: destinationLive?.current ?? null,
        sourceHttpStatus: observation.status,
        sourceFinalUrl: observation.finalUrl,
        blockedUrl: observation.blockedUrl,
        observedHref,
        targetStatus: target.status ?? null,
        reason:
          verdict === 'absent'
            ? 'no anchor href to the exact target on the live page'
            : observation.blockedReason ||
              observation.error ||
              (redirectLeftProspect
                ? 'the claimed page redirected off the prospect domain'
                : 'the claimed page was not live'),
      })
    }

    if (!observation.finalUrl || destinationLive?.current !== true) {
      return result({
        ok: true,
        verdict,
        linkPresent,
        verificationId,
        evidencePersisted: true,
        sourceUrl: claimedSourceUrl,
        targetUrl: destinationUrl,
        destinationOwnership: destination.ownership,
        destinationCurrent: destinationLive?.current ?? false,
        sourceHttpStatus: observation.status,
        sourceFinalUrl: observation.finalUrl,
        observedHref,
        targetStatus: target.status ?? null,
        reason: !observation.finalUrl
          ? 'the verified backlink has no observed final source URL, so it cannot become a win'
          : destinationLive?.error || 'the persisted destination is not current/live',
      })
    }

    const { data: updated, error: updateError } = await supabase
      .from('seo_backlink_targets')
      .update({
        status: 'won',
        won_at: now,
        won_verified_at: now,
        won_verification_id: verificationId,
        won_backlink_url: observation.finalUrl,
        // Restate the exact destination this proof was taken against, so the
        // DB guard can re-prove the binding against the row's own column.
        destination_url: destinationUrl,
        last_touched_at: now,
      })
      .eq('id', targetId)
      .neq('status', 'won')
      .select('id')
    if (updateError) {
      return result({
        verdict,
        linkPresent,
        verificationId,
        evidencePersisted: true,
        sourceUrl: claimedSourceUrl,
        targetUrl: destinationUrl,
        destinationCurrent: true,
        sourceHttpStatus: observation.status,
        sourceFinalUrl: observation.finalUrl,
        observedHref,
        targetStatus: target.status ?? null,
        reason: 'won transition failed',
        error: String(updateError.message || '').slice(0, 300),
      })
    }
    const transitioned = ((updated as Array<{ id?: string }> | null) || []).length > 0
    if (!transitioned) {
      // The compare-and-set fence matched nothing: the row was already won (or
      // the read is stale). Read the truth instead of claiming a transition.
      const { data: reread } = await supabase
        .from('seo_backlink_targets')
        .select('status')
        .eq('id', targetId)
        .limit(1)
      const status = String(((reread as Array<{ status?: string }> | null) || [])[0]?.status || '')
      return result({
        ok: status === 'won',
        verdict,
        linkPresent,
        verificationId,
        evidencePersisted: true,
        sourceUrl: claimedSourceUrl,
        targetUrl: destinationUrl,
        destinationOwnership: destination.ownership,
        destinationCurrent: true,
        sourceHttpStatus: observation.status,
        sourceFinalUrl: observation.finalUrl,
        observedHref,
        targetStatus: status || (target.status ?? null),
        reason: status === 'won' ? 'already won' : 'won transition did not apply',
      })
    }

    return result({
      ok: true,
      verdict,
      linkPresent,
      verificationId,
      transitionedToWon: true,
      evidencePersisted: true,
      sourceUrl: claimedSourceUrl,
      targetUrl: destinationUrl,
      destinationOwnership: destination.ownership,
      destinationCurrent: true,
      sourceHttpStatus: observation.status,
      sourceFinalUrl: observation.finalUrl,
      observedHref,
      targetStatus: 'won',
    })
  } catch (error) {
    return result({
      reason: 'backlink verification failed',
      error: error instanceof Error ? error.message.slice(0, 300) : 'unknown error',
    })
  }
}

/** Append-only evidence trail for one target (newest first). */
export async function listBacklinkVerifications(targetId: string, limit = 25): Promise<Array<Record<string, unknown>>> {
  const id = String(targetId || '').trim()
  if (!id) return []
  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from('seo_backlink_verifications')
      .select('id,target_id,outreach_id,backlink_url,target_url,source_domain,source_http_status,source_final_url,link_present,observed_href,anchor_text,anchor_context,rel_attributes,page_canonical_url,page_indexable,verdict,verified_at,method,verifier,evidence')
      .eq('target_id', id)
      .order('verified_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)))
    if (error) return []
    return (data as Array<Record<string, unknown>>) || []
  } catch {
    return []
  }
}
