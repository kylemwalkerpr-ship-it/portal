import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export const runtime = 'experimental-edge'

const AUTHORIZED_PARTIES = (process.env.CLERK_AUTHORIZED_PARTIES ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/articles/feed',
  '/api/wallet/diagnose',
  '/api/translate(.*)',
  '/api/chat(.*)',
  // Public marketplace (brief 29). Pages and GET reads serve unauthenticated
  // visitors; mutation handlers under these paths self-enforce auth
  // (requirePortalUser / requireAttorney / etc.), so a public match here
  // never exposes a write.
  '/marketplace(.*)',
  '/api/marketplace(.*)',
  '/api/gigs(.*)',
  '/api/gig-categories(.*)',
  '/api/gig-reviews(.*)',
  // /api/reviews powers the public ReviewsSection on attorney/consultant
  // and gig detail pages. GET is anonymous-safe (reads gig_reviews +
  // profile name only); POST is auth-gated inside the handler.
  '/api/reviews(.*)',
  '/api/attorneys(.*)',
  '/api/consultants(.*)',
  // /api/profile is hit on every marketplace page by MarketplaceShell to
  // resolve the current user's role. The GET handler returns
  // `{ profile: null }` for anonymous callers; PATCH still enforces auth
  // internally (401). Without this entry, anon visitors on
  // market.yousafeconsultancy.com hit a fetch-level redirect to
  // /sign-in/student which then bounces to portal — perceived as
  // "the marketplace redirects to sign-in after I sign out".
  '/api/profile',
  '/api/sellers(.*)',
])

// Origins we permit for cross-origin API calls. The market subdomain
// is the most common consumer — students browse there, then click
// "Chat with attorney" which hits portal API endpoints across origins.
// Without these, the browser preflights /api/messages/start etc. and
// the portal's redirect-to-sign-in response (which has no CORS headers)
// breaks the fetch with "Preflight response is not successful".
const ALLOWED_CROSS_ORIGINS = new Set([
  'https://portal.yousafeconsultancy.com',
  'https://market.yousafeconsultancy.com',
  'https://yousafeconsultancy.com',
  'https://www.yousafeconsultancy.com',
  'https://usa.yousafeconsultancy.com',
  'https://ca.yousafeconsultancy.com',
  'https://uk.yousafeconsultancy.com',
  'https://legal.yousafeconsultancy.com',
  'https://support.yousafeconsultancy.com',
])

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const headers: Record<string, string> = { Vary: 'Origin' }
  if (ALLOWED_CROSS_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, PUT, DELETE, OPTIONS'
    // Whitelist Next.js RSC navigation headers — without these, cross-subdomain
    // <Link> prefetch / soft-navigation fails preflight with errors like
    // "Request header field <name> is not allowed by Access-Control-Allow-Headers"
    // and the browser falls back to a hard navigation (or fails outright on
    // server-component reads). Next.js sends RSC + several derived headers
    // depending on the navigation flavour (prefetch vs full nav vs segment
    // prefetch); listing them broadly here costs nothing and saves another
    // round of "preflight failed" fire-fighting whenever Next bumps its
    // header set. Affects portal ↔ market most often.
    headers['Access-Control-Allow-Headers'] = [
      'Content-Type',
      'Authorization',
      'RSC',
      'Next-Router-State-Tree',
      'Next-Router-Prefetch',
      'Next-Router-Segment-Prefetch',
      'Next-Url',
      'Next-Action',
      'X-Action-Revalidated',
    ].join(', ')
    headers['Access-Control-Max-Age'] = '86400'
  }
  return headers
}

function withCorsHeaders(res: NextResponse, req: Request): NextResponse {
  const corsHeaders = corsHeadersFor(req)
  for (const [k, v] of Object.entries(corsHeaders)) {
    res.headers.set(k, v)
  }
  return res
}

const SUPPORTED_LANGS = new Set(['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'])

