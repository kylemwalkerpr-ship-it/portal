import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  loadUbersuggestConfig,
  persistUbersuggestConfig,
  probeUbersuggest,
  redactUbersuggestConfig,
  UBERSUGGEST_MCP_URL,
} from '@/lib/seoEngine/ubersuggest'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    const body = (await req.json().catch(() => ({}))) as {
      accessToken?: string
      mcpUrl?: string
      enabled?: boolean
    }
    const current = await loadUbersuggestConfig()

    if (body.enabled === false) {
      const cfg = await persistUbersuggestConfig({ enabled: false, lastError: null })
      return NextResponse.json({ ok: true, connected: false, ...redactUbersuggestConfig(cfg) })
    }

    const token = String(body.accessToken || current.accessToken || '').trim()
    if (!token) {
      return NextResponse.json({
        ok: false,
        error: 'Paste an Ubersuggest MCP bearer token (authorize at app.neilpatel.com/en/mcp).',
      }, { status: 400 })
    }
    const mcpUrl = String(body.mcpUrl || current.mcpUrl || UBERSUGGEST_MCP_URL)
    const probe = await probeUbersuggest(token, mcpUrl)
    if (!probe.ok) {
      await persistUbersuggestConfig({
        accessToken: token,
        mcpUrl,
        enabled: false,
        lastError: probe.error || 'probe failed',
      })
      return NextResponse.json({ ok: false, error: probe.error || 'Ubersuggest MCP probe failed' }, { status: 400 })
    }
    const cfg = await persistUbersuggestConfig({
      accessToken: token,
      mcpUrl,
      enabled: true,
      connectedAt: new Date().toISOString(),
      lastError: null,
      toolCount: probe.toolCount,
    })
    return NextResponse.json({ ok: true, connected: true, ...redactUbersuggestConfig(cfg) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Ubersuggest connect failed' }, { status: 500 })
  }
}

export async function DELETE() {
  const auth = await requireAdminUser()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const cfg = await persistUbersuggestConfig({ enabled: false, lastError: null })
  return NextResponse.json({ ok: true, connected: false, ...redactUbersuggestConfig(cfg) })
}
