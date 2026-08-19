import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { persistGa4Config, probeGa4, normalizeGa4PropertyId } from '@/lib/seoEngine/ga4'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const body = (await req.json().catch(() => ({}))) as { propertyId?: string; enabled?: boolean }
    if (body.enabled === false) {
      const cfg = await persistGa4Config({ enabled: false, lastError: null })
      return NextResponse.json({ ok: true, connected: false, enabled: false, propertyId: cfg.propertyId || null })
    }
    const propertyId = normalizeGa4PropertyId(body.propertyId || '')
    const probe = await probeGa4(propertyId)
    if (!probe.ok) {
      await persistGa4Config({ propertyId, enabled: false, lastError: probe.error || 'probe failed' })
      return NextResponse.json({ ok: false, error: probe.error || 'GA4 probe failed' }, { status: 400 })
    }
    const cfg = await persistGa4Config({
      propertyId,
      enabled: true,
      connectedAt: new Date().toISOString(),
      lastError: null,
    })
    return NextResponse.json({
      ok: true,
      connected: true,
      enabled: true,
      propertyId: cfg.propertyId,
      sessions: probe.sessions,
      connectedAt: cfg.connectedAt,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'GA4 connect failed' }, { status: 500 })
  }
}

export async function DELETE() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const cfg = await persistGa4Config({ enabled: false, lastError: null })
  return NextResponse.json({ ok: true, connected: false, enabled: false, propertyId: cfg.propertyId || null })
}
