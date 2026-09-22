import {
  isClerkInternalAuthRequest,
  requestHasClerkHandoffCookie,
  type ClerkRequestCookie,
} from './clerkHandoffState'

const AUTH_INDEPENDENT_PUBLIC_API_GET_PATHS: ReadonlySet<string> = new Set([
  '/api/payments/config',
])

type RequestCookieSource =
  | readonly ClerkRequestCookie[]
  | (() => readonly ClerkRequestCookie[])

export function createLazyRequestCookieSnapshot(
  readCookies: () => readonly ClerkRequestCookie[],
): () => readonly ClerkRequestCookie[] {
  let snapshot: readonly ClerkRequestCookie[] | undefined
  return () => {
    if (snapshot === undefined) snapshot = readCookies()
    return snapshot
  }
}

export function shouldBypassClerkForAuthIndependentApiRequest(
  method: string,
  pathname: string,
  searchParams: URLSearchParams | null | undefined,
  cookies: RequestCookieSource,
): boolean {
  if (method !== 'GET') return false
  if (!AUTH_INDEPENDENT_PUBLIC_API_GET_PATHS.has(pathname)) return false
  if (isClerkInternalAuthRequest(pathname, searchParams)) return false
  const requestCookies = typeof cookies === 'function' ? cookies() : cookies
  if (requestHasClerkHandoffCookie(requestCookies)) return false
  return true
}