// ISO 3166-1 alpha-2 → preferred supported language. Used as a fallback
// when Accept-Language is generic (e.g. a Brazilian visitor whose browser
// is set to en-US should still get Portuguese surfaced as the default).
const COUNTRY_TO_LANG: Record<string, string> = {
  // Spanish-speaking
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', PE: 'es', CL: 'es', VE: 'es',
  EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', SV: 'es',
  NI: 'es', CR: 'es', PY: 'es', UY: 'es', PR: 'es',
  // French
  FR: 'fr', BE: 'fr', LU: 'fr', MC: 'fr', SN: 'fr', CI: 'fr', CM: 'fr',
  // Portuguese
  BR: 'pt', PT: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt',
  // Arabic
  SA: 'ar', EG: 'ar', AE: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', IQ: 'ar',
  JO: 'ar', LY: 'ar', LB: 'ar', OM: 'ar', QA: 'ar', SY: 'ar', YE: 'ar',
  KW: 'ar', BH: 'ar', SD: 'ar', MR: 'ar', PS: 'ar',
  // Chinese
  CN: 'zh', TW: 'zh', HK: 'zh', SG: 'zh', MO: 'zh',
  // Hindi
  IN: 'hi', NP: 'hi',
}

function resolveLanguage(req: any): string {
  // 1. ?lang= takes priority — explicit user choice via hreflang/links/pill.
  const q = req.nextUrl.searchParams.get('lang')
  if (q && SUPPORTED_LANGS.has(q)) return q
  // 2. Accept-Language header — what the browser is configured for.
  const accept = req.headers.get('accept-language')
  if (accept) {
    for (const part of String(accept).split(',')) {
      const code = part.split(';')[0].trim().toLowerCase().slice(0, 2)
      if (SUPPORTED_LANGS.has(code)) return code
    }
  }
  // 3. Cloudflare geo — IP-based country code. The cf object lives on the
  // raw request; Next exposes it via req.geo.country in middleware.
  const country = (req as any)?.geo?.country
    || (req.headers.get('cf-ipcountry') ?? '').toUpperCase()
  if (country && COUNTRY_TO_LANG[country] && SUPPORTED_LANGS.has(COUNTRY_TO_LANG[country])) {
    return COUNTRY_TO_LANG[country]
  }
  return 'en'
}

// Helper: attach navigation + language headers so server components can read
// them via headers() without re-parsing the URL. Also writes a cookie with
// the inferred default so the client LanguageProvider can honour the
// server's geo/Accept-Language decision on first paint — without that
// cookie the provider would only see localStorage on initial mount and
// every fresh browser would default to English regardless of origin.
function withPathHeaders(res: NextResponse, pathname: string, search: string, lang: string) {
  res.headers.set('x-pathname', `${pathname}${search}`)
  res.headers.set('x-lang', lang)
  // Cookie is a *default* — the provider only reads it when neither the
  // URL nor localStorage has an explicit preference. Refresh on every
  // request so a visitor moving countries gets an updated suggestion.
  res.cookies.set('yousafe-lang-default', lang, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30,   // 30 days
    sameSite: 'lax',
    httpOnly: false,             // client JS needs to read it
  })
  return res
}

