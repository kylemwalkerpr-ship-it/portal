import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { auditSiteHealth, repairSiteHealth, type SiteHealthScope } from '@/lib/seoFactory/siteHealth'

export const runtime = 'nodejs'

/**
 * POST /api/content-studio/site-health
 *
 * Audit or repair indexable pages across the connected estate. Repair creates
 * one reviewable branch per repository, adds a deterministic related-guides
 * block to a stable hub, and updates that repository's sitemap route with the
 * same orphan URL set.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = (await request.json().catch(() => ({}))) as { action?: string; scope?: SiteHealthScope; dryRun?: boolean }
    const scope: SiteHealthScope = body.scope === 'caseworks' || body.scope === 'yousafe-consultancy' || body.scope === 'portal' ? body.scope : 'all'
    const action = body.action === 'repair' ? 'repair' : 'audit'
    const result = action === 'repair'
      ? await repairSiteHealth(scope, Boolean(body.dryRun))
      : await auditSiteHealth(scope)
    return NextResponse.json({ ok: true, action, scope, result })
  } catch (err) {
    console.error('[content-studio/site-health]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Site health audit failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: '/api/content-studio/site-health', actions: ['audit', 'repair'], scopes: ['all', 'caseworks', 'yousafe-consultancy', 'portal'] })
}
