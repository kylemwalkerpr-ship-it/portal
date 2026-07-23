/**
 * Daily War Room automation — top 5 ranking-gain plays → generate → quality gates → ship.
 * Invoked by /api/cron/war-room-daily at midday Africa/Nairobi (via GitHub Actions).
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import {
  buildSeoWarRoom,
  playToOpportunityAction,
  type WarOpportunity,
  type WarPlay,
} from './seoWarRoom'
import {
  loadRecentPrimaryKeywords,
  runSeoFactoryPipeline,
  type RequestedShipMode,
} from './pipeline'

export const DAILY_WAR_LIMIT = 5
/** Midday Kenya = 12:00 EAT = 09:00 UTC */
export const KENYA_MIDDAY_UTC_CRON = '0 9 * * *'

export interface DailyWorkItem {
  rank: number
  term: string
  play: string
  priorityScore: number
  estimatedGainClicks: number
  region: string
  contentType: string
  ok: boolean
  jobId?: string | null
  canonicalUrl?: string | null
  liveUrl?: string | null
  prUrl?: string | null
  filePath?: string | null
  host?: string | null
  repo?: string | null
  auditScore?: number | null
  wordCount?: number | null
  humanScore?: number | null
  shipStatus?: string | null
  error?: string | null
  skipped?: boolean
  skipReason?: string | null
}

export interface DailyWarRoomReport {
  runId: string
  timezone: 'Africa/Nairobi'
  scheduledFor: string
  startedAt: string
  finishedAt: string
  gscSource: string
  siteUrl: string | null
  summary: string
  work: DailyWorkItem[]
  shippedCount: number
  failedCount: number
  skippedCount: number
  reportUrls: string[]
}

