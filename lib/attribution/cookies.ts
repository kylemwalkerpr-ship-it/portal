/**
 * P10 first-party cookie helpers — pure string handling, safe for `middleware.ts`
 * (edge), the Node runtime and tests.
 *
 * Cookie inventory:
 *  - yousafe_attr          httpOnly opaque token: the attribution identity. Browser JS
 *                          can never read it, so a page script cannot exfiltrate or
 *                          replay a visitor's attribution identity.
 *  - yousafe_attr_handoff  NOT httpOnly (the receiving property must be able to send it
 *                          onward). Holds a signed, single-use, <=10 minute token with no
 *                          personal data; the server re-validates signature and expiry.
 *  - yousafe_attr_source   NOT httpOnly. A consent-gated campaign capture (utm_ / click-id)
 *                          that has to survive the estate's unconditional tracking-param
 *                          301. Only written when analytics consent is granted.
 *  - yousafe_consent       NOT httpOnly, server-readable mirror of the banner choice so
 *                          middleware can honour "denied" without guessing.
 */
import {
  ANALYTICS_CONSENT_COOKIE,
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_HANDOFF_COOKIE,
  ATTRIBUTION_HANDOFF_TTL_SECONDS,
  ATTRIBUTION_SOURCE_COOKIE,
  ATTRIBUTION_SOURCE_TTL_SECONDS,
  type AnalyticsConsent,
} from './contract'
import {
  normalizeCampaignValue,
  parseConsent,
  readCampaignFromSearchParams,
  type CampaignCapture,
} from './source'

export type CookieOptions = {
  maxAgeSeconds: number
  httpOnly?: boolean
  sameSite?: 'Lax' | 'Strict' | 'None'
  path?: string
}

const COOKIE_NAME_RE = /^[A-Za-z0-9_-]+$/

export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader || !COOKIE_NAME_RE.test(name)) return null
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const raw = part.slice(separator + 1).trim()
    if (!raw) return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

export function readRequestCookie(req: Request, name: string): string | null {
  return readCookieValue(req.headers.get('cookie'), name)
}

export function readAttributionToken(req: Request): string | null {
  return readRequestCookie(req, ATTRIBUTION_COOKIE)
}

export function readHandoffToken(req: Request): string | null {
  return readRequestCookie(req, ATTRIBUTION_HANDOFF_COOKIE)
}

export function readConsent(req: Request): AnalyticsConsent {
  return parseConsent(readRequestCookie(req, ANALYTICS_CONSENT_COOKIE))
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  if (!COOKIE_NAME_RE.test(name)) throw new Error(`Unsafe cookie name: ${name}`)
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`]
  parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`)
  parts.push(`SameSite=${options.sameSite ?? 'Lax'}`)
  if (options.httpOnly !== false) parts.push('HttpOnly')
  // `Secure` is safe to assert for the estate: every public host is HTTPS. A local
  // http dev origin simply ignores the attribute rather than leaking the cookie.
  parts.push('Secure')
  return parts.join('; ')
}

export function expiredCookie(name: string, options: { httpOnly?: boolean } = {}): string {
  return serializeCookie(name, '', {
    maxAgeSeconds: 0,
    httpOnly: options.httpOnly !== false,
  })
}

export function buildAttributionSessionCookie(token: string, maxAgeSeconds: number): string {
  return serializeCookie(ATTRIBUTION_COOKIE, token, { maxAgeSeconds, httpOnly: true })
}

export function buildHandoffCookie(token: string, maxAgeSeconds: number): string {
  return serializeCookie(ATTRIBUTION_HANDOFF_COOKIE, token, { maxAgeSeconds, httpOnly: false })
}

function safeCaptureDetail(capture: CampaignCapture | null): Record<string, string> | null {
  if (!capture) return null
  const detail: Record<string, string> = {}
  for (const [key, raw] of Object.entries(capture)) {
    const value = normalizeCampaignValue(raw)
    if (value) detail[key] = value
  }
  return Object.keys(detail).length > 0 ? detail : null
}

/** Serialize a consent-gated campaign capture for the short-lived source cookie. */
export function buildSourceCookie(capture: CampaignCapture, maxAgeSeconds: number): string | null {
  const detail = safeCaptureDetail(capture)
  if (!detail) return null
  return serializeCookie(ATTRIBUTION_SOURCE_COOKIE, JSON.stringify(detail), {
    maxAgeSeconds,
    httpOnly: false,
  })
}

/** Parse the source cookie back into a campaign capture. Invalid payloads are dropped. */
export function readSourceCookie(req: Request): CampaignCapture | null {
  const raw = readRequestCookie(req, ATTRIBUTION_SOURCE_COOKIE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const detail: CampaignCapture = {}
    for (const key of ['source', 'medium', 'campaign', 'content', 'term', 'click_id_kind'] as const) {
      const value = normalizeCampaignValue(parsed[key])
      if (value) detail[key] = value
    }
    return Object.keys(detail).length > 0 ? detail : null
  } catch {
    return null
  }
}

/** Read a campaign capture directly from a URL (used where the 301 has not happened yet). */
export function readCampaignFromUrlString(url: string | null | undefined): CampaignCapture | null {
  if (!url) return null
  try {
    return readCampaignFromSearchParams(new URL(url).searchParams)
  } catch {
    return null
  }
}

/**
 * P10 capture decision for a tracking-consolidation redirect — pure and testable.
 *
 * The estate answers a `utm_*` / click-id / `yattr` URL with a single permanent
 * redirect to the clean canonical, which would otherwise destroy navigation
 * evidence before attribution can see it. This function is the ONLY capture
 * hook, and it is deliberately conservative:
 *
 *  - It returns cookies ONLY when this browser already gave explicit `granted`
 *    analytics consent. `unknown` (no banner choice yet) and `denied` persist
 *    NOTHING: an analytics handoff or campaign capture is not carried on the
 *    visitor's behalf before they chose, and their acquisition source stays
 *    unknown rather than being smuggled around the choice.
 *  - It never creates an identifier: it only carries an already-consented token
 *    or stores campaign parameters the visitor's own URL already contained.
 *  - The caller still strips the parameters, so the clean canonical URL is what
 *    crawlers and browsers land on regardless of consent.
 *
 * Consequence, recorded truthfully: until a future adapter re-establishes the
 * consent choice on the receiving host, cross-domain continuity does not exist
 * for a first-time visitor who has not yet chosen.
 */
export function attributionCaptureCookies(req: Request): string[] {
  if (readConsent(req) !== 'granted') return []
  const cookies: string[] = []
  let requestUrl: URL | null = null
  try {
    requestUrl = new URL(req.url)
  } catch {
    requestUrl = null
  }
  const handoffToken = requestUrl?.searchParams.get('yattr') ?? null
  if (handoffToken) {
    cookies.push(buildHandoffCookie(handoffToken, ATTRIBUTION_HANDOFF_TTL_SECONDS))
  }
  const campaign = readCampaignFromUrlString(req.url)
  if (campaign) {
    const cookie = buildSourceCookie(campaign, ATTRIBUTION_SOURCE_TTL_SECONDS)
    if (cookie) cookies.push(cookie)
  }
  return cookies
}
