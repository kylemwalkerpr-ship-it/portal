/**
 * Top-level path segments that exist on the portal host (Sanitization Brief
 * Phase 6, custom 404). Anything else on portal.yousafeconsultancy.com has no
 * route, so middleware lets Next render the branded not-found page with a real
 * 404 instead of bouncing an anonymous visitor to sign-in (which made every
 * typo look like a protected page). Pure string work: no auth() / crypto.
 *
 * tests/portal-known-routes.test.ts fails if an app/ top-level route is added
 * without being listed here, so a real protected section can never be skipped.
 */
export const PORTAL_KNOWN_TOP_SEGMENTS: ReadonlySet<string> = new Set([
  // app/ route directories
  'account',
  'api',
  'dashboard',
  'marketplace',
  'onboarding',
  'payhip-product',
  'sellers',
  'shop',
  'sign-in',
  'sign-up',
  'user',
  // handled by redirects/aliases in middleware or next.config
  'login',
  'register',
  // metadata routes
  'robots.txt',
  'sitemap.xml',
])

export function isUnknownPortalPath(pathname: string): boolean {
  if (!pathname || pathname === '/') return false
  const first = pathname.split('/').filter(Boolean)[0]
  if (!first) return false
  // Next internals / Clerk proxies are never "unknown".
  if (first.startsWith('_') || first.startsWith('.') || first.startsWith('__clerk')) return false
  return !PORTAL_KNOWN_TOP_SEGMENTS.has(first)
}
