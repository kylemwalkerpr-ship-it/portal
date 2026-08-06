/**
 * POST /api/content-studio/site-health/history
 *
 * Returns the fix history log (last 100 entries).
 */
import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { readFixHistory } from '@/lib/seoFactory/siteHealthFixes'

export async function POST() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const history = await readFixHistory()
    return NextResponse.json({ history: history.slice(-100) })
  } catch (err) {
    console.error('[site-health/history]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'History load failed' },
      { status: 500 },
    )
  }
}
