jest.mock('@/lib/student', () => ({ getCurrentStudent: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/payments', () => ({ getPaymentProvider: jest.fn() }))
jest.mock('@/lib/payments/availability', () => ({ assertMethodAllowed: jest.fn(), MethodUnavailableError: class extends Error {} }))
jest.mock('@/lib/payments/settings', () => ({ getPaymentSettings: jest.fn() }))
jest.mock('@/lib/idempotency', () => ({ claimIdempotencyKey: jest.fn(), completeIdempotencyKey: jest.fn(), extractIdempotencyKey: jest.fn() }))

import { resolveWalletTopupQuote } from '@/app/api/wallet/topup/pesapal/route'

describe('Pesapal wallet top-up quote', () => {
  const rates = { USD: 1.1, GBP: 0.85, CAD: 1.5, AUD: 1.65 }
  test('requires at least $5', () => {
    expect(() => resolveWalletTopupQuote(499, 'USD')).toThrow('Minimum top-up')
  })
  test('CAD estimates settle in USD', () => {
    const quote = resolveWalletTopupQuote(500, 'CAD', rates)
    expect(quote.chargeCurrency).toBe('USD')
    expect(quote.chargeAmountMinor).toBe(367)
  })
  test('GBP remains settled in GBP', () => {
    const quote = resolveWalletTopupQuote(500, 'GBP', rates)
    expect(quote.chargeCurrency).toBe('GBP')
    expect(quote.chargeAmountMinor).toBe(500)
  })
})
