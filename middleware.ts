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
])

const SUPPORTED_LANGS = new Set(['en', 'es', 'fr', 'ar', 'zh', 'hi', 'pt'])

function resolveLanguage(req: any): string {
  // 1. ?lang= takes priority — set by hreflang variants
  const q = req.nextUrl.searchParams.get('lang')
  if (q && SUPPORTED_LANGS.has(q)) return q
  // 2. Accept-Language header (first supported match)
  const accept = req.headers.get('accept-language')
  if (accept) {
    for (const part of String(accept).split(',')) {
      const code = part.split(';')[0].trim().toLowerCase().slice(0, 2)
      if (SUPPORTED_LANGS.has(code)) return code
    }
  }
  return 'en'
}

// Helper: attach navigation + language headers so server components can read
// them via headers() without re-parsing the URL.
function withPathHeaders(res: NextResponse, pathname: string, search: string, lang: string) {
  res.headers.set('x-pathname', `${pathname}${search}`)
  res.headers.set('x-lang', lang)
  return res
}

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname, search } = req.nextUrl
    const lang = resolveLanguage(req)

    if (pathname !== '/' && isPublicRoute(req)) return withPathHeaders(NextResponse.next(), pathname, search, lang)

    const { userId } = await auth()

    if (pathname === '/') {
      if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))
      return withPathHeaders(NextResponse.next(), pathname, search, lang)
    }

    if (!userId) {
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

    return withPathHeaders(NextResponse.next(), pathname, search, lang)
  },
  {
    authorizedParties: AUTHORIZED_PARTIES.length > 0 ? AUTHORIZED_PARTIES : undefined,
  },
)

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
