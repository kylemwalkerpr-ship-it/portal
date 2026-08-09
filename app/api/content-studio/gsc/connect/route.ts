import { NextRequest, NextResponse } from 'next/server'
import { getGscAccessToken } from '@/lib/gsc-service-account'
import { getGscConfig, saveGscConnection } from '@/lib/gscConfig'
import { probeLiveGsc, __resetGscProbeCache } from '@/lib/gscConnectProbe'

/**
 * POST /api/content-studio/gsc/connect
 * Connects GSC using a service account — either a pasted JSON key (the
 * "Service account" tab in the connect modal) or the env-configured key.
 * Verifies the service account can access the given site URL, then stores
 * the configuration.
 *
 * Body: { siteUrl: string, serviceAccountKey?: string }
 *
 * No OAuth redirects needed — service account auth is server-to-server.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const siteUrl =
      typeof body.siteUrl === 'string' ? body.siteUrl.trim() : body.siteUrl
    const serviceAccountKey =
      typeof body.serviceAccountKey === 'string' && body.serviceAccountKey.trim()
        ? body.serviceAccountKey.trim()
        : process.env.GSC_SERVICE_ACCOUNT_KEY ||
          process.env.GSC_SERVICE_ACCOUNT_JSON ||
          null

    if (!serviceAccountKey) {
      return NextResponse.json(
        { error: 'No service account key available — paste a service account JSON key or configure GSC_SERVICE_ACCOUNT_KEY' },
        { status: 400 },
      )
    }

    if (!siteUrl) {
      return NextResponse.json(
        { error: 'siteUrl is required (e.g. https://caseworks.com/ or sc-domain:caseworks.com)' },
        { status: 400 },
      )
    }

    // Get an access token from the service account (pasted key or env key)
    const accessToken = await getGscAccessToken(serviceAccountKey)

    // Verify the service account can access this GSC property
    // by making a test query against the site
    const encodedSite = encodeURIComponent(siteUrl)
    const testUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`

    const testRes = await fetch(testUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate: '7daysAgo',
        endDate: 'today',
        dimensions: ['query'],
        rowLimit: 1,
      }),
    })

    if (!testRes.ok) {
      const errText = await testRes.text()
      let message = `Cannot access GSC property "${siteUrl}". `

      if (errText.includes('403') || errText.includes('forbidden')) {
        message += `Add gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com as a user in Search Console → Settings → Users for this property.`
      } else if (errText.includes('404') || errText.includes('not found')) {
        message += `This site is not registered in Google Search Console. Add it first.`
      } else {
        message += `API error: ${errText.slice(0, 200)}`
      }

      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Persist into public.gsc_connection (the row the runtime auth resolver
    // reads — gsc_tokens has no site_url column and was never consulted).
    let serviceAccountEmail = ''
    try {
      const key = JSON.parse(serviceAccountKey)
      serviceAccountEmail = key.client_email ?? ''
    } catch {
      // key parsing failed — still store what we can
    }

    try {
      await saveGscConnection({
        site_url: siteUrl,
        connected_email: serviceAccountEmail || 'service-account',
        // A pasted key must be stored so the runtime auth resolver can mint
        // tokens without any env config; env keys are resolved by
        // getGscConfig()'s fallback chain, so overwriting the column with the
        // same key is harmless.
        service_account_key: serviceAccountKey,
      })
      // A fresh connection invalidates the cached probe so the card doesn't
      // flash a stale token failure right after connecting.
      __resetGscProbeCache()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'persist failed'
      console.error('[gsc/connect] Supabase error:', msg)
      return NextResponse.json({ error: `Failed to store config: ${msg}` }, { status: 500 })
    }

    return NextResponse.json({
      connected: true,
      siteUrl,
      email: serviceAccountEmail || 'service-account',
      mode: 'service_account',
    })
  } catch (err) {
    console.error('[gsc/connect]', err)
    const msg = err instanceof Error ? err.message : 'Internal error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * GET /api/content-studio/gsc/connect
 * Returns LIVE connection status: whether a property is configured, whether
 * an access token can be minted right now, what's missing, and since when.
 * The Systems card polls this so the connect state stays current.
 */
export async function GET() {
  try {
    const cfg = await getGscConfig()
    const connected = Boolean(cfg.siteUrl)
    const { live, error: probeError } = await probeLiveGsc()
    const saConfigured = Boolean(cfg.serviceAccountKey)
    const missing: string[] = []
    // Service-account mode needs only a site URL; OAuth needs the client bundle.
    if (saConfigured) {
      if (!cfg.siteUrl) missing.push('site_url')
    } else {
      if (!cfg.clientId) missing.push('client_id')
      if (!cfg.clientSecret) missing.push('client_secret')
      if (!cfg.refreshToken) missing.push('refresh_token')
      if (!cfg.siteUrl) missing.push('site_url')
    }
    return NextResponse.json({
      connected,
      live,
      // OAuth is getGscAccess()'s priority #1 — label the live path by it
      // even if an SA key is also stored (saConfigured only drives missing[]).
      mode: connected ? (cfg.refreshToken ? 'oauth' : 'service_account') : null,
      email: cfg.connectedEmail ?? null,
      siteUrl: cfg.siteUrl,
      connectedAt: cfg.connectedAt ?? null,
      missing,
      error: probeError,
    })
  } catch (e) {
    return NextResponse.json({
      connected: false,
      live: false,
      mode: null,
      email: null,
      siteUrl: null,
      connectedAt: null,
      missing: [],
      error: e instanceof Error ? e.message : 'connect status unavailable',
    })
  }
}
