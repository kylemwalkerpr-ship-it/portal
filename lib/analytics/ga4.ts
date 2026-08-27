/**
 * Shared GA4 helpers for market.yousafeconsultancy.com + portal.yousafeconsultancy.com.
 *
 * Mirrors the consultancy estate pattern (next/script gtag in root layout) with:
 * - NEXT_PUBLIC_GA_MEASUREMENT_ID override (fallback G-FTKZCVNW4B)
 * - cross-domain linker for the whole YouSafe host estate
 * - optional conversion event helpers (call from real hooks only — do not invent fires)
 *
 * Consent: consultancy/landing hosts fire gtag with no banner today. Portal has no
 * consent pattern either, so we match that behavior (no DNT gate invented here).
 */

export const GA4_FALLBACK_MEASUREMENT_ID = 'G-FTKZCVNW4B'

/** Cross-domain linker domains for the YouSafe estate (one GA4 property). */
export const GA4_LINKER_DOMAINS = [
  'yousafeconsultancy.com',
  'usa.yousafeconsultancy.com',
  'ca.yousafeconsultancy.com',
  'uk.yousafeconsultancy.com',
  'au.yousafeconsultancy.com',
  'legal.yousafeconsultancy.com',
  'market.yousafeconsultancy.com',
  'portal.yousafeconsultancy.com',
  'checkout.yousafeconsultancy.com',
] as const

export type GaEventParams = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/** Resolve measurement ID from env with hardcoded estate fallback. */
export function getGaMeasurementId(
  envValue: string | undefined = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
    : undefined,
): string {
  const trimmed = (envValue ?? '').trim()
  return trimmed || GA4_FALLBACK_MEASUREMENT_ID
}

/** gtag.js script URL — same host as consultancy layouts. */
export function gaTagSrc(measurementId = getGaMeasurementId()): string {
  return `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
}

/** gtag('config', …) options shared by boot + SPA page_views. */
export function buildGaConfigOptions() {
  return {
    send_page_view: false as const,
    linker: {
      domains: [...GA4_LINKER_DOMAINS],
      accept_incoming: true as const,
    },
  }
}

/** Inline boot snippet for next/script (dataLayer + config + linker). */
export function buildGaBootScript(measurementId = getGaMeasurementId()): string {
  const config = JSON.stringify(buildGaConfigOptions())
  return [
    'window.dataLayer = window.dataLayer || [];',
    'function gtag(){dataLayer.push(arguments);}',
    "gtag('js', new Date());",
    `gtag('config', '${measurementId}', ${config});`,
  ].join('\n')
}

type GtagFn = (...args: unknown[]) => void

function getBrowserGtag(): GtagFn | undefined {
  const g = globalThis as typeof globalThis & {
    window?: { gtag?: GtagFn }
    gtag?: GtagFn
  }
  if (typeof g.window?.gtag === 'function') return g.window.gtag
  if (typeof g.gtag === 'function') return g.gtag
  return undefined
}

function callGtag(...args: unknown[]) {
  const gtag = getBrowserGtag()
  if (!gtag) return
  gtag(...args)
}

/** SPA / App Router page_view (send_page_view is false on config). */
export function trackPageView(pagePath: string, measurementId = getGaMeasurementId()) {
  callGtag('event', 'page_view', {
    page_path: pagePath,
    send_to: measurementId,
  })
}

/**
 * Optional conversion helpers — wire only from real conversion hooks.
 * Not auto-fired; Clerk sign-up / booking / lead forms own the call sites.
 */
export function trackGenerateLead(params?: GaEventParams) {
  callGtag('event', 'generate_lead', params)
}

export function trackBook(params?: GaEventParams) {
  callGtag('event', 'book', params)
}

export function trackSignUp(params?: GaEventParams) {
  callGtag('event', 'sign_up', params)
}
