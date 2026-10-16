import { resolvePesapalCurrencyQuote } from '@/lib/payments/fx'

export function resolveWalletTopupQuote(amountCents: number, currency: string, rates?: Record<string, number>) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 500) throw new Error('Minimum top-up is $5.00.')
  const normalized = currency.toUpperCase()
  if (!['USD', 'GBP', 'CAD', 'AUD'].includes(normalized)) throw new Error('Unsupported currency.')
  return resolvePesapalCurrencyQuote({ amountMinor: amountCents, sourceCurrency: normalized, displayCurrency: normalized, rates })
}
