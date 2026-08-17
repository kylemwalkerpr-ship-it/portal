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
  const body = (await req.json().catch(() => ({}))) as { projectId?: string; date?: string; dateCompared?: string }
  try {
    const snap = await fetchAhrefsSiteAudit(body)
    await persistAhrefsSnapshot(snap)
    return NextResponse.json({ ok: true, snapshot: snap })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Ahrefs fetch failed' }, { status: 502 })
  }
}
