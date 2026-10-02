/**
 * Market-side half of the "no standalone portal sign-in page" contract.
 *
 * Portal /sign-in, /sign-up (and every retired lane) 302 to
 *   https://market.yousafeconsultancy.com/?ys_sign_in=1|ys_sign_up=1&intent=&return_to=
 * and MarketplaceAuthNav opens the ONE branded Clerk modal from these params.
 *
 * It also completes Clerk's modal OAuth round-trip: the modal's SSO
 * redirect_url is `<signInUrl>#/sso-callback?...`; the browser keeps that
 * fragment across our 302s, so the Market page finishes it with
 * `clerk.handleRedirectCallback` (the modal itself cannot read a hash route).
 *
 * Pure parsing + a tiny storage-backed loop guard; no Clerk import here.
 */
import { normalizeAuthIntent, normalizeReturnTo, PORTAL_ORIGIN, type AuthIntent } from './returnTo'
import { getSafeMarketplaceSignInReturnTo, MARKETPLACE_RETURN_TO_QUERY, MARKETPLACE_SIGN_IN_QUERY } from '../marketplaceSignInHandoff'

export const MARKETPLACE_SIGN_UP_QUERY = 'ys_sign_up'
export const HANDOFF_QUERY_KEYS: readonly string[] = [
  MARKETPLACE_SIGN_IN_QUERY,
  MARKETPLACE_SIGN_UP_QUERY,
  MARKETPLACE_RETURN_TO_QUERY,
  'return_to',
  'intent',
  'lane',
]

export interface MarketAuthRequest {
  mode: 'sign-in' | 'sign-up'
  returnTo: string | null
  intent: AuthIntent | null
}

/** Modal request carried by the Market URL, or null. */
export function readMarketAuthRequest(href: string): MarketAuthRequest | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const signUp = url.searchParams.get(MARKETPLACE_SIGN_UP_QUERY) === '1'
  const signIn = url.searchParams.get(MARKETPLACE_SIGN_IN_QUERY) === '1'
  if (!signUp && !signIn) return null
  const rawReturnTo = url.searchParams.get('return_to') ?? url.searchParams.get(MARKETPLACE_RETURN_TO_QUERY)
  const returnTo = rawReturnTo ? getSafeMarketplaceSignInReturnTo(rawReturnTo) : null
  const intent = normalizeAuthIntent(url.searchParams.get('intent')) ?? normalizeAuthIntent(url.searchParams.get('lane'))
  return { mode: signUp ? 'sign-up' : 'sign-in', returnTo, intent }
}

/** The URL with the one-shot handoff params removed (for history.replaceState). */
export function stripMarketAuthParams(href: string): string {
  const url = new URL(href)
  for (const key of HANDOFF_QUERY_KEYS) url.searchParams.delete(key)
  return `${url.pathname}${url.search}${url.hash}`
}

export interface SsoCallbackParams {
  signInForceRedirectUrl: string
  signUpForceRedirectUrl: string
  continueSignUpUrl: string
  firstFactorUrl: string
  secondFactorUrl: string
  resetPasswordUrl: string
  verifyEmailAddressUrl: string
}

const DEFAULT_DESTINATION = `${PORTAL_ORIGIN}/dashboard`

/**
 * Allow-list check that keeps the URL's own query intact (normalizeReturnTo
 * drops nested return_to params, which /onboarding needs to forward on).
 */
function safeAbsoluteEstateUrl(value: string | null): string | null {
  if (!value || !normalizeReturnTo(value)) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Parameters for `clerk.handleRedirectCallback` when the URL fragment is a
 * Clerk modal SSO callback (`#/sso-callback?...`), else null. Redirect targets
 * from the fragment are re-validated against the estate allow-list; follow-up
 * Clerk screens use the portal's embedded sub-screens (never redirected).
 */
export function readSsoCallback(href: string): SsoCallbackParams | null {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
  if (!(hash === '/sso-callback' || hash.startsWith('/sso-callback?') || hash.startsWith('/sso-callback/'))) return null
  const query = new URLSearchParams(hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '')
  const signIn = normalizeReturnTo(query.get('sign_in_force_redirect_url') ?? query.get('redirect_url')) ?? DEFAULT_DESTINATION
  const signUp =
    safeAbsoluteEstateUrl(query.get('sign_up_force_redirect_url')) ??
    `${PORTAL_ORIGIN}/onboarding?return_to=${encodeURIComponent(signIn)}`
  return {
    signInForceRedirectUrl: signIn,
    signUpForceRedirectUrl: signUp,
    continueSignUpUrl: `${PORTAL_ORIGIN}/sign-up/continue`,
    firstFactorUrl: `${PORTAL_ORIGIN}/sign-in/factor-one`,
    secondFactorUrl: `${PORTAL_ORIGIN}/sign-in/factor-two`,
    resetPasswordUrl: `${PORTAL_ORIGIN}/sign-in/reset-password`,
    verifyEmailAddressUrl: `${PORTAL_ORIGIN}/sign-up/verify-email-address`,
  }
}

/** Minimal Storage surface (sessionStorage in the browser, a stub in tests). */
export interface BounceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const BOUNCE_KEY = 'ys_auth_forward'
export const BOUNCE_WINDOW_MS = 120_000
export const BOUNCE_MAX = 2

/**
 * Loop guard for "already signed in on Market, forward to the portal": if the
 * portal cannot see the session (handshake blocked) it would send the browser
 * straight back here. Allow at most BOUNCE_MAX automatic forwards per window;
 * after that the user stays on Market (no ping-pong, no 1102 amplification).
 */
export function allowSignedInForward(storage: BounceStorage | null, now: number): boolean {
  if (!storage) return true
  let state = { count: 0, since: now }
  try {
    const raw = storage.getItem(BOUNCE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { count?: number; since?: number }
      if (typeof parsed.count === 'number' && typeof parsed.since === 'number' && now - parsed.since < BOUNCE_WINDOW_MS) {
        state = { count: parsed.count, since: parsed.since }
      }
    }
  } catch {
    // corrupt value -> fresh window
  }
  if (state.count >= BOUNCE_MAX) return false
  try {
    storage.setItem(BOUNCE_KEY, JSON.stringify({ count: state.count + 1, since: state.since }))
  } catch {
    // storage unavailable: still forward once
  }
  return true
}
