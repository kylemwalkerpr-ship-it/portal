/**
 * POST /api/cron/war-room-daily
 *
 * Daily SEO War Room automation (midday Africa/Nairobi via GitHub Actions).
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Body phases (recommended for Worker timeouts — orchestrated by GH workflow):
 *   { phase: "plan", limit?: 5 }
 *   { phase: "run", win: WarOpportunity-like, rank: number, shipMode?, dryRun? }
 *   { phase: "finalize", work: DailyWorkItem[], meta?: {...}, notify?: true }
 *
 * Or single-shot (may timeout on free Workers if AI is slow):
 *   { phase: "all", limit?: 5, shipMode?: "merge", dryRun?: false, notify?: true }
 *
 * GET — latest persisted daily report (requires CRON_SECRET or admin session not required;
 *       uses CRON_SECRET bearer for ops; also accepts admin via requireAdminUser optional).
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  DAILY_WAR_LIMIT,
  formatDailyReportText,
  loadLatestDailyReport,
  notifyDailyReport,
  persistDailyReport,
  runDailyWarRoomBatch,
  runOneDailyWin,
  selectDailyWins,
  type DailyWarRoomReport,
  type DailyWorkItem,
} from '@/lib/seoFactory/dailyWarRoom'
import type { WarOpportunity } from '@/lib/seoFactory/seoWarRoom'

function authorize(req: Request): boolean {
  const expected = process.env.CRON_SECRET
  const provided = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  return Boolean(expected && provided && provided === expected)
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const report = await loadLatestDailyReport()
  if (!report) {
    return NextResponse.json({ ok: true, report: null, message: 'No daily runs stored yet' })
  }
  return NextResponse.json({
    ok: true,
    report,
    text: formatDailyReportText(report),
  })
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const phase = String(body.phase || 'all').toLowerCase()
    const limit = Math.min(10, Math.max(1, Number(body.limit) || DAILY_WAR_LIMIT))
    const shipMode = (String(body.shipMode || 'merge').toLowerCase() || 'merge') as
      | 'merge'
      | 'pr'
      | 'none'
      | 'auto'
      | 'autodeploy'
    const dryRun = Boolean(body.dryRun)
    const notify = body.notify !== false
    const minAuditScore = body.minAuditScore != null ? Number(body.minAuditScore) : 65
    const maxRefine = body.maxRefine != null ? Number(body.maxRefine) : 3

    // ── plan: return top wins only ─────────────────────────────────────────
    if (phase === 'plan') {
      const { wins, source, siteUrl, summary, kpis, skippedRecent } = await selectDailyWins({
        limit,
        // Plan phase already drops recently covered terms so the daily job
        // does not spend AI budget on 4/5 skips + one sticky failure.
        skipRecent: body.skipRecent !== false,
        recentDays: body.recentDays != null ? Number(body.recentDays) : 14,
      })
      return NextResponse.json({
        ok: true,
        phase: 'plan',
        limit,
        source,
        siteUrl,
        summary,
        kpis,
        skippedRecent,
        wins: wins.map((w, i) => ({
          rank: i + 1,
          term: w.term,
          play: w.play,
          priorityScore: w.priorityScore,
          estimatedGainClicks: w.estimatedGainClicks,
          region: w.region,
          contentType: w.contentType,
          writeHint: w.writeHint,
          ownerUrl: w.ownerUrl,
          host: w.host,
          repo: w.repo,
          filePath: w.filePath,
          impressions: w.impressions,
          position: w.position,
          ctr: w.ctr,
          rationale: w.rationale,
        })),
        kenyaHint: 'Schedule: 12:00 Africa/Nairobi = 09:00 UTC',
      })
    }

    // ── run: one win (preferred for timeouts) ──────────────────────────────
    if (phase === 'run') {
      const win = body.win as WarOpportunity | undefined
      if (!win?.term) {
        return NextResponse.json({ error: 'win.term required for phase=run' }, { status: 400 })
      }
      const rank = Number(body.rank) || 1
      const item = await runOneDailyWin({
        win,
        rank,
        shipMode,
        dryRun,
        minAuditScore,
        maxRefine,
        skipRecent: body.skipRecent !== false,
      })
      return NextResponse.json({ ok: true, phase: 'run', item })
    }

    // ── finalize: persist + email report ───────────────────────────────────
    if (phase === 'finalize') {
      const work = (Array.isArray(body.work) ? body.work : []) as DailyWorkItem[]
      const startedAt = String(body.startedAt || new Date().toISOString())
      const finishedAt = new Date().toISOString()
      const runId = String(body.runId || `wr-daily-${startedAt.slice(0, 10)}-${Date.now().toString(36)}`)
      const shippedCount = work.filter((w) => w.ok && !w.skipped).length
      const failedCount = work.filter((w) => !w.ok && !w.skipped).length
      const skippedCount = work.filter((w) => w.skipped).length
      const reportUrls = work
        .map((w) => w.liveUrl || w.prUrl || w.canonicalUrl)
        .filter((u): u is string => Boolean(u))

      const report: DailyWarRoomReport = {
        runId,
        timezone: 'Africa/Nairobi',
        scheduledFor: String(body.scheduledFor || new Date().toISOString()),
        startedAt,
        finishedAt,
        gscSource: String(body.gscSource || 'unknown'),
        siteUrl: (body.siteUrl as string) || null,
        summary: String(
          body.summary ||
            `Daily War Room finalize · shipped ${shippedCount} · failed ${failedCount} · skipped ${skippedCount}`,
        ),
        work,
        shippedCount,
        failedCount,
        skippedCount,
        reportUrls,
      }

      await persistDailyReport(report)
      if (notify) {
        await notifyDailyReport(report).catch((e) =>
          console.warn('[war-room-daily] notify', e instanceof Error ? e.message : e),
        )
      }

      return NextResponse.json({
        ok: true,
        phase: 'finalize',
        report,
        text: formatDailyReportText(report),
      })
    }

    // ── all: single-request batch ──────────────────────────────────────────
    const report = await runDailyWarRoomBatch({
      limit,
      shipMode,
      dryRun,
      minAuditScore,
      maxRefine,
      notify,
      skipRecent: body.skipRecent !== false,
    })

    return NextResponse.json({
      ok: true,
      phase: 'all',
      report,
      text: formatDailyReportText(report),
    })
  } catch (err) {
    console.error('[cron/war-room-daily]', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'War room daily failed' },
      { status: 500 },
    )
  }
}
