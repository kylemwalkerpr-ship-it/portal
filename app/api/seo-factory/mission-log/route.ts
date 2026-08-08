import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdminUser } from '@/lib/portalAuth'

/**
 * Mission Log — persistent audit trail for the SEO Command Center.
 *
 * Every launch / autopilot / merge / save / refresh run is appended here so the
 * console stays accountable across sessions.
 *
 * GET  /api/seo-factory/mission-log?limit=50&kind=launch&status=success
 *      → { entries: MissionLogEntry[] } newest first.
 * POST /api/seo-factory/mission-log
 *      body: { kind, status, source?, message, detail?, job_id?, pr_url? }
 *      → { entry: MissionLogEntry }
 */

export type MissionLogEntry = {
  id: string
  kind: string
  status: 'success' | 'error' | 'info' | 'warn'
  source: string
  message: string
  detail: Record<string, unknown> | null
  job_id: string | null
  pr_url: string | null
  created_at: string
}

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const SAFE_STATUSES = new Set(['success', 'error', 'info', 'warn'])

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const sp = request.nextUrl.searchParams
    const limit = Math.min(Math.max(Number(sp.get('limit') || 50) || 50, 1), 200)
    const kind = sp.get('kind')
    const status = sp.get('status')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = sb()
      .from('mission_log')
      .select('id, kind, status, source, message, detail, job_id, pr_url, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (kind && kind !== 'all') query = query.eq('kind', String(kind).slice(0, 40))
    if (status && status !== 'all') query = query.eq('status', String(status).slice(0, 12))

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ entries: data || [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'mission log load failed', entries: [] },
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
    const kind = String(body.kind || 'system').slice(0, 40)
    const status = SAFE_STATUSES.has(body.status) ? body.status : 'info'
    const source = String(body.source || 'command').slice(0, 60)
    const message = String(body.message || '').slice(0, 600)
    if (!message.trim()) {
      return NextResponse.json({ error: 'message required' }, { status: 400 })
    }
    const detail =
      body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
        ? body.detail
        : {}
    const jobId = body.job_id ? String(body.job_id).slice(0, 64) : null
    const prUrl = body.pr_url ? String(body.pr_url).slice(0, 700) : null

    const { data, error } = await sb()
      .from('mission_log')
      .insert({
        kind,
        status,
        source,
        message,
        detail,
        job_id: jobId,
        pr_url: prUrl,
      })
      .select('id, kind, status, source, message, detail, job_id, pr_url, created_at')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ entry: data }, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'mission log save failed' },
      { status: 500 },
    )
  }
}
