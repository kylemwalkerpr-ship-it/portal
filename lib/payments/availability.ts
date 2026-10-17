import { getSupabaseAdminClient } from '@/lib/supabase'
import { PAYMENT_CAPABILITIES, getMethodCapability, getProviderCapability, isSupportedCurrency, methodKey, parseMethodKey } from './registry'
import { getPaymentSettings, type PaymentSettingsSnapshot } from './settings'

export type AvailabilityContext = {
  profile?: { id?: string | null } | null
  currency: string
  country?: string | null
  /** USD equivalent in major units, resolved by the server. */
  amount: number
  purpose?: string
}

export type AvailablePaymentMethod = {
  methodKey: string
  provider: string
  id: string
  label: string
  logoAsset: string
  mode: string
  displayCurrency: string
  chargeCurrency: string
  currencies: string[]
  countries: string[]
  priority: number
  isDefault: boolean
  minAmountMinor: number | null
  maxAmountMinor: number | null
  supportsRefund: boolean
  supportsPartialRefund: boolean
  supportsVault: boolean
}

export class MethodUnavailableError extends Error {
  readonly code = 'method_unavailable'
  readonly status = 409

  constructor(readonly methodKey: string, readonly invoiceRequestFallback: boolean) {
    super('Payment method is not currently available.')
    this.name = 'MethodUnavailableError'
  }
}

function canChargeCurrency(supported: readonly string[], requested: string): string | null {
  const currency = requested.toUpperCase()
  if (supported.includes(currency)) return currency
  return supported.includes('USD') ? 'USD' : null
}

export function resolveAvailableMethods(
  context: AvailabilityContext,
  settings: PaymentSettingsSnapshot,
): AvailablePaymentMethod[] {
  const requestedCurrency = context.currency.toUpperCase()
  const amountUsd = Number(context.amount)
  if (!isSupportedCurrency(requestedCurrency) || !Number.isFinite(amountUsd) || amountUsd < 5) return []
  const amountUsdMinor = Math.round(amountUsd * 100)

  const providerSettings = new Map(settings.providers.map((row) => [row.provider, row]))
  const methodSettings = new Map(settings.methods.map((row) => [`${row.provider}:${row.method}`, row]))
  const result: AvailablePaymentMethod[] = []

  for (const provider of PAYMENT_CAPABILITIES) {
    const providerSetting = providerSettings.get(provider.provider)
    if (!providerSetting?.enabled || providerSetting.retired) continue
    if (providerSetting.test_mode_owner_only) {
      const profileId = context.profile?.id
      if (!profileId || !providerSetting.test_allowlist?.includes(profileId)) continue
    }

    for (const capability of provider.methods) {
      const setting = methodSettings.get(`${provider.provider}:${capability.id}`)
      if (!setting?.enabled) continue
      const supportedCurrencies = (setting.currencies ?? capability.currencies).map((c) => c.toUpperCase())
      if (supportedCurrencies.some((currency) => !capability.currencies.includes(currency))) continue
      const chargeCurrency = canChargeCurrency(supportedCurrencies, requestedCurrency)
      if (!chargeCurrency) continue

      const min = setting.min_amount_minor == null ? 500 : Number(setting.min_amount_minor)
      const max = setting.max_amount_minor == null ? null : Number(setting.max_amount_minor)
      if (amountUsdMinor < Math.max(500, min) || (max != null && amountUsdMinor > max)) continue

      if (settings.global.country_default_routing_enabled) {
        const configuredCountries = setting.countries ?? [...capability.countries]
        if (configuredCountries.length && (!context.country || !configuredCountries.includes(context.country.toUpperCase()))) continue
      }

      result.push({
        methodKey: methodKey(provider.provider, capability.id),
        provider: provider.provider,
        id: capability.id,
        label: capability.label,
        logoAsset: capability.logoAsset,
        mode: provider.mode,
        displayCurrency: requestedCurrency,
        chargeCurrency,
        currencies: supportedCurrencies,
        countries: setting.countries ?? [...capability.countries],
        priority: Number(setting.priority ?? providerSetting.priority),
        isDefault: providerSetting.is_default,
        minAmountMinor: setting.min_amount_minor == null ? null : Number(setting.min_amount_minor),
        maxAmountMinor: max,
        supportsRefund: capability.supportsRefund,
        supportsPartialRefund: capability.supportsPartialRefund,
        supportsVault: capability.supportsVault,
      })
    }
  }

  return result.sort((a, b) => a.priority - b.priority || a.provider.localeCompare(b.provider))
}

export async function getAvailableMethods(
  context: AvailabilityContext,
  db: ReturnType<typeof getSupabaseAdminClient> = getSupabaseAdminClient(),
) {
  return resolveAvailableMethods(context, await getPaymentSettings(db))
}

export async function assertMethodAllowed(
  selectedMethodKey: string,
  context: AvailabilityContext,
  db: ReturnType<typeof getSupabaseAdminClient> = getSupabaseAdminClient(),
): Promise<AvailablePaymentMethod> {
  const parsed = parseMethodKey(selectedMethodKey)
  const settings = await getPaymentSettings(db)
  const available = resolveAvailableMethods(context, settings)
  const match = available.find((item) => item.methodKey === selectedMethodKey)
  if (!parsed || !getProviderCapability(parsed.provider) || !getMethodCapability(parsed.provider, parsed.method) || !match) {
    const invoiceFallback = available.length === 0 && isSupportedCurrency(context.currency) && Number(context.amount) >= 5
    throw new MethodUnavailableError(selectedMethodKey, invoiceFallback)
  }
  return match
}
