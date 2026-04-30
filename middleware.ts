import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/sign-in', '/sign-up']

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
    const signIn = new URL('/sign-in', req.url)
    signIn.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signIn)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
}
