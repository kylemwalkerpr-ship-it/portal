import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/portalAuth'
import {
  commissionedModelIdentity,
  commissionedProviderOrder,
  getAiSettings,
  isExactCommissionedPin,
  setAiSetting,
} from '@/lib/aiKeyVault'
import { LANE_DEFAULT_PIN } from '@/lib/contentAiRegistry'

/**
 * POST /api/seo-factory/ai-keys/settings
 * Save AI defaults: { defaultProvider?, defaultModel?, maxProviders?, providerOrder? }
 *
 * Only the EXACT commissioned stable pins (`grok`, `deepseek-v41-flash`) are
 * accepted — an alias, a mixed-case spelling, or an upstream model id is
 * rejected with 400 BEFORE any write so an invalid request can never leave a
 * partial settings update. `default_model` is constrained to the registry
 * model identity of the selected provider: an arbitrary string can never
 * become an execution model override.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser()
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const body = await request.json().catch(() => ({}))
    const writes: Array<[string, string]> = []

    // Normalize the provider order once (JSON array, JSON string, or CSV) so
    // validation and the persisted value agree exactly.
    let orderIds: string[] | null = null
    if (body.providerOrder != null) {
      let rawOrder: unknown = body.providerOrder
      if (typeof rawOrder === 'string') {
        const orderString = rawOrder
        try { rawOrder = JSON.parse(orderString) } catch { rawOrder = orderString.split(',') }
      }
      if (!Array.isArray(rawOrder)) {
        return NextResponse.json({ error: 'Provider order must be an array of provider ids' }, { status: 400 })
      }
      orderIds = rawOrder.map((value) => String(value).trim()).filter(Boolean)
    }

    if (body.defaultProvider != null) {
      const provider = String(body.defaultProvider).trim()
      const valid = provider === '' || provider === 'auto' || isExactCommissionedPin(provider)
      if (!valid) {
        return NextResponse.json(
          { error: 'Unknown default provider — choose a commissioned provider (grok or deepseek-v41-flash)' },
          { status: 400 },
        )
      }
      writes.push(['default_provider', provider === 'auto' ? '' : provider])
    }

    if (body.defaultModel != null) {
      const model = String(body.defaultModel).trim()
      if (model) {
        // Bind to the provider this default applies to: the submitted provider
        // when present, else the first submitted order pin, else the lane
        // default. A cross-provider or stale value (gpt-5.6-terra, grok-4) is
        // rejected rather than stored.
        const submittedProvider = body.defaultProvider != null ? String(body.defaultProvider).trim() : ''
        const effectiveProvider = submittedProvider && submittedProvider !== 'auto'
          ? submittedProvider
          : (orderIds?.find((id) => isExactCommissionedPin(id)) || LANE_DEFAULT_PIN)
        if (!commissionedModelIdentity(model, effectiveProvider)) {
          return NextResponse.json(
            { error: `Unsupported default model for ${effectiveProvider}: ${model}` },
            { status: 400 },
          )
        }
      }
      writes.push(['default_model', model])
    }

    if (body.maxProviders != null && String(body.maxProviders).trim()) {
      const max = Number.parseInt(String(body.maxProviders).trim(), 10)
      if (!Number.isFinite(max) || max < 1 || max > 10) {
        return NextResponse.json({ error: 'Max providers must be between 1 and 10' }, { status: 400 })
      }
      writes.push(['max_providers', String(max)])
    }

    if (orderIds) {
      const unknown = orderIds.find((id) => !isExactCommissionedPin(id))
      if (unknown) {
        return NextResponse.json({ error: `Unknown provider order entry: ${unknown}` }, { status: 400 })
      }
      writes.push(['provider_order', commissionedProviderOrder(JSON.stringify(orderIds))])
    }

    for (const [key, value] of writes) {
      await setAiSetting(key, value)
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
