import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { buildSeoWarRoom } from '@/lib/seoFactory/seoWarRoom'
import { loadLatestDailyReport } from '@/lib/seoFactory/dailyWarRoom'

/**
 * GET/POST /api/seo-factory/war-room
 * Technician SEO opportunity queue: CTR rewrites, strike distance, cannibal, AEO hubs.
 * Query report=1 → latest daily automation report (work log + URLs).
 */
export async function GET(request: NextRequest) {
  return handle(request)
}
export async function POST(request: NextRequest) {
  return handle(request)
}

async function handle(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const url = new URL(request.url)
    let body: Record<string, unknown> = {}
    if (request.method === 'POST') body = await request.json().catch(() => ({}))

    if (url.searchParams.get('report') === '1' || body.report === true) {
      const daily = await loadLatestDailyReport()
      return NextResponse.json({
        ok: true,
        daily,
        automation: {
          schedule: '12:00 Africa/Nairobi (09:00 UTC)',
          limit: 5,
          workflow: 'war-room-daily.yml',
          cronPath: '/api/cron/war-room-daily',
        },
      })
    }

    const num = (k: string, d: number) => {
      const v = body[k] ?? url.searchParams.get(k)
      const n = v == null || v === '' ? d : Number(v)
      return Number.isFinite(n) ? n : d
    }
    const regionFilter =
      (body.regionFilter as string) || url.searchParams.get('regionFilter') || undefined

    const room = await buildSeoWarRoom({
      days: num('days', 90),
      limit: num('limit', 40),
      minImpressions: num('minImpressions', 3),
      regionFilter: regionFilter || undefined,
    })

    const daily = await loadLatestDailyReport().catch(() => null)

    return NextResponse.json({
      ok: true,
      ...room,
      dailyAutomation: {
        schedule: '12:00 Africa/Nairobi (09:00 UTC)',
        limit: 5,
        lastRun: daily
          ? {
              runId: daily.runId,
              shippedCount: daily.shippedCount,
              failedCount: daily.failedCount,
              scheduledFor: daily.scheduledFor,
              reportUrls: daily.reportUrls,
            }
          : null,
      },
    })
  } catch (err) {
    console.error('[seo-factory/war-room]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'War room failed' },
      { status: 500 },
    )
  }
}
