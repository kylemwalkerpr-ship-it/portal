import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { executeCannibalMerge } from '@/lib/seoFactory/cannibalMerge'

/**
 * POST /api/seo-factory/cannibal-merge
 * One-click resolution of a war-room cannibal_merge opportunity.
 * Body: { term, winnerUrl, loserUrls: string[], mode?: 'merge' | 'pr' }
 * Executes 301 redirects + loser noindex/canonical + winner mergedQueries.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const winnerUrl = String(body.winnerUrl || '').trim()
    const loserUrls = Array.isArray(body.loserUrls)
      ? body.loserUrls.map(String)
      : []
    const term = String(body.term || '').trim().slice(0, 160)
    const mode = body.mode === 'pr' ? 'pr' : 'merge'

    const result = await executeCannibalMerge({ term, winnerUrl, loserUrls, mode })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[seo-factory/cannibal-merge]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cannibal merge failed' },
      { status: 500 },
    )
  }
}
