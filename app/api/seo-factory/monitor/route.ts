import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { monitorContentJob, monitorRecentJobs } from '@/lib/seoFactory/deployMonitor'

/**
 * GET  /api/seo-factory/monitor?jobId=… — check one job
 * POST /api/seo-factory/monitor
 *   { jobId? } — one job
 *   { scan: true, limit? } — recent jobs with deploy SHAs / PRs
 *
 * Uses Workers AI to diagnose CI failures and opens GitHub issues when possible.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const jobId = request.nextUrl.searchParams.get('jobId')
    if (!jobId) {
      return NextResponse.json({ error: 'jobId required' }, { status: 400 })
    }
    const result = await monitorContentJob(jobId, { openIssueOnFailure: true })
    return NextResponse.json({ ok: result.ok, monitor: result })
  } catch (err) {
    console.error('[seo-factory/monitor GET]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Monitor failed' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    if (body.scan) {
      const results = await monitorRecentJobs(Math.min(15, Number(body.limit) || 8))
      const failed = results.filter((r) => r.checkState === 'failure').length
      const pending = results.filter((r) => r.checkState === 'pending').length
      return NextResponse.json({
        ok: true,
        scanned: results.length,
        failed,
        pending,
        healthy: results.filter((r) => r.action === 'healthy').length,
        results,
        message: `Scanned ${results.length} jobs · ${failed} failing · ${pending} pending`,
      })
    }
    const jobId = String(body.jobId || body.id || '').trim()
    if (!jobId) {
      return NextResponse.json({ error: 'jobId or scan:true required' }, { status: 400 })
    }
    const result = await monitorContentJob(jobId, {
      openIssueOnFailure: body.openIssue !== false,
      waitMs: body.waitMs != null ? Number(body.waitMs) : 0,
    })
    return NextResponse.json({ ok: result.ok, monitor: result })
  } catch (err) {
    console.error('[seo-factory/monitor POST]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Monitor failed' },
      { status: 500 },
    )
  }
}
