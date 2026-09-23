export const MARKETPLACE_ORIGIN = 'https://market.yousafeconsultancy.com'
export const MARKETPLACE_SIGN_IN_QUERY = 'ys_sign_in'
export const MARKETPLACE_RETURN_TO_QUERY = 'ys_return_to'

const TRUSTED_ORIGINS = new Set([
  'https://market.yousafeconsultancy.com',
  'https://portal.yousafeconsultancy.com',
  'https://yousafeconsultancy.com',
  'https://www.yousafeconsultancy.com',
  'https://usa.yousafeconsultancy.com',
  'https://ca.yousafeconsultancy.com',
  'https://uk.yousafeconsultancy.com',
  'https://au.yousafeconsultancy.com',
  'https://legal.yousafeconsultancy.com',
  'https://support.yousafeconsultancy.com',
])

export function getSafeMarketplaceSignInReturnTo(value: string | null | undefined): string | null {
  if (!value || value.startsWith('//') || value.includes('\\')) return null
  try {
    if (value.startsWith('/')) {
      if (value.startsWith('/sign-in') || value.startsWith('/sign-up')) return null
      return value
    }
    const url = new URL(value)
    if (url.protocol !== 'https:' || !TRUSTED_ORIGINS.has(url.origin)) return null
    if (url.pathname.startsWith('/sign-in') || url.pathname.startsWith('/sign-up')) return null
    return url.toString()
  } catch {
    return null
  }
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