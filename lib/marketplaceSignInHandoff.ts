import { normalizeReturnTo } from './auth/returnTo'

export const MARKETPLACE_ORIGIN = 'https://market.yousafeconsultancy.com'
export const MARKETPLACE_SIGN_IN_QUERY = 'ys_sign_in'
export const MARKETPLACE_RETURN_TO_QUERY = 'ys_return_to'

/**
 * Legacy `?ys_sign_in=1&ys_return_to=` market deep links still open the shared
 * modal. Validation delegates to the ONE estate allow-list in
 * lib/auth/returnTo.ts; relative paths keep their historical relative form.
 */
export function getSafeMarketplaceSignInReturnTo(value: string | null | undefined): string | null {
  if (!value || value.startsWith('//') || value.includes('\\')) return null
  if (value.startsWith('/')) {
    return normalizeReturnTo(value) ? value : null
  }
  return normalizeReturnTo(value)
}

export function createMarketplaceSignInHandoffUrl(returnTo?: string | null): string {
  const url = new URL('/', MARKETPLACE_ORIGIN)
  url.searchParams.set(MARKETPLACE_SIGN_IN_QUERY, '1')
  const safeReturnTo = getSafeMarketplaceSignInReturnTo(returnTo)
  if (safeReturnTo) url.searchParams.set(MARKETPLACE_RETURN_TO_QUERY, safeReturnTo)
  return url.toString()
}

export function shouldRedirectLegacyStudentSignIn(pathname: string, searchParams: URLSearchParams): boolean {
  if (pathname !== '/sign-in/student') return false
  return !Array.from(searchParams.keys()).some((key) => key.toLowerCase().startsWith('__clerk'))
}