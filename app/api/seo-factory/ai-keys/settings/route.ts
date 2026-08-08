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
      await setAiSetting('max_providers', String(body.maxProviders).trim())
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
