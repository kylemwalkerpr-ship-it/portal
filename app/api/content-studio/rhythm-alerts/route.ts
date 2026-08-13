import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { listRhythmAlerts } from '@/lib/seoFactory/rhythmScan'

export const runtime = 'nodejs'

/**
 * GET /api/content-studio/rhythm-alerts
 * Latest sentence_start_repetition alerts from the weekly rhythm scan,
 * for the admin dashboard panel. Admin-only (Clerk).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    const limitParam = Number(request.nextUrl.searchParams.get('limit') || 150)
    const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 150
    const result = await listRhythmAlerts({ limit })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
