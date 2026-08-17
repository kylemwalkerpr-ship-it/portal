import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  fetchAhrefsSiteAudit,
  loadLatestAhrefsSnapshot,
  persistAhrefsSnapshot,
} from '@/lib/seoEngine/ahrefsAudit'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const snap = await loadLatestAhrefsSnapshot()
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.AHREFS_API_KEY),
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
      const { snapshotFromOverview, persistAhrefsSnapshot: persist } = await import('@/lib/seoEngine/ahrefsAudit')
      const snap = snapshotFromOverview(body.issues, {
        projectId: String(body.projectId || '9902912'),
        date: body.date || new Date().toISOString(),
        dateCompared: body.dateCompared || null,
        source: 'manual',
      })
      await persist(snap)
      return NextResponse.json({ ok: true, snapshot: snap, source: 'manual' })
    }
    const snap = await fetchAhrefsSiteAudit(body)
    await persistAhrefsSnapshot(snap)
    return NextResponse.json({ ok: true, snapshot: snap })
  } catch (e) {
    const { fallbackLegalAhrefsSnapshot, persistAhrefsSnapshot: persist } = await import('@/lib/seoEngine/ahrefsAudit')
    const snap = fallbackLegalAhrefsSnapshot()
    await persist(snap).catch(() => {})
    return NextResponse.json({
      ok: true,
      snapshot: snap,
      source: 'fallback',
      warning: e instanceof Error ? e.message : 'Ahrefs fetch failed — using 2026-08-17 crawl',
    })
  }
}
