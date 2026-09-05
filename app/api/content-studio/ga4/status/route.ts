import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { serviceAccountEmail } from '@/lib/gscAuth'
import { loadGa4Config, resolveGa4ServiceAccountJson } from '@/lib/seoEngine/ga4'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const cfg = await loadGa4Config()
    const saJson = await resolveGa4ServiceAccountJson()
    const saEmail = saJson ? await serviceAccountEmail() : null
    return NextResponse.json({
      ok: true,
      // Require a successful Connect (connectedAt) so env-only property IDs never fake "Connected".
      connected: Boolean(cfg.enabled && cfg.propertyId && cfg.connectedAt),
      enabled: cfg.enabled,
      propertyId: cfg.propertyId || null,
      connectedAt: cfg.connectedAt ?? null,
      lastError: cfg.lastError ?? null,
      hasServiceAccount: Boolean(saJson),
      serviceAccountEmail: saEmail,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ga4 status failed' }, { status: 500 })
  }
}
