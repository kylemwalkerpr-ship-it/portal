import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { detectGscAuthMode, getGscAccess, serviceAccountEmail } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'

function envPresent(...names: string[]): boolean {
  return names.some((n) => Boolean((process.env[n] || '').trim()))
}

/**
 * GET /api/content-studio/gsc/status
 * Connection + credential mode for Content Studio GSC panel.
 *
 * IMPORTANT: Service account alone is enough for factory/War Room live GSC.
 * Interactive OAuth (GOOGLE_CLIENT_*) is optional.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const hasGoogleClientId = envPresent(
      'GOOGLE_CLIENT_ID',
      'GSC_OAUTH_CLIENT_ID',
      'GOOGLE_OAUTH_CLIENT_ID',
    )
    const hasGoogleClientSecret = envPresent(
      'GOOGLE_CLIENT_SECRET',
      'GSC_OAUTH_CLIENT_SECRET',
      'GOOGLE_OAUTH_CLIENT_SECRET',
    )
    const oauthClientConfigured = hasGoogleClientId && hasGoogleClientSecret
    const saConfigured = envPresent('GSC_SERVICE_ACCOUNT_JSON', 'GSC_SERVICE_ACCOUNT_KEY')
    const hasRefreshToken = envPresent('GSC_OAUTH_REFRESH_TOKEN')
    const siteUrl = process.env.GSC_SITE_URL ?? null

    let mode: Awaited<ReturnType<typeof detectGscAuthMode>> = null
    let saEmail: string | null = null
    let liveOk = false
    let liveDetail: string | null = null
    try {
      mode = await detectGscAuthMode()
      saEmail = serviceAccountEmail()
      // Prove live token mint (same path as War Room / factory)
      const access = await getGscAccess()
      if (access?.accessToken) {
        liveOk = true
        liveDetail = `${access.mode} · ${access.siteUrl || siteUrl || 'no siteUrl'}`
        mode = access.mode
      } else {
        liveDetail = 'Credentials present but token mint returned null'
      }
    } catch (e) {
      liveDetail = e instanceof Error ? e.message.slice(0, 160) : 'token mint failed'
    }

    // OAuth token row (content-studio gsc_tokens table) — interactive Connect
    let oauthConnected = false
    let oauthEmail: string | null = null
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      )
      const { data } = await supabase
        .from('gsc_tokens')
        .select('google_email, expires_at, updated_at')
        .eq('id', 'default')
        .maybeSingle()
      if (data) {
        oauthConnected = true
        oauthEmail = data.google_email
      }
    } catch {
      /* table may not exist yet */
    }

    let snap: Awaited<ReturnType<typeof loadGscSnapshot>> | null = null
    try {
      snap = await loadGscSnapshot()
    } catch {
      /* snapshot optional */
    }

    // Connected if we can mint a live token OR have interactive OAuth row
    // SA on Worker = enough for automation (don't force OAuth button)
    const connected = liveOk || oauthConnected || (saConfigured && Boolean(siteUrl))

    return NextResponse.json({
      connected,
      mode: mode || (saConfigured ? 'service_account' : oauthConnected ? 'oauth' : null),
      siteUrl,
      serviceAccountEmail: saEmail,
      email: oauthEmail || saEmail || undefined,
      oauthConnected,
      oauthEmail,
      oauthClientConfigured,
      saConfigured,
      hasRefreshToken,
      liveOk,
      liveDetail,
      env: {
        GOOGLE_CLIENT_ID: hasGoogleClientId,
        GOOGLE_CLIENT_SECRET: hasGoogleClientSecret,
        GSC_SERVICE_ACCOUNT_JSON: saConfigured,
        GSC_SITE_URL: Boolean((siteUrl || '').trim()),
        GSC_OAUTH_REFRESH_TOKEN: hasRefreshToken,
      },
      snapshot: {
        available: Boolean(snap),
        generatedAt: snap?.generatedAt ?? null,
        queryCount: snap?.totals?.queryCount ?? 0,
        pageCount: snap?.totals?.pageCount ?? 0,
      },
      setup: {
        addServiceAccountToGsc: saConfigured && !liveOk,
        serviceAccountEmail: saEmail ?? 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
        properties: [
          'sc-domain:yousafeconsultancy.com (preferred)',
          'https://legal.yousafeconsultancy.com/',
          'https://usa.yousafeconsultancy.com/',
          'https://yousafeconsultancy.com/',
        ],
        envRequired: connected
          ? liveOk
            ? [`Live GSC OK (${liveDetail})`]
            : ['SA/OAuth secrets present — if data fails, add SA email to GSC properties']
          : [
              'Set Worker secret GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL (recommended)',
              'OR set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET and click Connect',
            ],
        note:
          'Interactive OAuth is optional. Factory / War Room use the service account when configured.',
      },
    })
  } catch (e) {
    return NextResponse.json({
      connected: false,
      mode: null,
      error: e instanceof Error ? e.message : 'status failed',
      oauthClientConfigured: false,
      saConfigured: false,
    })
  }
}
