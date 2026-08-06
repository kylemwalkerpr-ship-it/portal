/**
 * POST /api/content-studio/site-health/repair-single
 *
 * Body: { repo, path, action: 'remove-noindex' | 'add-interlink' | 'ping-live' }
 *
 * Used by the admin-site-health-panel for per-page inline fixes.
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { repairSinglePage } from '@/lib/seoFactory/siteHealthFixes'

export async function POST(request: Request) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const repo = String(body.repo || '').trim()
    const path = String(body.path || '').trim()
    const action = String(body.action || 'remove-noindex').trim() as 'remove-noindex' | 'add-interlink' | 'ping-live'
    if (!repo || !path) {
      return NextResponse.json({ error: 'repo and path are required' }, { status: 400 })
    }
    const result = await repairSinglePage(repo as any, path, action)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[site-health/repair-single]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Single-page repair failed' },
      { status: 500 },
    )
  }
}
