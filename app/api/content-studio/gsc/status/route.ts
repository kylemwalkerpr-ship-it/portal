import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'
import { detectGscAuthMode, serviceAccountEmail } from '@/lib/gscAuth'
import { loadGscSnapshot } from '@/lib/seoDataLoaders'

/**
 * GET /api/content-studio/gsc/status
 * Connection + credential mode for Content Studio GSC panel.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const mode = await detectGscAuthMode()
    const saEmail = serviceAccountEmail()
    const siteUrl = process.env.GSC_SITE_URL ?? null

    const oauthClientConfigured = Boolean(
      (process.env.GOOGLE_CLIENT_ID ||
        process.env.GSC_OAUTH_CLIENT_ID ||
        process.env.GOOGLE_OAUTH_CLIENT_ID) &&
        (process.env.GOOGLE_CLIENT_SECRET ||
          process.env.GSC_OAUTH_CLIENT_SECRET ||
          process.env.GOOGLE_OAUTH_CLIENT_SECRET),
    )
    const saConfigured = Boolean(
      process.env.GSC_SERVICE_ACCOUNT_JSON || process.env.GSC_SERVICE_ACCOUNT_KEY,
    )

    // OAuth token row (content-studio gsc_tokens table)
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

    const snap = await loadGscSnapshot()
    const liveReady = mode !== null || oauthConnected

    return NextResponse.json({
      connected: liveReady,
      mode, // oauth | service_account | null
      siteUrl,
      serviceAccountEmail: saEmail,
      email: oauthEmail || saEmail || undefined,
      oauthConnected,
      oauthEmail,
      oauthClientConfigured,
      saConfigured,
      snapshot: {
        available: true,
        generatedAt: snap.generatedAt ?? null,
        queryCount: snap.totals?.queryCount ?? 0,
        pageCount: snap.totals?.pageCount ?? 0,
      },
      // Operator checklist when live API returns 403
      setup: {
        addServiceAccountToGsc: saConfigured,
        serviceAccountEmail: saEmail ?? 'gsc-reader@yousafe-gsc-reader.iam.gserviceaccount.com',
        properties: [
          'sc-domain:yousafeconsultancy.com (preferred)',
          'https://legal.yousafeconsultancy.com/',
          'https://usa.yousafeconsultancy.com/',
          'https://yousafeconsultancy.com/',
        ],
        // Preferred path is SA (automation). OAuth is optional interactive connect.
        envRequired: saConfigured
          ? ['GSC_SERVICE_ACCOUNT_JSON ✓', 'GSC_SITE_URL']
          : oauthClientConfigured
            ? ['GOOGLE_CLIENT_ID ✓', 'GOOGLE_CLIENT_SECRET ✓', 'Connect OAuth once']
            : [
                'GSC_SERVICE_ACCOUNT_JSON + GSC_SITE_URL (recommended)',
                'OR GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (interactive OAuth)',
              ],
      },
    })
  } catch {
    return NextResponse.json({ connected: false, mode: null })
  }
}
