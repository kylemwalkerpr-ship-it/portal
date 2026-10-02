/**
 * The single YouSafe auth modal opener, shared by Market and Portal.
 *
 * Every "Sign in" / "Join" / "Become a provider" / gated action calls one of
 * these with the Clerk instance from `useClerk()`. The modal is branded via
 * `ysClerkAppearance` (also set globally on <ClerkProvider>), and every
 * redirect goes through the one return_to contract in ./returnTo.
 *
 * After SIGN-UP the user always lands on portal /onboarding (role selection,
 * DB is the source of truth), which then forwards to the original
 * destination. After SIGN-IN the user goes straight to the destination.
 */
import { ysClerkAppearance } from './ysClerkAppearance'
import {
  buildAuthUrl,
  normalizeAuthIntent,
  normalizeReturnTo,
  PORTAL_ORIGIN,
  type AuthIntent,
} from './returnTo'

export const DEFAULT_SIGNED_IN_DESTINATION = `${PORTAL_ORIGIN}/dashboard`

export interface YsAuthOptions {
  /** Where to land afterwards. Relative paths resolve against the portal. */
  returnTo?: string | null
  /** Sign-up hint for /onboarding (client / provider / attorney / consultant). */
  intent?: AuthIntent | string | null
  /** Analytics label stored on the Clerk sign-up (never used for roles). */
  source?: string | null
}

/** Minimal surface of the Clerk browser instance we rely on. */
export interface ClerkModalLike {
  openSignIn: (props?: Record<string, unknown>) => void
  openSignUp: (props?: Record<string, unknown>) => void
  closeSignIn?: () => void
  closeSignUp?: () => void
}

export function resolveDestination(returnTo?: string | null): string {
  return normalizeReturnTo(returnTo ?? null) ?? DEFAULT_SIGNED_IN_DESTINATION
}

/** Portal /onboarding URL that forwards to `destination` once a role exists. */
export function onboardingUrl(destination: string, intent?: string | null): string {
  const url = new URL('/onboarding', PORTAL_ORIGIN)
  url.searchParams.set('return_to', destination)
  const normalizedIntent = normalizeAuthIntent(intent)
  if (normalizedIntent) url.searchParams.set('intent', normalizedIntent)
  return url.toString()
}

export function signInModalProps(options: YsAuthOptions = {}) {
  const destination = resolveDestination(options.returnTo)
  return {
    forceRedirectUrl: destination,
    signUpForceRedirectUrl: onboardingUrl(destination, options.intent),
    signUpUrl: buildAuthUrl('sign-up', { returnTo: destination, intent: options.intent ?? null }),
    appearance: ysClerkAppearance,
  }
}

export function signUpModalProps(options: YsAuthOptions = {}) {
  const destination = resolveDestination(options.returnTo)
  const intent = normalizeAuthIntent(options.intent)
  return {
    forceRedirectUrl: onboardingUrl(destination, intent),
    signInForceRedirectUrl: destination,
    signInUrl: buildAuthUrl('sign-in', { returnTo: destination }),
    // Analytics only. Roles are NEVER read from unsafeMetadata (client-writable).
    unsafeMetadata: {
      signupIntent: intent ?? undefined,
      signupSource: options.source ?? undefined,
    },
    appearance: ysClerkAppearance,
  }
}

/**
 * In-modal "Sign in" / "Sign up" footer link. Left to Clerk, it navigates to
 * signInUrl / signUpUrl through the Next router, which on Market restores a
 * stale URL and closes the modal without opening the other one (or reloads
 * the page). Instead we swap modals in place, keeping return_to + intent.
 */
let lastOpened: { mode: 'sign-in' | 'sign-up'; options: YsAuthOptions; clerk: ClerkModalLike } | null = null
let switchInstalled = false

/** Which modal the footer link should switch to, or null to let Clerk handle it. */
export function footerSwitchTarget(currentMode: 'sign-in' | 'sign-up' | null, linkText: string | null | undefined): 'sign-in' | 'sign-up' | null {
  const text = (linkText ?? '').trim().toLowerCase()
  if (currentMode === 'sign-up' && /^sign\s*in\b/.test(text)) return 'sign-in'
  if (currentMode === 'sign-in' && /^sign\s*up\b/.test(text)) return 'sign-up'
  return null
}

export function handleModalFooterClick(event: { target: EventTarget | null; preventDefault(): void; stopImmediatePropagation(): void }): boolean {
  const target = event.target as (Element & { closest?: (sel: string) => Element | null }) | null
  const link = target?.closest?.('.cl-footerActionLink')
  if (!link || !lastOpened) return false
  const next = footerSwitchTarget(lastOpened.mode, link.textContent)
  if (!next) return false
  event.preventDefault()
  event.stopImmediatePropagation()
  const { clerk, options } = lastOpened
  if (next === 'sign-in') {
    clerk.closeSignUp?.()
    openYsSignIn(clerk, options)
  } else {
    clerk.closeSignIn?.()
    openYsSignUp(clerk, options)
  }
  return true
}

function installModalSwitch(): void {
  if (switchInstalled || typeof document === 'undefined') return
  switchInstalled = true
  // Capture phase: runs before Clerk's own link handler.
  document.addEventListener('click', (event) => { handleModalFooterClick(event) }, true)
}

export function openYsSignIn(clerk: ClerkModalLike, options: YsAuthOptions = {}): void {
  lastOpened = { mode: 'sign-in', options, clerk }
  installModalSwitch()
  clerk.openSignIn(signInModalProps(options))
}

export function openYsSignUp(clerk: ClerkModalLike, options: YsAuthOptions = {}): void {
  lastOpened = { mode: 'sign-up', options, clerk }
  installModalSwitch()
  clerk.openSignUp(signUpModalProps(options))
}
