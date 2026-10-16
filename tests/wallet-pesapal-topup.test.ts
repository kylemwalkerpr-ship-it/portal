jest.mock('@/lib/student', () => ({ getCurrentStudent: jest.fn() }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn() }))
jest.mock('@/lib/payments', () => ({ getPaymentProvider: jest.fn() }))
jest.mock('@/lib/payments/availability', () => ({ assertMethodAllowed: jest.fn(), MethodUnavailableError: class extends Error {} }))
jest.mock('@/lib/payments/settings', () => ({ getPaymentSettings: jest.fn() }))
jest.mock('@/lib/idempotency', () => ({ claimIdempotencyKey: jest.fn(), completeIdempotencyKey: jest.fn(), extractIdempotencyKey: jest.fn() }))
jest.mock('@/lib/platformConfig', () => ({ getPlatformSettings: jest.fn(async () => ({ wallet_topup_enabled: true })) }))

import { resolveWalletTopupQuote } from '@/app/api/wallet/topup/pesapal/route'
import { POST as postCardTopup } from '@/app/api/wallet/topup/route'
import { getCurrentStudent } from '@/lib/student'

describe('Pesapal wallet top-up quote', () => {
  const rates = { USD: 1.1, GBP: 0.85, CAD: 1.5, AUD: 1.65 }
  test('requires at least $5', () => {
    expect(() => resolveWalletTopupQuote(499, 'USD')).toThrow('Minimum top-up')
    expect(resolveWalletTopupQuote(500, 'USD').baseAmountUsdMinor).toBe(500)
  })
  test('card top-up route rejects 499 cents before payment processing', async () => {
    ;(getCurrentStudent as jest.Mock).mockResolvedValue({ profile: { id: 'student-1', email: 'buyer@example.test', full_name: 'Buyer' } })
    const response = await postCardTopup(new Request('https://portal.example/api/wallet/topup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountCents: 499, token: 'test-token' }),
    }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Minimum top-up is $5.00.' })
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
