import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  auditSiteHealth,
  auditSiteHealthChunked,
  repairSiteHealth,
  repairSiteHealthChunked,
  type SiteHealthScope,
} from '@/lib/seoFactory/siteHealth'

export const runtime = 'nodejs'

/**
 * POST /api/content-studio/site-health
 *
 * Actions:
 *   - audit: full site health audit (use for small repos)
 *   - audit_chunked: batched audit (use when >50 pages to avoid CF subrequest limit)
 *   - repair: full repair (small repos)
 *   - repair_chunked: batched repair (large repos)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = (await request.json().catch(() => ({}))) as {
      action?: string
      scope?: SiteHealthScope
      dryRun?: boolean
      batchStart?: number
      batchSize?: number
    }
    const scope: SiteHealthScope = body.scope === 'caseworks' || body.scope === 'yousafe-consultancy' || body.scope === 'portal' ? body.scope : 'all'
    const action = body.action || 'audit'

    if (action === 'audit_chunked') {
      const batchStart = typeof body.batchStart === 'number' ? body.batchStart : 0
      const batchSize = typeof body.batchSize === 'number' && body.batchSize > 0 && body.batchSize <= 25
        ? body.batchSize
        : 20
      const result = await auditSiteHealthChunked(scope, batchStart, batchSize)
      return NextResponse.json({ ok: true, action, scope, ...result })
    }

    if (action === 'repair_chunked') {
      const batchStart = typeof body.batchStart === 'number' ? body.batchStart : 0
      const batchSize = typeof body.batchSize === 'number' && body.batchSize > 0 && body.batchSize <= 15
        ? body.batchSize
        : 10
      const result = await repairSiteHealthChunked(scope, batchStart, batchSize, Boolean(body.dryRun))
      return NextResponse.json({ ok: true, action, scope, ...result })
    }

    if (action === 'repair') {
      const result = await repairSiteHealth(scope, Boolean(body.dryRun))
      return NextResponse.json({ ok: true, action, scope, result })
    }

    // Default: full audit
    const result = await auditSiteHealth(scope)
    return NextResponse.json({ ok: true, action, scope, result })
  } catch (err) {
    console.error('[content-studio/site-health]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Site health audit failed' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/content-studio/site-health',
    actions: ['audit', 'audit_chunked', 'repair', 'repair_chunked'],
    scopes: ['all', 'caseworks', 'yousafe-consultancy', 'portal'],
    batchDefaults: { audit_batch_size: 20, repair_batch_size: 10 },
  })
}
