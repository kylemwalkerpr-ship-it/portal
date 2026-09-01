import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  AI_PROVIDERS,
  getAiSettings,
  listVaultStatus,
  upsertVaultKey,
  deleteVaultKey,
  purgeAllVaultKeys,
  purgeGroupVaultKeys,
  maskKey,
} from '@/lib/aiKeyVault'
import { getSuperGrokStatus } from '@/lib/xaiSuperGrokOAuth'
import { getChatgptStatus } from '@/lib/chatgptOAuth'

/**
 * AI Key Vault — admin-managed provider keys for the content AI chain.
 *
 * GET    /api/seo-factory/ai-keys            → { providers, settings }
 * PUT    /api/seo-factory/ai-keys            → save a key { provider, apiKey?, baseUrl?, model?, enabled? }
 * DELETE /api/seo-factory/ai-keys?provider=x → remove a key
 *
 * Sibling routes: /test (live probe), /settings (defaults).
 */

export async function GET() {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const providers = await listVaultStatus()
    const settings = await getAiSettings(true)
    const grokOAuth = await getSuperGrokStatus()
    const chatgptOAuth = await getChatgptStatus()
    return NextResponse.json({ providers, settings, grokOAuth, chatgptOAuth })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ai keys load failed' },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const provider = String(body.provider || '').trim()
    if (!AI_PROVIDERS.some((p) => p.id === provider)) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }
    const row = await upsertVaultKey(provider, {
      apiKey: body.apiKey != null ? String(body.apiKey) : undefined,
      baseUrl: body.baseUrl != null ? String(body.baseUrl) : null,
      model: body.model != null ? String(body.model) : null,
      enabled: body.enabled !== false,
    })
    return NextResponse.json({
      ok: true,
      provider: row.provider,
      maskedKey: row.api_key ? maskKey(row.api_key) : null,
      baseUrl: row.base_url,
      model: row.model,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ai key save failed' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    // ?purge=true → delete ALL vault keys (admin reset)
    if (request.nextUrl.searchParams.get('purge') === 'true') {
      const count = await purgeAllVaultKeys()
      return NextResponse.json({ ok: true, purged: count })
    }
    // ?purgeGroup=true with body { providers: string[] } → delete keys for a host group
    if (request.nextUrl.searchParams.get('purgeGroup') === 'true') {
      const body = await request.json().catch(() => ({}))
      const ids = Array.isArray(body.providers) ? body.providers.map((v: unknown) => String(v).trim()).filter(Boolean) : []
      if (!ids.length) {
        return NextResponse.json({ error: 'providers array required' }, { status: 400 })
      }
      const count = await purgeGroupVaultKeys(ids)
      return NextResponse.json({ ok: true, purged: count, providers: ids })
    }
    const provider = request.nextUrl.searchParams.get('provider')
    if (!provider) {
      return NextResponse.json({ error: 'provider query param required' }, { status: 400 })
    }
    await deleteVaultKey(provider)
    return NextResponse.json({ ok: true, provider })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ai key remove failed' },
      { status: 500 },
    )
  }
}
