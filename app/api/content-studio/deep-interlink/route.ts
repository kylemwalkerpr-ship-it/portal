import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  auditDeepInterlink,
  repairDeepInterlink,
  type InterlinkScope,
} from '@/lib/seoFactory/deepInterlink'

export const runtime = 'nodejs'

/** POST /api/content-studio/deep-interlink — audit or repair cross-domain interlink enrichment */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = await request.json().catch(() => ({})) as {
      action?: string; scope?: InterlinkScope; dryRun?: boolean
    }
    const scope: InterlinkScope =
      body.scope === 'caseworks' || body.scope === 'yousafe-consultancy' || body.scope === 'portal'
        ? body.scope : 'all'
    const action = body.action === 'repair' ? 'repair' : 'audit'
    if (action === 'repair') {
      const { report, repairs, dryRun } = await repairDeepInterlink(scope, Boolean(body.dryRun))
      return NextResponse.json({ ok: true, action, scope, report, repairs, dryRun })
    }
    const report = await auditDeepInterlink(scope)
    return NextResponse.json({ ok: true, action: 'audit', scope, report })
  } catch (err) {
    console.error('[content-studio/deep-interlink]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Deep interlink audit failed' },
      { status: 500 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/content-studio/deep-interlink',
    actions: ['audit', 'repair'],
    scopes: ['all', 'caseworks', 'yousafe-consultancy', 'portal'],
  })
}
