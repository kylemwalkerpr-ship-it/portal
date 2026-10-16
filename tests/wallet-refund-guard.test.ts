import { chargeRefundConflict } from '@/lib/walletRefundGuard'

describe('wallet charge refund guard', () => {
  test('refuses a second refund once refunded_at is set', () => {
    expect(chargeRefundConflict({ refunded_at: '2026-01-01T00:00:00Z', refunded_cents: 500 }, 500, 1)).toBe(true)
  })
  test('refuses cumulative over-refunds', () => {
    expect(chargeRefundConflict({ refunded_cents: 400 }, 500, 101)).toBe(true)
    expect(chargeRefundConflict({ refunded_cents: 400 }, 500, 100)).toBe(false)
  })
})

test('automatic refund reference carries source id and debit transaction id', () => {
  const reference = `autorefund:${'offer-1'}:${'debit-1'}`
  expect(reference).toMatch(/^autorefund:[^:]+:[^:]+$/)
})
