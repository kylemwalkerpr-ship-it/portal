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
 *      YouSafe-owned host, and localhost/private-IP literals are refused. The
 *      linked destination must be an exact HOST_PUBLIC YouSafe estate host.
 *   2. FETCH — the claimed page is fetched live (redirects followed, bounded
 *      timeout, identifying user agent). A non-2xx response, a network error or
 *      a timeout is an HONEST 'unavailable' observation, never a fabricated 200.
 *      A redirect that leaves the prospect's own domain is recorded as such and
 *      can never produce a win: the anchor would then be attributed to a URL
 *      that does not carry it.
 *   3. PROOF — only the existing structural `exactAnchorHrefMatch` machinery
 *      decides `link_present`: a real anchor href attribute must normalize to
 *      exactly the claimed target URL. A URL printed in prose, commented out,
 *      or serialized inside a script/JSON payload is NOT a link.
 *   4. RECORD — every attempt that reached the network is appended to
 *      public.seo_backlink_verifications (append-only: UPDATE/DELETE refused by
 *      trigger). Absent/unavailable verdicts are recorded as such and can never
 *      mark a win; nothing here ever marks a target `lost`.
 *   5. WIN — only a 'verified' verdict transitions the target to `won`, and the
 *      row is written with the durable pointer pair (won_verified_at +
 *      won_verification_id) plus the verified page URL, which the DB truth
 *      constraint/guard trigger re-prove. If the evidence row cannot be
 *      persisted, NO win is written: no proof, no win.
 *
 * Observation fields that cannot be read safely (anchor rel/text, declared
 * canonical, indexability) are recorded as NULL rather than guessed. They are
 * annotations only — they never change the anchor verdict.
 */

import { createSupabaseAdminClient } from '@/lib/supabase'
import { HOST_PUBLIC } from '@/lib/seoFactory/ownership'
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
 * LITERALS (plus their IPv4-mapped IPv6 forms). A DNS name that resolves to a
 * private address is out of scope here: only the literal is refused.
 */
export function isPrivateOrLocalHost(host: string): boolean {
  const normalized = normalizeHost(host)
  if (!normalized) return true
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true
  if (/\.(local|internal|home|lan)$/.test(normalized)) return true

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized)
  if (v4) {
    const octets = v4.slice(1, 5).map(Number)
    if (octets.some((part) => part > 255)) return true
    const [a, b] = octets
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 192 && b === 0) return true
    if (a === 192 && b === 88 && octets[2] === 99) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    return false
  }

  if (normalized.includes(':')) {
    if (normalized === '::' || normalized === '::1') return true
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true
    if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true
    const mapped = /^::ffff:(.+)$/.exec(normalized)
    if (mapped) return isPrivateOrLocalHost(mapped[1])
    return false
  }

  return false
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

interface ClaimedSourceObservation {
  html: string | null
  status: number | null
  finalUrl: string | null
  robotsHeader: string | null
  error: string | null
}

async function fetchClaimedSource(url: string): Promise<ClaimedSourceObservation> {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': BACKLINK_VERIFIER_USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    const finalUrl = typeof response.url === 'string' && response.url ? response.url : null
    const robotsHeader =
      typeof response.headers?.get === 'function' ? response.headers.get('x-robots-tag') : null
    if (!response.ok) {
      return {
        html: null,
        status: Number.isFinite(response.status) ? response.status : null,
        finalUrl,
        robotsHeader,
        error: `the claimed backlink page responded HTTP ${response.status}`,
      }
    }
    return { html: await response.text(), status: response.status, finalUrl, robotsHeader, error: null }
  } catch (error) {
    return {
      html: null,
      status: null,
      finalUrl: null,
      robotsHeader: null,
      error: error instanceof Error ? error.message.slice(0, 300) : 'the claimed backlink page could not be fetched',
    }
  }
}

export interface VerifyBacklinkClaimInput {
  /** Exact seo_backlink_targets.id the claim belongs to. */
  targetId: string
  /** The claimed third-party page that is supposed to carry the link. */
  sourceUrl: string
  /** The exact YouSafe URL the claim says is linked. */
  targetUrl: string
  /** Optional outreach touch this claim came from. */
  outreachId?: string | null
  /** Operator/provenance identity; defaults to the verifier user agent. */
  actor?: string | null
  /** Overridable clock (evidence timestamp), defaults to now. */
  now?: string
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
  targetUrl: string | null
  sourceHttpStatus: number | null
  sourceFinalUrl: string | null
  observedHref: string | null
  evidencePersisted: boolean
  reason?: string
  error?: string
}

interface BacklinkTargetRow {
  id?: string
  domain?: string | null
  status?: string | null
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
    sourceHttpStatus: null,
    sourceFinalUrl: null,
    observedHref: null,
    evidencePersisted: false,
    ...partial,
  }
}

/**
 * Verify one claimed external backlink and, only on positive live proof,
 * transition the target to `won`.
 *
 * Never throws. Validation failures (bad/mismatched source, non-estate target,
 * unknown target row) perform NO network request and append NO evidence: there
 * is nothing verifiable to record. Every attempt that reached the network is
 * appended exactly once — including negative and unavailable outcomes, which
 * can never mark the target won (and never mark it lost).
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
      .select('id,domain,status')
      .eq('id', targetId)
      .limit(1)
    if (targetError) {
      return result({ reason: 'target read failed', error: String(targetError.message || '').slice(0, 300) })
    }
    const target = ((targetData as BacklinkTargetRow[] | null) || [])[0]
    if (!target?.id) return result({ reason: 'backlink target not found' })

    const source = validateBacklinkSourceUrl(input.sourceUrl, target.domain)
    if (!source.ok || !source.url || !source.host) return result({ reason: source.reason })
    const destination = validateEstateTargetUrl(input.targetUrl)
    if (!destination.ok || !destination.url) return result({ reason: destination.reason })

    const claimedSourceUrl = source.url
    const destinationUrl = destination.url
    const now = String(input.now || new Date().toISOString())
    const observation = await fetchClaimedSource(claimedSourceUrl)

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
    // A claimed page that redirects OFF the prospect's own domain is not that
    // page any more: the anchor would be attributed to a URL that does not
    // carry it. Record the observation and refuse the proof (never a win).
    const redirectLeftProspect = finalHost !== null && !hostMatchesProspectDomain(finalHost, String(target.domain || ''))

    if (observation.html == null) {
      verdict = 'unavailable'
    } else if (redirectLeftProspect) {
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

    const verifier = String(input.actor || '').trim() || BACKLINK_VERIFIER_USER_AGENT
    const evidenceRow = {
      target_id: targetId,
      outreach_id: input.outreachId ? String(input.outreachId).trim() : null,
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
        claimedTarget: destinationUrl,
        finalUrl: observation.finalUrl,
        finalHost,
        redirectLeftProspect,
        httpStatus: observation.status,
        robotsHeader: observation.robotsHeader,
        anchorsExamined,
        fetchError:
          observation.error ||
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
        sourceHttpStatus: observation.status,
        sourceFinalUrl: observation.finalUrl,
        observedHref,
        targetStatus: target.status ?? null,
        reason:
          verdict === 'absent'
            ? 'no anchor href to the exact target on the live page'
            : redirectLeftProspect
              ? 'the claimed page redirected off the prospect domain'
              : 'the claimed page was not live',
      })
    }

    const { data: updated, error: updateError } = await supabase
      .from('seo_backlink_targets')
      .update({
        status: 'won',
        won_at: now,
        won_verified_at: now,
        won_verification_id: verificationId,
        won_backlink_url: claimedSourceUrl,
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
