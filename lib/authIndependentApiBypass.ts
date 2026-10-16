import {
  isClerkInternalAuthRequest,
  requestHasClerkHandoffCookie,
  type ClerkRequestCookie,
} from './clerkHandoffState'

const AUTH_INDEPENDENT_PUBLIC_API_METHODS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['/api/payments/config', new Set(['GET'])],
  // First-party attribution collection is intentionally anonymous and
  // self-enforces same-origin + consent in the handlers. Running Clerk before
  // these hot POSTs adds session-processing CPU without contributing auth.
  ['/api/attribution/session', new Set(['GET', 'POST'])],
  ['/api/attribution/events', new Set(['POST'])],
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
  const methods = AUTH_INDEPENDENT_PUBLIC_API_METHODS.get(pathname)
  if (!methods?.has(method)) return false
  if (isClerkInternalAuthRequest(pathname, searchParams)) return false
  const requestCookies = typeof cookies === 'function' ? cookies() : cookies
  if (requestHasClerkHandoffCookie(requestCookies)) return false
  return true
}
