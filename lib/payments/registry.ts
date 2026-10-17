import type { PaymentMode } from './types'

export type PaymentMethodCapability = {
  id: 'card' | 'mpesa' | 'airtel' | 'mtn' | 'bank' | 'wallet' | 'invoice'
  label: string
  logoAsset: string
  currencies: readonly string[]
  countries: readonly string[]
  supportsRefund: boolean
  supportsPartialRefund: boolean
  supportsVault: boolean
}

export type PaymentProviderCapability = {
  provider: string
  label: string
  mode: PaymentMode
  logoAsset: string
  methods: readonly PaymentMethodCapability[]
  supportedBrands?: readonly CardBrand[]
}

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'jcb' | 'unionpay'

/** Buyer-facing marks supported by each card processor. */
export const supportedBrandsByProvider: Record<string, readonly CardBrand[]> = {
  pesapal: ['visa', 'mastercard', 'amex'],
  nmi: ['visa', 'mastercard', 'amex', 'discover'],
  authorizenet: ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'unionpay'],
}

export function getBuyerMethodLabel(provider: string, method: string, fallback: string): string {
  if (method === 'card') return 'Card payment'
  if (method === 'wallet') return 'Wallet balance'
  if (method === 'invoice') return 'Invoice request'
  if (provider === 'pesapal' && method === 'mpesa') return 'M-Pesa'
  return fallback.replace(/pesapal|\bnmi\b|payhip/gi, 'YouSafe')
}

const usd = ['USD'] as const
const usdGbp = ['USD', 'GBP'] as const
const noCountries: readonly string[] = []

/** Server-side capability catalogue. Settings can enable a capability, never add one. */
export const PAYMENT_CAPABILITIES = [
  {
    provider: 'nmi', label: 'NMI', mode: 'inline-token', logoAsset: '/payments/nmi.svg',
    methods: [{ id: 'card', label: 'Card', logoAsset: '/payments/nmi.svg', currencies: usd, countries: noCountries, supportsRefund: true, supportsPartialRefund: true, supportsVault: true }],
  },
  {
    provider: 'authorizenet', label: 'Authorize.Net', mode: 'inline-token', logoAsset: '/payments/authorizenet.svg',
    methods: [{ id: 'card', label: 'Card', logoAsset: '/payments/authorizenet.svg', currencies: usd, countries: noCountries, supportsRefund: true, supportsPartialRefund: true, supportsVault: true }],
  },
  {
    provider: 'manual', label: 'Manual and wallet', mode: 'manual-invoice', logoAsset: '/payments/manual.svg',
    methods: [
      { id: 'wallet', label: 'Wallet balance', logoAsset: '/payments/manual.svg', currencies: usd, countries: noCountries, supportsRefund: false, supportsPartialRefund: false, supportsVault: false },
      { id: 'invoice', label: 'Invoice request', logoAsset: '/payments/manual.svg', currencies: usd, countries: noCountries, supportsRefund: false, supportsPartialRefund: false, supportsVault: false },
    ],
  },
  {
    provider: 'pesapal', label: 'Pesapal', mode: 'hosted-redirect', logoAsset: '/payments/pesapal.svg',
    methods: [
      { id: 'card', label: 'Card', logoAsset: '/payments/pesapal.svg', currencies: usdGbp, countries: noCountries, supportsRefund: true, supportsPartialRefund: true, supportsVault: false },
      { id: 'mpesa', label: 'M-Pesa', logoAsset: '/payments/pesapal.svg', currencies: usdGbp, countries: noCountries, supportsRefund: true, supportsPartialRefund: false, supportsVault: false },
      { id: 'airtel', label: 'Airtel Money', logoAsset: '/payments/pesapal.svg', currencies: usdGbp, countries: noCountries, supportsRefund: true, supportsPartialRefund: false, supportsVault: false },
    ],
  },
] as const satisfies readonly PaymentProviderCapability[]

export type PaymentProviderId = (typeof PAYMENT_CAPABILITIES)[number]['provider']
export type PaymentCurrency = 'USD' | 'GBP' | 'CAD' | 'AUD'

export function getProviderCapability(provider: string): PaymentProviderCapability | undefined {
  return PAYMENT_CAPABILITIES.find((item) => item.provider === provider) as PaymentProviderCapability | undefined
}

export function getMethodCapability(provider: string, method: string): PaymentMethodCapability | undefined {
  return getProviderCapability(provider)?.methods.find((item) => item.id === method) as PaymentMethodCapability | undefined
}

export function isSupportedCurrency(value: unknown): value is PaymentCurrency {
  return typeof value === 'string' && ['USD', 'GBP', 'CAD', 'AUD'].includes(value.toUpperCase())
}

export function methodKey(provider: string, method: string): string {
  return `${provider}:${method}`
}

export function parseMethodKey(value: string): { provider: string; method: string } | null {
  const separator = value.indexOf(':')
  if (separator < 1 || separator === value.length - 1) return null
  return { provider: value.slice(0, separator), method: value.slice(separator + 1) }
}
