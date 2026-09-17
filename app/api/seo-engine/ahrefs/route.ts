import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  fetchAhrefsSiteAudit,
  loadLatestAhrefsSnapshot,
  persistAhrefsSnapshot,
  resolveAhrefsProjectId,
} from '@/lib/seoEngine/ahrefsAudit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const expectedProjectId = resolveAhrefsProjectId()
  const snap = await loadLatestAhrefsSnapshot({ projectId: expectedProjectId })
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.AHREFS_API_KEY),
    expectedProjectId,
    identityMatch: snap ? snap.projectId === expectedProjectId : false,
    snapshotIsFallback: snap ? snap.source === 'fallback' : true,
    snapshot: snap,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string
    date?: string
    dateCompared?: string
    action?: string
    issues?: Array<{ name?: string; issue?: string; count: number; previous?: number; importance?: string }>
  }
  if (body.action === 'indexnow') {
    const { submitSitemapToIndexNow } = await import('@/lib/indexNow')
    const r = await submitSitemapToIndexNow('https://legal.yousafeconsultancy.com/sitemap.xml')
    return NextResponse.json({ ok: true, indexNow: r })
  }
  try {
    if (Array.isArray(body.issues) && body.issues.length) {
      const { snapshotFromOverview } = await import('@/lib/seoEngine/ahrefsAudit')
      const snap = snapshotFromOverview(body.issues, {
        projectId: resolveAhrefsProjectId(body.projectId),
        date: body.date || new Date().toISOString(),
        dateCompared: body.dateCompared || null,
        source: 'manual',
      })
      const r = await persistAhrefsSnapshot(snap)
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
      return NextResponse.json({ ok: true, snapshot: snap, source: 'manual' })
    }
    const snap = await fetchAhrefsSiteAudit(body)
    const r = await persistAhrefsSnapshot(snap)
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 })
    return NextResponse.json({ ok: true, snapshot: snap })
  } catch (e) {
    // Never persist the hardcoded fallback crawl as if it were fresh — a stale
    // snapshot in the DB would bury the last real measurement. Fail loudly.
    const { fallbackLegalAhrefsSnapshot } = await import('@/lib/seoEngine/ahrefsAudit')
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : 'Ahrefs fetch failed',
      lastKnown: fallbackLegalAhrefsSnapshot(),
    }, { status: 502 })
  }
}
