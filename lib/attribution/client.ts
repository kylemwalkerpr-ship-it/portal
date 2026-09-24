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
  ATTRIBUTION_SOURCE_COOKIE,
  type AnalyticsConsent,
} from './contract'
import { parseConsent } from './source'
import { parseAnalyticsConsentCookie, serializeAnalyticsConsentCookie } from '@/lib/analytics/consent'

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

/**
 * Read the estate-wide consent cookie first. A prior portal-only explicit choice
 * is migrated once so returning visitors keep their saved preference, then its
 * host-scoped storage is removed so the six-month expiry is respected.
 */
export function readClientConsent(): AnalyticsConsent {
  if (typeof window === 'undefined') return 'unknown'
  const shared = parseAnalyticsConsentCookie(document.cookie)
  if (shared) return shared

  let legacy: AnalyticsConsent = 'unknown'
  try {
    legacy = parseConsent(window.localStorage.getItem(CONSENT_STORAGE_KEY))
  } catch {
    // Storage can be unavailable in privacy modes.
  }
  if (legacy === 'unknown') {
    const oldCookie = readCookieFromDocument('yousafe_consent')
    if (oldCookie) legacy = parseConsent(oldCookie)
  }
  if (legacy !== 'unknown') {
    writeConsentCookie(legacy)
    try { window.localStorage.removeItem(CONSENT_STORAGE_KEY) } catch {}
    document.cookie = 'yousafe_consent=; Path=/; Max-Age=0; SameSite=Lax; Secure'
  }
  return legacy
}

/** Write the shared six-month choice so every YouSafe subdomain sees it. */
export function writeConsentCookie(value: AnalyticsConsent) {
  if (typeof document === 'undefined') return
  let cookie = serializeAnalyticsConsentCookie(value)
  if (window.location.protocol !== 'https:') {
    cookie = cookie.replace('; Domain=.yousafeconsultancy.com', '').replace('; Secure', '')
  }
  document.cookie = cookie
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
  // Unknown consent must not send even a first-party analytics payload. A
  // denied choice sends only the withdrawal signal needed to revoke a prior
  // consented attribution identity.
  if (consent === 'unknown') return { consent, tracking: false, requested: false }
  try {
    const response = await fetch('/api/attribution/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(consent === 'denied' ? { consent } : {
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
