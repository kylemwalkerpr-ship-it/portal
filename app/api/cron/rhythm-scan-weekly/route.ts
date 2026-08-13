import { NextRequest, NextResponse } from 'next/server'
import { runRhythmScan, listRhythmAlerts } from '@/lib/seoFactory/rhythmScan'

/**
 * POST /api/cron/rhythm-scan-weekly
 * Weekly rhythm scan over stored drafts (triggered by GitHub Actions cron).
 * Scans content_jobs with the REAL quality gate, persists sentence_start_repetition
 * alerts to content_rhythm_alerts, and logs a mission_log audit entry.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * GET — latest persisted alerts + run totals (dashboard source).
 */
function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return Boolean(expected && provided && provided === expected)
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const result = await listRhythmAlerts({ limit: 150 })
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { limit?: number; maxRows?: number }
  try {
    const result = await runRhythmScan({
      limit: typeof body.limit === 'number' ? body.limit : 500,
      maxRows: typeof body.maxRows === 'number' ? body.maxRows : 100,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
