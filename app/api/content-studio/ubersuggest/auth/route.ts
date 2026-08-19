import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  buildUbersuggestAuthorizeUrl,
  discoverUbersuggestAs,
  generateOAuthState,
  generatePkceVerifier,
  oauthCookieOptions,
  portalOriginFromRequest,
  registerUbersuggestClient,
  STATE_COOKIE,
  ubersuggestRedirectUri,
  VERIFIER_COOKIE,
} from '@/lib/seoEngine/ubersuggestOAuth'
import { persistUbersuggestConfig } from '@/lib/seoEngine/ubersuggest'

export const dynamic = 'force-dynamic'

/**
 * GET /api/content-studio/ubersuggest/auth
 * Registers this portal as an MCP OAuth client (DCR), then returns the
 * Ubersuggest authorize URL. Configure redirects the admin there.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const origin = portalOriginFromRequest(req)
    const redirectUri = ubersuggestRedirectUri(origin)
    const as = await discoverUbersuggestAs()
    const { clientId } = await registerUbersuggestClient(redirectUri, as)
    await persistUbersuggestConfig({ clientId, oauth: true }).catch(() => undefined)

    const state = generateOAuthState()
    const verifier = generatePkceVerifier()
    const authUrl = await buildUbersuggestAuthorizeUrl({
      redirectUri,
      state,
      verifier,
      clientId,
      as,
    })

    const res = NextResponse.json({ ok: true, authUrl, redirectUri })
    const cookies = oauthCookieOptions()
    res.cookies.set(STATE_COOKIE, state, cookies)
    res.cookies.set(VERIFIER_COOKIE, verifier, cookies)
    return res
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Ubersuggest MCP authorize failed'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
