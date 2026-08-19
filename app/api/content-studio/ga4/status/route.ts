import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { loadGa4Config } from '@/lib/seoEngine/ga4'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const cfg = await loadGa4Config()
    return NextResponse.json({
      ok: true,
      connected: cfg.enabled && Boolean(cfg.propertyId),
      enabled: cfg.enabled,
      propertyId: cfg.propertyId || null,
      connectedAt: cfg.connectedAt ?? null,
      lastError: cfg.lastError ?? null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ga4 status failed' }, { status: 500 })
  }
}
