import { getPlatformSettings } from './platformConfig'

export type ProviderRole = 'attorney' | 'consultant'

function finiteNumber(value: unknown, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

export async function calculateOfferPricing(role: ProviderRole, rawPrice: unknown, rawDiscountPercent?: unknown) {
  const settings = await getPlatformSettings()
  const price = roundMoney(finiteNumber(rawPrice))
  const discountPercent = Math.min(Math.max(finiteNumber(rawDiscountPercent), 0), 95)
  const discountedPrice = roundMoney(price * (1 - discountPercent / 100))

  if (role === 'attorney') {
    const feePercent = finiteNumber((settings as Record<string, unknown>).attorney_platform_fee_percent, 25)
    const platformFee = roundMoney(discountedPrice * (feePercent / 100))
    return {
      originalPrice: price,
      price: discountedPrice,
      discountPercent,
      platformFee,
      providerPayout: discountedPrice,
      total: roundMoney(discountedPrice + platformFee),
      platformFeePercent: feePercent,
      providerPayoutPercent: 100,
      model: 'additive' as const,
      currency: String((settings as Record<string, unknown>).primary_currency || 'usd').toLowerCase(),
    }
  }

  const platformFeePercent = finiteNumber((settings as Record<string, unknown>).platform_fee_percent, 20)
  const consultantFeePercent = finiteNumber((settings as Record<string, unknown>).consultant_fee_percent, 80)
  const platformFee = roundMoney(discountedPrice * (platformFeePercent / 100))
  const providerPayout = roundMoney(discountedPrice * (consultantFeePercent / 100))

  return {
    originalPrice: price,
    price: discountedPrice,
    discountPercent,
    platformFee,
    providerPayout,
    total: discountedPrice,
    platformFeePercent,
    providerPayoutPercent: consultantFeePercent,
    model: 'split' as const,
    currency: String((settings as Record<string, unknown>).primary_currency || 'usd').toLowerCase(),
  }
}

export function validateOfferInput(input: {
  title?: unknown
  description?: unknown
  price?: unknown
  delivery_days?: unknown
  revision_count?: unknown
}) {
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 200) : ''
  const description = typeof input.description === 'string' ? input.description.trim().slice(0, 4000) : ''
  const price = finiteNumber(input.price)
  const deliveryDays = finiteNumber(input.delivery_days)
  const revisionCount = Math.max(0, Math.min(10, Math.trunc(finiteNumber(input.revision_count, 1))))

  if (!title) return { error: 'Title required.' as const }
  if (!description) return { error: 'Description required.' as const }
  if (!Number.isFinite(price) || price <= 0) return { error: 'Price must be a positive number.' as const }
  if (!Number.isInteger(deliveryDays) || deliveryDays <= 0) {
    return { error: 'Delivery days must be a positive integer.' as const }
  }

  return { title, description, price, deliveryDays, revisionCount }
}
