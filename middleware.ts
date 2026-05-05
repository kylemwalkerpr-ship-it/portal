import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const runtime = 'experimental-edge'

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up', '/api/webhooks', '/api/wallet/diagnose', '/api/translate']

function hasSession(req: NextRequest): boolean {
  return !!(
    req.cookies.get('__session') ??
    req.cookies.get('__clerk_db_jwt') ??
    req.headers.get('authorization')
  )
}

export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname === '/') {
    if (hasSession(req)) return NextResponse.redirect(new URL('/dashboard', req.url))
    return NextResponse.next()
  }

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  )
  if (isPublic) return NextResponse.next()

  if (!hasSession(req)) {
    const lane = req.nextUrl.searchParams.get('lane')
    const signInPath = lane === 'consultant' ? '/sign-in/consultant' : '/sign-in/student'
    const signIn = new URL(signInPath, req.url)
    signIn.searchParams.set('redirect_url', `${pathname}${req.nextUrl.search}`)
    return NextResponse.redirect(signIn)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
