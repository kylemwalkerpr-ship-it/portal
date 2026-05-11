import { getPlatformSettings } from './platformConfig'

export const DEFAULT_MIN_CENTS = 100
export const DEFAULT_MAX_CENTS = 500000

export function toCents(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const raw = String(value ?? '').trim()
  if (!raw) return NaN
  const n = Number(raw.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n)) return NaN
  return raw.includes('.') ? Math.round(n * 100) : Math.trunc(n)
}

export function centsToDollars(cents: unknown) {
  return Math.round(Number(cents || 0)) / 100
}

export async function getPaymentSettingsForApi() {
  const settings = await getPlatformSettings()
  const raw = settings as Record<string, unknown>
  const platformFeePercent = Number(raw.platform_fee_percent ?? 20)
  const attorneyPlatformFeePercent = Number(raw.attorney_platform_fee_percent ?? 25)
  const consultantFeePercent = Number(raw.consultant_fee_percent ?? 80)
  const minimumOfferAmount = Number(raw.minimum_offer_amount_cents ?? raw.minimum_offer_amount ?? DEFAULT_MIN_CENTS)
  const maximumOfferAmount = Number(raw.maximum_offer_amount_cents ?? raw.maximum_offer_amount ?? DEFAULT_MAX_CENTS)
  const minimumGigPrice = Number(raw.minimum_gig_price_cents ?? minimumOfferAmount)
  const maximumGigPrice = Number(raw.maximum_gig_price_cents ?? maximumOfferAmount)
  const primaryCurrency = String(raw.primary_currency || 'usd').toLowerCase()
  const allowedCurrencies = Array.isArray(raw.allowed_currencies) ? raw.allowed_currencies : [primaryCurrency]

  return {
    ...settings,
    platform_fee_percent: Number.isFinite(platformFeePercent) ? platformFeePercent : 20,
    attorney_platform_fee_percent: Number.isFinite(attorneyPlatformFeePercent) ? attorneyPlatformFeePercent : 25,
    consultant_fee_percent: Number.isFinite(consultantFeePercent) ? consultantFeePercent : 80,
    minimum_offer_amount_cents: Number.isFinite(minimumOfferAmount) ? minimumOfferAmount : DEFAULT_MIN_CENTS,
    maximum_offer_amount_cents: Number.isFinite(maximumOfferAmount) ? maximumOfferAmount : DEFAULT_MAX_CENTS,
    minimum_gig_price_cents: Number.isFinite(minimumGigPrice) ? minimumGigPrice : DEFAULT_MIN_CENTS,
    maximum_gig_price_cents: Number.isFinite(maximumGigPrice) ? maximumGigPrice : DEFAULT_MAX_CENTS,
    primary_currency: primaryCurrency,
    allowed_currencies: allowedCurrencies.map(String).map(s => s.toLowerCase()),
  }
}

export function providerFeePercent(senderType: 'attorney' | 'consultant', settings: Record<string, any>) {
  return senderType === 'attorney'
    ? Number(settings.attorney_platform_fee_percent ?? 25)
    : Number(settings.platform_fee_percent ?? 20)
}

export function computePlatformFeeCents(amountCents: number, senderType: 'attorney' | 'consultant', settings: Record<string, any>) {
  return Math.round(amountCents * (providerFeePercent(senderType, settings) / 100))
}

export function computeNetPayoutCents(amountCents: number, senderType: 'attorney' | 'consultant', settings: Record<string, any>) {
  if (senderType === 'attorney') return amountCents
  return amountCents - computePlatformFeeCents(amountCents, senderType, settings)
}

export function normalizeRevision(value: unknown) {
  if (String(value).toLowerCase() === 'unlimited') return 999
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 ? n : NaN
}

export function buildSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || crypto.randomUUID()
}
