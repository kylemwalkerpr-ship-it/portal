import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { loadUbersuggestConfig, redactUbersuggestConfig } from '@/lib/seoEngine/ubersuggest'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const cfg = await loadUbersuggestConfig()
    return NextResponse.json({ ok: true, connected: cfg.enabled, ...redactUbersuggestConfig(cfg) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'ubersuggest status failed' }, { status: 500 })
  }
}
