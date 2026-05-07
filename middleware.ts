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
  '/api/wallet/diagnose',
  '/api/translate(.*)',
  '/api/chat(.*)',
])

export default clerkMiddleware(
  async (auth, req) => {
    const { pathname, search } = req.nextUrl
    const { userId } = await auth()

    if (pathname === '/') {
      if (userId) return NextResponse.redirect(new URL('/dashboard', req.url))
      return NextResponse.next()
    }

    if (isPublicRoute(req)) return NextResponse.next()

    if (!userId) {
      const lane = req.nextUrl.searchParams.get('lane')
      const laneSegment =
        lane === 'consultant' ? 'consultant' : lane === 'admin' ? 'admin' : 'student'
      const signInUrl = new URL(`/sign-in/${laneSegment}`, req.nextUrl.origin)
      return NextResponse.redirect(signInUrl)
    }

    return NextResponse.next()
  },
  {
    authorizedParties: AUTHORIZED_PARTIES.length > 0 ? AUTHORIZED_PARTIES : undefined,
  },
)

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
