/**
 * Server-page auth guards. Every protected page answers a failed auth check
 * through these helpers so no page ever builds a portal sign-in (return_to)
 * URL again (see `portalAuthFailureDestination` for why that looped).
 */
import { redirect } from 'next/navigation'
import { marketAuthUrlForPortalPath, portalAuthFailureDestination } from './portalAuthRedirect'
import type { AuthMode } from './returnTo'

type AuthRedirectOptions = { mode?: AuthMode; intent?: string | null }

/** Anonymous visitor: open the Market modal (one hop) and come back to `returnPath`. */
export function redirectToMarketAuth(returnPath: string, options: AuthRedirectOptions = {}): never {
  redirect(marketAuthUrlForPortalPath(returnPath, options))
}

/** `requirePortalUser()` / `requireAdminUser()` failed: modal for 401, own dashboard otherwise. */
export function redirectForPortalAuthFailure(
  auth: { status: number },
  returnPath: string,
  options: AuthRedirectOptions = {},
): never {
  redirect(portalAuthFailureDestination(auth.status, returnPath, options))
}
