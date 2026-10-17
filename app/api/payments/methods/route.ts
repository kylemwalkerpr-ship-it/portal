import { getOptionalPortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getAvailableMethods } from '@/lib/payments/availability'
import { getPaymentProvider } from '@/lib/payments'
import { getBuyerMethodLabel, isSupportedCurrency, supportedBrandsByProvider } from '@/lib/payments/registry'

export const dynamic = 'force-dynamic'

function publicClientConfig(providerId: string) {
  try {
    const config = getPaymentProvider(providerId).getClientConfig()
    return {
      provider: config.provider,
      mode: config.mode,
      ...(config.tokenizationKey ? { tokenizationKey: config.tokenizationKey } : {}),
      ...(config.scriptUrl ? { scriptUrl: config.scriptUrl } : {}),
      ...(config.variant ? { variant: config.variant } : {}),
      ...(config.publicKey ? { publicKey: config.publicKey } : {}),
      ...(config.apiLoginId ? { apiLoginId: config.apiLoginId } : {}),
    }
  } catch {
    // A capability without a registered adapter has no public client config.
    return undefined
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const optionalUser = await getOptionalPortalUser().catch(() => null)
    const amount = Number(url.searchParams.get('amountUsd') ?? 5)
    const currency = (url.searchParams.get('currency') || 'USD').toUpperCase()
    const country = (url.searchParams.get('country') || optionalUser?.profile?.country_code || '').toUpperCase() || null
    if (!isSupportedCurrency(currency)) {
      return Response.json({ error: 'Unsupported currency.' }, { status: 400, headers: { 'cache-control': 'no-store' } })
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return Response.json({ error: 'Invalid amountUsd.' }, { status: 400, headers: { 'cache-control': 'no-store' } })
    }

    const methods = await getAvailableMethods({
      profile: optionalUser ? { id: optionalUser.profileId } : null,
      currency,
      country,
      amount,
      purpose: url.searchParams.get('purpose') || 'order',
    }, createSupabaseAdminClient())

    const publicMethods = methods.map((method) => {
      const clientConfig = publicClientConfig(method.provider)
      return {
        methodKey: method.methodKey,
        provider: method.provider,
        id: method.id,
        label: getBuyerMethodLabel(method.provider, method.id, method.label),
        logoAsset: method.logoAsset,
        mode: method.mode,
        displayCurrency: method.displayCurrency,
        chargeCurrency: method.chargeCurrency,
        currencies: method.currencies,
        countries: method.countries,
        priority: method.priority,
        isDefault: method.isDefault,
        minAmountMinor: method.minAmountMinor,
        maxAmountMinor: method.maxAmountMinor,
        supportsRefund: method.supportsRefund,
        supportsPartialRefund: method.supportsPartialRefund,
        supportsVault: method.supportsVault,
        ...(method.id === 'card' ? { supportedBrands: supportedBrandsByProvider[method.provider] || [] } : {}),
        ...(clientConfig ? { clientConfig } : {}),
      }
    })
    return Response.json({ methods: publicMethods }, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    console.error('[payments/methods] settings lookup failed')
    return Response.json(
      { error: error instanceof Error ? error.message : 'Payment methods are temporarily unavailable.' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }
}
