import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import { AI_PROVIDERS, getAiSettings, setAiSetting } from '@/lib/aiKeyVault'

/**
 * POST /api/seo-factory/ai-keys/settings
 * Save AI defaults: { defaultProvider?, defaultModel?, maxProviders? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))

    if (body.defaultProvider != null) {
      const v = String(body.defaultProvider).trim()
      const valid = v === '' || v === 'auto' || AI_PROVIDERS.some((p) => p.id === v)
      if (!valid) {
        return NextResponse.json({ error: 'Unknown default provider' }, { status: 400 })
      }
      await setAiSetting('default_provider', v === 'auto' ? '' : v)
    }
    if (body.defaultModel != null && String(body.defaultModel).trim()) {
      await setAiSetting('default_model', String(body.defaultModel).trim())
    }
    if (body.maxProviders != null && String(body.maxProviders).trim()) {
      const max = Number.parseInt(String(body.maxProviders).trim(), 10)
      if (!Number.isFinite(max) || max < 1 || max > 10) {
        return NextResponse.json({ error: 'Max providers must be between 1 and 10' }, { status: 400 })
      }
      await setAiSetting('max_providers', String(max))
    }
    if (body.providerOrder != null) {
      let rawOrder: unknown = body.providerOrder
      if (typeof rawOrder === 'string') {
        try { rawOrder = JSON.parse(rawOrder) } catch { rawOrder = rawOrder.split(',') }
      }
      if (!Array.isArray(rawOrder)) {
        return NextResponse.json({ error: 'Provider order must be an array of provider ids' }, { status: 400 })
      }
      const ids = rawOrder.map((value) => String(value).trim()).filter(Boolean)
      const known = new Set(AI_PROVIDERS.map((provider) => provider.id))
      const unknown = ids.find((id) => !known.has(id))
      if (unknown) {
        return NextResponse.json({ error: `Unknown provider order entry: ${unknown}` }, { status: 400 })
      }
      await setAiSetting('provider_order', JSON.stringify([...new Set(ids)]))
    }
    const settings = await getAiSettings(true)
    return NextResponse.json({ ok: true, settings })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ai settings save failed' },
      { status: 500 },
    )
  }
}
