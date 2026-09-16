import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  AI_PROVIDERS,
  getAiSettings,
  listLegacyVaultRows,
  listVaultStatus,
  providerDef,
  upsertVaultKey,
  vaultProviderInputError,
  deleteVaultKey,
  purgeAllVaultKeys,
  purgeGroupVaultKeys,
  maskKey,
} from '@/lib/aiKeyVault'
import { getSuperGrokStatus } from '@/lib/xaiSuperGrokOAuth'

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
    // Historical rows: read-only audit visibility, never selectable/testable.
    const legacyProviders = await listLegacyVaultRows()
    const settings = await getAiSettings(true)
    // Runtime hydration truth — not "did the panel save" but "will the
    // generation runtime see vault keys". The Worker overlay fails when the
    // service key is the sb_secret_ format (supabase-js v2 rejects it) AND
    // ai_provider_keys denies the anon fallback — pasted keys then sit in
    // the DB while the runtime silently falls back to env secrets/Grok.
    let overlayNames: string[] = []
    let overlayOk = true
    try {
      const { refreshAiVault } = await import('@/lib/contentAiProvider')
      overlayNames = await refreshAiVault()
      overlayOk = overlayNames.length > 0
    } catch {
      overlayOk = false
    }
    const grokOAuth = await getSuperGrokStatus()
    // Editable default-model identity for the settings editor: only the
    // override-capable commissioned providers contribute selectable ids
    // (currently Grok's `grok-4.6`). A hard-pinned provider's upstream model
    // id (DeepSeek `deepseek-flash`) is never exposed as an editable choice.
    const defaultModelOptions = [...new Set(AI_PROVIDERS.flatMap((provider) => provider.modelOptions || []))]
    return NextResponse.json({ providers, legacyProviders, settings, grokOAuth, overlayOk, overlayNames, defaultModelOptions })
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
    // Exact commissioned stable pin only — a retired/unknown id, an alias, or
    // an upstream model id is rejected before any vault write.
    const provider = String(body.provider || '').trim()
    const def = providerDef(provider)
    if (!def) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    }
    const baseUrl = body.baseUrl != null ? String(body.baseUrl) : null
    const model = body.model != null ? String(body.model) : null
    const inputError = vaultProviderInputError(def, { baseUrl, model })
    if (inputError) {
      return NextResponse.json({ error: inputError }, { status: 400 })
    }
    const row = await upsertVaultKey(provider, {
      apiKey: body.apiKey != null ? String(body.apiKey) : undefined,
      baseUrl,
      model,
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
    // Historical rows are audit-only and are never deleted through this door.
    if (!providerDef(provider)) {
      return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
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