function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function kenyaNowIso(): string {
  return new Date().toLocaleString('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

function liveUrlFromCanonical(canonical: string | null | undefined): string | null {
  if (!canonical) return null
  try {
    const u = new URL(canonical)
    return u.toString()
  } catch {
    return canonical
  }
}

/** Top N war-room plays excluding cannibal (needs human path choice). */
export async function selectDailyWins(opts?: {
  limit?: number
  days?: number
}): Promise<{
  wins: WarOpportunity[]
  source: string
  siteUrl: string | null
  summary: string
  kpis: Record<string, unknown>
}> {
  const limit = Math.min(10, Math.max(1, opts?.limit ?? DAILY_WAR_LIMIT))
  const room = await buildSeoWarRoom({
    days: opts?.days ?? 90,
    limit: 60,
    minImpressions: 2,
  })
  const wins = room.queue
    .filter((o) => o.play !== 'cannibal_merge' && o.play !== 'ignore_noise')
    .slice(0, limit)
  return {
    wins,
    source: room.source,
    siteUrl: room.siteUrl,
    summary: room.summary,
    kpis: room.kpis as unknown as Record<string, unknown>,
  }
}

export async function runOneDailyWin(opts: {
  win: WarOpportunity
  rank: number
  shipMode?: RequestedShipMode
  dryRun?: boolean
  minAuditScore?: number
  maxRefine?: number
  userId?: string
  skipRecent?: boolean
}): Promise<DailyWorkItem> {
  const {
    win,
    rank,
    shipMode = 'merge',
    dryRun = false,
    minAuditScore = 65,
    maxRefine = 3,
    userId = 'system:war-room-daily',
    skipRecent = true,
  } = opts

  const base: DailyWorkItem = {
    rank,
    term: win.term,
    play: win.play,
    priorityScore: win.priorityScore,
    estimatedGainClicks: win.estimatedGainClicks,
    region: win.region,
    contentType: win.contentType,
    ok: false,
    canonicalUrl: win.ownerUrl,
    liveUrl: liveUrlFromCanonical(win.ownerUrl),
    host: win.host,
    repo: win.repo,
    filePath: win.filePath,
  }

  try {
    if (skipRecent) {
      const recent = await loadRecentPrimaryKeywords(14)
      if (recent.has(win.term.toLowerCase())) {
        return {
          ...base,
          skipped: true,
          skipReason: 'Recently covered (14d)',
          ok: true,
        }
      }
    }

    const result = await runSeoFactoryPipeline({
      topic: win.term,
      title: win.term,
      primaryKeyword: win.term,
      region: win.region || 'US',
      contentType: win.contentType || 'legal_guide',
      tone: 'educational',
      shipMode,
      dryRun,
      minAuditScore,
      maxRefine,
      opportunityAction: playToOpportunityAction(win.play as WarPlay),
      writeHint: win.writeHint,
      userId,
    })

    const canonical = result.plan.canonicalUrl || win.ownerUrl
    return {
      ...base,
      ok: result.ok && !result.shipError && meetsSoftShip(result.ship?.status),
      jobId: result.jobId,
      canonicalUrl: canonical,
      liveUrl: liveUrlFromCanonical(canonical),
      prUrl: result.ship?.prUrl || null,
      filePath: result.plan.filePath,
      host: result.plan.host,
      repo: result.plan.repo,
      auditScore: result.audit.score,
      wordCount: result.audit.wordCount,
      humanScore: result.audit.humanScore ?? null,
      shipStatus: result.ship?.status || (result.shipError ? 'error' : result.shipMode),
      error: result.shipError || result.error || null,
    }
  } catch (e) {
    return {
      ...base,
      ok: false,
      error: e instanceof Error ? e.message : 'Failed',
    }
  }
}

function meetsSoftShip(status?: string): boolean {
  if (!status) return false
  return ['deployed', 'merged', 'pr_created', 'dry_run'].includes(status)
}

/** Full daily batch (use from long-timeout environments; Workers may prefer per-item). */
export async function runDailyWarRoomBatch(opts?: {
  limit?: number
  shipMode?: RequestedShipMode
  dryRun?: boolean
  minAuditScore?: number
  maxRefine?: number
  skipRecent?: boolean
  notify?: boolean
}): Promise<DailyWarRoomReport> {
  const startedAt = new Date().toISOString()
  const runId = `wr-daily-${startedAt.slice(0, 10)}-${Date.now().toString(36)}`
  const limit = opts?.limit ?? DAILY_WAR_LIMIT

  const { wins, source, siteUrl, summary } = await selectDailyWins({ limit })
  const work: DailyWorkItem[] = []

  for (let i = 0; i < wins.length; i++) {
    const item = await runOneDailyWin({
      win: wins[i],
      rank: i + 1,
      shipMode: opts?.shipMode ?? 'merge',
      dryRun: opts?.dryRun,
      minAuditScore: opts?.minAuditScore,
      maxRefine: opts?.maxRefine,
      skipRecent: opts?.skipRecent !== false,
    })
    work.push(item)
  }

  // Pad skipped empty queue
  if (!wins.length) {
    work.push({
      rank: 0,
      term: '(none)',
      play: 'none',
      priorityScore: 0,
      estimatedGainClicks: 0,
      region: '—',
      contentType: '—',
      ok: true,
      skipped: true,
      skipReason: 'War Room returned no actionable plays',
    })
  }

  const finishedAt = new Date().toISOString()
  const shippedCount = work.filter((w) => w.ok && !w.skipped && w.shipStatus && w.shipStatus !== 'error').length
  const failedCount = work.filter((w) => !w.ok && !w.skipped).length
  const skippedCount = work.filter((w) => w.skipped).length
  const reportUrls = work
    .map((w) => w.liveUrl || w.prUrl || w.canonicalUrl)
    .filter((u): u is string => Boolean(u))

  const report: DailyWarRoomReport = {
    runId,
    timezone: 'Africa/Nairobi',
    scheduledFor: kenyaNowIso(),
    startedAt,
    finishedAt,
    gscSource: source,
    siteUrl,
    summary: [
      `Daily War Room · ${kenyaNowIso()} EAT · top ${limit} wins.`,
      summary,
      `Shipped ${shippedCount} · failed ${failedCount} · skipped ${skippedCount}.`,
    ].join(' '),
    work,
    shippedCount,
    failedCount,
    skippedCount,
    reportUrls,
  }

  await persistDailyReport(report)
  if (opts?.notify !== false) {
    await notifyDailyReport(report).catch((e) =>
      console.warn('[dailyWarRoom] notify failed', e instanceof Error ? e.message : e),
    )
  }
  return report
}

export async function persistDailyReport(report: DailyWarRoomReport): Promise<void> {
  try {
    const sb = supabase()
    await sb.from('war_room_daily_runs').upsert(
      {
        run_id: report.runId,
        scheduled_for: report.scheduledFor,
        started_at: report.startedAt,
        finished_at: report.finishedAt,
        gsc_source: report.gscSource,
        site_url: report.siteUrl,
        summary: report.summary,
        work_json: report.work,
        shipped_count: report.shippedCount,
        failed_count: report.failedCount,
        skipped_count: report.skippedCount,
        report_urls: report.reportUrls,
      },
      { onConflict: 'run_id' },
    )
  } catch (e) {
    // Table may not exist yet — fall back to admin_audit_log
    console.warn('[dailyWarRoom] persist war_room_daily_runs', e)
    try {
      await supabase().from('admin_audit_log').insert({
        admin_id: null,
        action_type: 'war_room_daily',
        target_table: 'content_jobs',
        target_id: report.runId,
        payload_snapshot: report,
        reason: report.summary.slice(0, 500),
      })
    } catch {
      /* non-fatal */
    }
  }
}

export async function loadLatestDailyReport(): Promise<DailyWarRoomReport | null> {
  try {
    const { data } = await supabase()
      .from('war_room_daily_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    return {
      runId: data.run_id,
      timezone: 'Africa/Nairobi',
      scheduledFor: data.scheduled_for,
      startedAt: data.started_at,
      finishedAt: data.finished_at,
      gscSource: data.gsc_source,
      siteUrl: data.site_url,
      summary: data.summary,
      work: data.work_json || [],
      shippedCount: data.shipped_count,
      failedCount: data.failed_count,
      skippedCount: data.skipped_count,
      reportUrls: data.report_urls || [],
    }
  } catch {
    return null
  }
}

export function formatDailyReportHtml(report: DailyWarRoomReport): string {
  const rows = report.work
    .map((w) => {
      const url = w.liveUrl || w.prUrl || w.canonicalUrl || '—'
      const status = w.skipped
        ? `skipped (${w.skipReason || '—'})`
        : w.ok
          ? w.shipStatus || 'ok'
          : w.error || 'failed'
      const link =
        url.startsWith('http')
          ? `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`
          : escapeHtml(url)
      return `<tr>
        <td style="padding:8px;border:1px solid #e5e7eb">${w.rank}</td>
        <td style="padding:8px;border:1px solid #e5e7eb"><strong>${escapeHtml(w.term)}</strong><br/><span style="color:#6b7280;font-size:12px">${escapeHtml(w.play)} · prio ${w.priorityScore} · +~${w.estimatedGainClicks} clicks</span></td>
        <td style="padding:8px;border:1px solid #e5e7eb">${escapeHtml(status)}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${w.auditScore ?? '—'} / ${w.wordCount ?? '—'}w / human ${w.humanScore ?? '—'}</td>
        <td style="padding:8px;border:1px solid #e5e7eb">${link}</td>
      </tr>`
    })
    .join('\n')

  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.45">
  <h2 style="color:#3C3B6E">SEO War Room — daily report</h2>
  <p><strong>Kenya time:</strong> ${escapeHtml(report.scheduledFor)} EAT<br/>
  <strong>Run:</strong> ${escapeHtml(report.runId)}<br/>
  <strong>GSC:</strong> ${escapeHtml(report.gscSource)} · ${escapeHtml(report.siteUrl || '—')}<br/>
  <strong>Shipped:</strong> ${report.shippedCount} · <strong>Failed:</strong> ${report.failedCount} · <strong>Skipped:</strong> ${report.skippedCount}</p>
  <p style="color:#4b5563">${escapeHtml(report.summary)}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
    <thead>
      <tr style="background:#F4F2EE;text-align:left">
        <th style="padding:8px;border:1px solid #e5e7eb">#</th>
        <th style="padding:8px;border:1px solid #e5e7eb">Play / term</th>
        <th style="padding:8px;border:1px solid #e5e7eb">Status</th>
        <th style="padding:8px;border:1px solid #e5e7eb">Audit / words / human</th>
        <th style="padding:8px;border:1px solid #e5e7eb">URL</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <h3 style="margin-top:24px">All URLs</h3>
  <ol>
    ${report.reportUrls.map((u) => `<li><a href="${escapeHtml(u)}">${escapeHtml(u)}</a></li>`).join('\n') || '<li>(none)</li>'}
  </ol>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Automated at midday Africa/Nairobi · portal.yousafeconsultancy.com</p>
</body></html>`
}

export function formatDailyReportText(report: DailyWarRoomReport): string {
  const lines = [
    `SEO War Room daily · ${report.scheduledFor} EAT`,
    report.summary,
    `Shipped ${report.shippedCount} · failed ${report.failedCount} · skipped ${report.skippedCount}`,
    '',
    'Work log:',
  ]
  for (const w of report.work) {
    const url = w.liveUrl || w.prUrl || w.canonicalUrl || '—'
    const status = w.skipped ? `skipped:${w.skipReason}` : w.ok ? w.shipStatus : w.error
    lines.push(
      `${w.rank}. [${w.play}] ${w.term} → ${status} · ${url}`,
    )
  }
  lines.push('', 'URLs:')
  for (const u of report.reportUrls) lines.push(`- ${u}`)
  return lines.join('\n')
}

export async function notifyDailyReport(report: DailyWarRoomReport): Promise<void> {
  const raw =
    process.env.WAR_ROOM_REPORT_EMAIL ||
    process.env.SEO_REPORT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    ''
  const recipients = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
  if (!recipients.length) {
    console.warn('[dailyWarRoom] No WAR_ROOM_REPORT_EMAIL / SEO_REPORT_EMAIL / ADMIN_EMAIL — report not emailed')
    return
  }
  const subject = `[War Room] Daily ${report.shippedCount}/${report.work.filter((w) => !w.skipped).length || report.work.length} shipped · ${report.scheduledFor} EAT`
  const html = formatDailyReportHtml(report)
  for (const to of recipients) {
    await sendEmail({ to, subject, html })
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
