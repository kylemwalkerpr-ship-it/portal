import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  auditDeepInterlink,
  listShippedEnrichmentPrs,
  repairDeepInterlink,
  type InterlinkScope,
} from '@/lib/seoFactory/deepInterlink'

export const runtime = 'nodejs'

/**
 * GET /api/content-studio/deep-interlink — return the most recent shipped
 * enrichment PRs per repo so the admin sees prior runs on first paint,
 * without forcing them to re-run an expensive audit. Choose ?scope= for
 * per-repo inspection.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const url = new URL(request.url)
    const scope = parseScope(url.searchParams.get('scope'))
    const shippedRepairs = await listShippedEnrichmentPrs(scope)
    return NextResponse.json({
      ok: true,
      endpoint: '/api/content-studio/deep-interlink',
      actions: ['audit', 'repair'],
      scopes: ['all', 'caseworks', 'yousafe-consultancy', 'portal'],
      scope,
      shippedRepairs,
    })
  } catch (err) {
    console.error('[content-studio/deep-interlink GET]', err)
    return NextResponse.json({ error: 'Deep interlink archive unavailable' }, { status: 500 })
  }
}

/** POST /api/content-studio/deep-interlink — audit or repair cross-domain interlink enrichment */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const body = await request.json().catch(() => ({})) as {
      action?: string; scope?: InterlinkScope; dryRun?: boolean
    }
    const scope = parseScope(body.scope)
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

function parseScope(input: string | null | undefined): InterlinkScope {
  return input === 'caseworks' || input === 'yousafe-consultancy' || input === 'portal'
    ? input
    : 'all'
}
