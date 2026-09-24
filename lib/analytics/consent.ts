import { ANALYTICS_CONSENT_COOKIE, type AnalyticsConsent } from '@/lib/attribution/contract'
export { ANALYTICS_CONSENT_COOKIE }

export const ANALYTICS_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 180
export type ConsentChoice = Exclude<AnalyticsConsent, 'unknown'>

export function parseAnalyticsConsentCookie(cookieHeader: string | null | undefined): AnalyticsConsent | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0 || part.slice(0, separator).trim() !== ANALYTICS_CONSENT_COOKIE) continue
    let value = ''
    try { value = decodeURIComponent(part.slice(separator + 1).trim()).toLowerCase() } catch { return null }
    if (value === 'accepted') return 'granted'
    if (value === 'rejected') return 'denied'
    return null
  }
  return null
}

/** Shared cookie contract used by every YouSafe subdomain. */
export function serializeAnalyticsConsentCookie(consent: AnalyticsConsent): string {
  const value = consent === 'granted' ? 'accepted' : consent === 'denied' ? 'rejected' : ''
  const maxAge = consent === 'unknown' ? 0 : ANALYTICS_CONSENT_MAX_AGE_SECONDS
  return `${ANALYTICS_CONSENT_COOKIE}=${value}; Domain=.yousafeconsultancy.com; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`
}
