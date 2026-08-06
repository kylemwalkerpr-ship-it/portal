/**
 * POST /api/content-studio/site-health/full
 *
 * Body: { dryRun?: boolean, scope?: SiteHealthScope, fixOrphans?: boolean,
 *         fixNoindex?: boolean, fixSitemaps?: boolean, verifyLive?: boolean,
 *         batchSize?: number }
 *
 * Calls the full Site Health orchestrator (runFullSiteHealthCheck).
 * Used by the admin-site-health-panel UI.
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { runFullSiteHealthCheck } from '@/lib/seoFactory/siteHealthComplete'

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const report = await runFullSiteHealthCheck({
      scope: body.scope ?? 'all',
      dryRun: body.dryRun !== false,
      fixOrphans: Boolean(body.fixOrphans),
      fixNoindex: Boolean(body.fixNoindex),
      fixSitemaps: Boolean(body.fixSitemaps),
      verifyLive: Boolean(body.verifyLive),
      batchSize: body.batchSize ?? 25,
    })
    return NextResponse.json(report)
  } catch (err) {
    console.error('[site-health/full]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Site health check failed' },
      { status: 500 },
    )
  }
}
