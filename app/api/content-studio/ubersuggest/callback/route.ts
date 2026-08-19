import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeUbersuggestCode,
  portalOriginFromRequest,
  readCookieHeader,
  STATE_COOKIE,
  studioConfigureUrl,
  ubersuggestRedirectUri,
  VERIFIER_COOKIE,
} from '@/lib/seoEngine/ubersuggestOAuth'
import { persistUbersuggestConfig, probeUbersuggest } from '@/lib/seoEngine/ubersuggest'

export const dynamic = 'force-dynamic'

function bounce(origin: string, params: Record<string, string>, clearCookies = true) {
  const res = NextResponse.redirect(studioConfigureUrl(origin, params), { status: 302 })
  if (clearCookies) {
    res.cookies.set(STATE_COOKIE, '', { path: '/', maxAge: 0 })
    res.cookies.set(VERIFIER_COOKIE, '', { path: '/', maxAge: 0 })
  }
  return res
}

/**
 * GET /api/content-studio/ubersuggest/callback
 * Completes the MCP OAuth code exchange, probes tools/list, and returns
 * the admin to Content Studio Configure.
 */
export async function GET(req: NextRequest) {
  const origin = portalOriginFromRequest(req)
  const url = new URL(req.url)
  const err = url.searchParams.get('error')
  if (err) {
    return bounce(origin, { uber_error: err === 'access_denied' ? 'Ubersuggest authorization was denied' : err })
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const cookieHeader = req.headers.get('cookie')
  const cookieState = req.cookies.get(STATE_COOKIE)?.value || readCookieHeader(cookieHeader, STATE_COOKIE)
  const verifier = req.cookies.get(VERIFIER_COOKIE)?.value || readCookieHeader(cookieHeader, VERIFIER_COOKIE)

  if (!code) return bounce(origin, { uber_error: 'Ubersuggest MCP returned no authorization code' })
  if (!state || !cookieState || state !== cookieState) {
    return bounce(origin, { uber_error: 'Ubersuggest MCP OAuth state mismatch — start Connect again' })
  }
  if (!verifier) {
    return bounce(origin, { uber_error: 'Ubersuggest MCP PKCE verifier missing — start Connect again' })
  }

  try {
    const redirectUri = ubersuggestRedirectUri(origin)
    const tokens = await exchangeUbersuggestCode({ code, redirectUri, verifier })
    const probe = await probeUbersuggest(tokens.accessToken)
    await persistUbersuggestConfig({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      clientId: tokens.clientId,
      oauth: true,
      enabled: probe.ok,
      connectedAt: probe.ok ? new Date().toISOString() : null,
      lastError: probe.ok ? null : probe.error || 'MCP probe failed after OAuth',
      toolCount: probe.toolCount,
      creditsExhaustedUntil: probe.ok ? null : undefined,
    })
    if (!probe.ok) {
      return bounce(origin, { uber_error: probe.error || 'Authorized, but the MCP probe failed' })
    }
    return bounce(origin, { uber_connected: 'true' })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ubersuggest MCP token exchange failed'
    await persistUbersuggestConfig({ enabled: false, lastError: message, oauth: true }).catch(() => undefined)
    return bounce(origin, { uber_error: message.slice(0, 180) })
  }
}