const MARKET_HOST = 'market.yousafeconsultancy.com'
const PORTAL_HOST = 'portal.yousafeconsultancy.com'

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname, search } = req.nextUrl
    const hostname = req.headers.get('host')?.split(':')[0] || req.nextUrl.hostname || ''
    const lang = resolveLanguage(req)

    // ── CORS preflight ───────────────────────────────────────────────────
    // OPTIONS from an allowed cross-origin gets a 204 with the right
    // Access-Control-* headers. Covers:
    //   • /api/*           — JSON endpoints (most common case)
    //   • /gigs/*          — public gig HTML pages. Some clients (third-party
    //                        embed widgets, share-card preview pulls,
    //                        cached service-worker fetches from prior
    //                        deployments) fetch them with credentials,
    //                        which triggers a preflight. Without OPTIONS
    //                        coverage the preflight 400s and the user
    //                        sees a console error storm even though the
    //                        page itself loaded fine via normal navigation.
    //   • /providers/*     — public seller profile pages, same rationale.
    //   • /marketplace/*   — legacy /marketplace-prefixed URLs.
    if (req.method === 'OPTIONS') {
      const isCorsablePath =
        pathname.startsWith('/api/') ||
        pathname.startsWith('/gigs/') ||
        pathname.startsWith('/providers/') ||
        pathname.startsWith('/marketplace/')
      if (isCorsablePath) {
        const origin = req.headers.get('origin') || ''
        if (ALLOWED_CROSS_ORIGINS.has(origin)) {
          return new NextResponse(null, { status: 204, headers: corsHeadersFor(req) })
        }
      }
    }

    // ── Hostname-based routing ───────────────────────────────────────────
    // Market domain: rewrite /xyz → /marketplace/xyz (except API, static, and
    // already-prefixed paths). Portal domain: redirect /marketplace/* to market.
    if (hostname === MARKET_HOST) {
      if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
        // pass through
      } else if (pathname.startsWith('/marketplace')) {
        // Internal Link emissions in the marketplace components carry
        // the `/marketplace` prefix because that's the on-disk Next.js
        // route. Previously this branch returned a 301 to the clean
        // form (`/marketplace/categories/foo` → `/categories/foo`),
        // which made Ahrefs flag every market page as "page-has-links
        // to 3xx redirects" — buyers also paid a redirect-hop latency
        // cost on every category click. We now rewrite (200) to the
        // prefixed form internally instead. The page-level metadata
        // already emits `alternates.canonical` pointing at the clean
        // form, so Google still treats the clean URL as canonical and
        // consolidates link equity there. External callers typing the
        // prefixed URL by hand also get a 200 + canonical hint, same
        // outcome without the 301 leak Ahrefs flagged.
        const cleanPath = pathname.slice('/marketplace'.length) || '/'
        const rewrite = new URL(`/marketplace${cleanPath}${search}`, req.url)
        return withPathHeaders(NextResponse.rewrite(rewrite), cleanPath, search, lang)
      } else if (
        // Portal-only surfaces should never live on the market host. A Clerk
        // redirect, a stale link, or a typed URL otherwise lands on a rewrite
        // to /marketplace/<path>, which doesn't exist → 404. Bounce them to
        // the portal host where these routes are real.
        pathname === '/dashboard' ||
        pathname.startsWith('/dashboard/') ||
        pathname.startsWith('/sign-in') ||
        pathname.startsWith('/sign-up') ||
        pathname.startsWith('/user') ||
        pathname.startsWith('/sellers')
      ) {
        const portalUrl = new URL(pathname + search, `https://${PORTAL_HOST}`)
        return NextResponse.redirect(portalUrl, { status: 302 })
      } else {
        const rewrite = new URL(`/marketplace${pathname}${search}`, req.url)
        return withPathHeaders(NextResponse.rewrite(rewrite), pathname, search, lang)
      }
    } else if (hostname === PORTAL_HOST && pathname.startsWith('/marketplace')) {
      const redirectPath = pathname.slice('/marketplace'.length) || '/'
      const redirectUrl = new URL(redirectPath + search, `https://${MARKET_HOST}`)
      return NextResponse.redirect(redirectUrl, { status: 301 })
    }

    if (pathname !== '/' && isPublicRoute(req)) {
      return withCorsHeaders(withPathHeaders(NextResponse.next(), pathname, search, lang), req)
    }

    const { userId } = await auth()

    if (pathname === '/') {
      if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))
      return withPathHeaders(NextResponse.next(), pathname, search, lang)
    }

    if (!userId) {
      // Cross-origin (or any) fetch to a non-public API path with no
      // session: return 401 JSON. Redirecting to /sign-in breaks
      // browser fetches — preflight to the redirect target fails
      // because the sign-in page doesn't carry CORS headers, and even
      // a successful follow would drop the credentials. The client
      // handles 401 by opening the sign-in modal / lane bridge.
      if (pathname.startsWith('/api/')) {
        const body = JSON.stringify({ error: 'Unauthorized', signInRequired: true })
        return new NextResponse(body, {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeadersFor(req) },
        })
      }
      const lane = req.nextUrl.searchParams.get('lane')
      const laneSegment =
        lane === 'consultant' ? 'consultant'
        : lane === 'admin' ? 'admin'
        : lane === 'attorney' ? 'attorney'
        : 'student'
      const signInUrl = new URL(`/sign-in/${laneSegment}`, req.nextUrl.origin)
      signInUrl.searchParams.set('return_to', `${pathname}${search}`)
      return NextResponse.redirect(signInUrl)
    }

    return withCorsHeaders(withPathHeaders(NextResponse.next(), pathname, search, lang), req)
  },
  {
    authorizedParties: AUTHORIZED_PARTIES.length > 0 ? AUTHORIZED_PARTIES : undefined,
  },
)

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
