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

export function openYsSignIn(clerk: ClerkModalLike, options: YsAuthOptions = {}): void {
  clerk.openSignIn(signInModalProps(options))
}

export function openYsSignUp(clerk: ClerkModalLike, options: YsAuthOptions = {}): void {
  clerk.openSignUp(signUpModalProps(options))
}
