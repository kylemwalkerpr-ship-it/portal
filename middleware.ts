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

// Helper: attach the current pathname + search to a NextResponse as a header
// so server components (e.g. HreflangTags) can construct accurate canonical
// URLs without parsing the URL themselves.
function withPathHeaders(res: NextResponse, pathname: string, search: string) {
  res.headers.set('x-pathname', `${pathname}${search}`)
  return res
}

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname, search } = req.nextUrl

    if (pathname !== '/' && isPublicRoute(req)) return withPathHeaders(NextResponse.next(), pathname, search)

    const { userId } = await auth()

    if (pathname === '/') {
      if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))
      return withPathHeaders(NextResponse.next(), pathname, search)
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

    return withPathHeaders(NextResponse.next(), pathname, search)
  },
  {
    authorizedParties: AUTHORIZED_PARTIES.length > 0 ? AUTHORIZED_PARTIES : undefined,
  },
)

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
