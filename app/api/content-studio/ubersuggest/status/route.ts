import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { loadUbersuggestConfig, redactUbersuggestConfig } from '@/lib/seoEngine/ubersuggest'
import { UBERSUGGEST_TOOL_CATALOG } from '@/lib/seoEngine/ubersuggestCatalog'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const cfg = await loadUbersuggestConfig()
    const redacted = redactUbersuggestConfig(cfg)
    return NextResponse.json({
      ok: true,
      connected: cfg.enabled,
      ...redacted,
      catalog: UBERSUGGEST_TOOL_CATALOG.map((t) => ({ name: t.name, layer: t.layer, engine: t.engine, hot: t.hot })),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ubersuggest status failed' }, { status: 500 })
  }
}
