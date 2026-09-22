/**
 * P10 browser client.
 *
 * What this module may and may not do:
 *  - It MAY report navigation evidence (`landing`, `cta_click`) under an explicit
 *    consented session.
 *  - It may NEVER declare a lead, order, payment or refund. Those are server
 *    observed only, and the API + database both refuse a browser-declared
 *    business event.
 *  - It never reads, forwards or stores a profile id, email, IP or device
 *    fingerprint. The attribution identity cookie is httpOnly by design.
 */
import {
  ANALYTICS_CONSENT_COOKIE,
  ATTRIBUTION_SOURCE_COOKIE,
  type AnalyticsConsent,
} from './contract'
import { parseConsent } from './source'

export const CONSENT_STORAGE_KEY = 'yousafe:cookie-consent'
export const CONSENT_CHANGE_EVENT = 'yousafe:cookie-consent-change'

export type AttributionBootstrapResult = {
  consent: AnalyticsConsent
  tracking: boolean
  source_class?: string
  requested: boolean
}

function readCookieFromDocument(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const entry = part.trim()
    if (!entry.startsWith(prefix)) continue
    const raw = entry.slice(prefix.length)
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}

/** Consent is read from the banner's localStorage record, then the server-readable cookie. */
export function readClientConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'unknown'
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY)
    if (stored) return parseConsent(stored)
  } catch {
    // Storage unavailable (privacy mode) — fall through to the cookie.
  }
  const cookie = readCookieFromDocument(ANALYTICS_CONSENT_COOKIE)
  return cookie ? parseConsent(cookie) : 'unknown'
}

/** Mirror the banner choice into a server-readable cookie so middleware can honour it. */
export function writeConsentCookie(value: AnalyticsConsent) {
  if (typeof document === 'undefined') return
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  const maxAge = value === 'unknown' ? 0 : 60 * 60 * 24 * 180
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

/**
 * Ask the server to start/resume (granted) or withdraw (denied) the identity,
 * consuming any campaign capture or cross-domain handoff cookie that survived
 * the estate's tracking-parameter 301.
 */
export async function bootstrapAttribution(): Promise<AttributionBootstrapResult> {
  if (typeof window === 'undefined') return { consent: 'unknown', tracking: false, requested: false }
  const consent = readClientConsent()
  writeConsentCookie(consent)
  try {
    const response = await fetch('/api/attribution/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        consent,
        landing: { host: window.location.hostname, path: window.location.pathname },
        referrer: document.referrer || null,
        handoff: readCookieFromDocument('yousafe_attr_handoff'),
        campaign: readCookieFromDocument(ATTRIBUTION_SOURCE_COOKIE),
      }),
    })
    const payload = (await response.json().catch(() => null)) as
      | { data?: { tracking?: boolean; attribution?: { source_class?: string } } }
      | null
    const tracking = Boolean(payload?.data?.tracking)

    // The session response has already set the httpOnly attribution cookie by
    // the time this promise resolves. Emit the first navigation edge only after
    // the server confirmed that a consented session exists. This is deliberately
    // fire-and-forget: landing telemetry can never delay or break the page, and
    // the server dedupes it to once per attribution session.
    if (tracking) trackAttributionLanding()

    return {
      consent,
      tracking,
      source_class: payload?.data?.attribution?.source_class,
      requested: true,
    }
  } catch {
    // Attribution is optional: a failure must never affect the page.
    return { consent, tracking: false, requested: false }
  }
}

/**
 * Record the first landing edge after the server has confirmed a consented
 * attribution session. The event ledger dedupes this to once per session.
 */
export function trackAttributionLanding(): void {
  if (typeof window === 'undefined') return
  if (readClientConsent() !== 'granted') return
  try {
    void fetch('/api/attribution/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ event_type: 'landing' }),
    }).catch(() => {})
  } catch {
    /* analytics failures are never user-visible */
  }
}

/**
 * Record a CTA click for the visitor's consented session. Fire-and-forget by
 * design: it is navigation evidence, not a conversion claim.
 */
export function trackAttributionCta(ctaId: string): void {
  if (typeof window === 'undefined' || !ctaId) return
  if (readClientConsent() !== 'granted') return
  try {
    void fetch('/api/attribution/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ event_type: 'cta_click', cta_id: ctaId.slice(0, 120) }),
    }).catch(() => {})
  } catch {
    /* analytics failures are never user-visible */
  }
}
