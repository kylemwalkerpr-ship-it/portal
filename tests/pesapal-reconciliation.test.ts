jest.mock('@/lib/checkoutOrders', () => ({ createPaidOrder: jest.fn(async () => ({ id: 'order-1' })) }))
jest.mock('@/lib/earnings', () => ({ creditEarning: jest.fn(async () => {}) }))
jest.mock('@/lib/idempotency', () => ({ recordPaymentIncident: jest.fn(async () => {}) }))

import { createPaidOrder } from '@/lib/checkoutOrders'
import { reconcilePesapalPayment } from '@/lib/payments/pesapalReconciliation'
import type { HostedStatusResult } from '@/lib/payments/types'

const item = {
  sourceType: 'gig', sourceId: 'gig-1', title: 'Consulting', description: 'Consulting', currency: 'usd',
  subtotalCents: 550, platformFeeCents: 0, totalCents: 550, netPayoutCents: 550,
  providerProfileId: 'provider-1', providerType: 'consultant', clientProfileId: 'client-1',
  deliveryDays: 1, gigId: 'gig-1', tierId: 'tier-1',
} as any

function dbFixture() {
  let attempt: Record<string, any> = {
    id: 'attempt-1', gateway: 'pesapal', merchant_reference: 'ys:ref-1', provider_tracking_id: 'track-1',
    profile_id: 'client-1', source_type: 'gig', source_id: 'gig-1', source_payload: { orderItem: item },
    status: 'submitted', amount_minor: 550, currency: 'USD', charge_amount_minor: 550,
    charge_currency: 'USD', base_amount_usd_minor: 550, poll_count: 0,
    updated_at: '2026-10-16T10:00:00.000Z',
  }
  const db = {
    from: jest.fn((table: string) => {
      if (table !== 'payment_attempts') throw new Error(`Unexpected table ${table}`)
      let action: 'select' | 'update' = 'select'
      let patch: Record<string, unknown> = {}
      const filters: Array<[string, string, unknown]> = []
      const builder: any = {
        select: () => { if (action !== 'update') action = 'select'; return builder },
        update: (value: Record<string, unknown>) => { action = 'update'; patch = value; return builder },
        eq: (column: string, value: unknown) => { filters.push(['eq', column, value]); return builder },
        in: (column: string, value: unknown) => { filters.push(['in', column, value]); return builder },
        maybeSingle: async () => execute(),
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
      }
      function matches() {
        return filters.every(([operator, column, value]) => operator === 'eq'
          ? attempt[column] === value
          : (value as unknown[]).includes(attempt[column]))
      }
      async function execute() {
        if (!matches()) return { data: null, error: null }
        if (action === 'update') attempt = { ...attempt, ...patch }
        return { data: { ...attempt }, error: null }
      }
      return builder
    }),
  }
  return { db: db as any, getAttempt: () => attempt }
}

function catalogueRetryDbFixture() {
  let attempt: Record<string, any> = {
    id: 'attempt-catalogue', gateway: 'pesapal', merchant_reference: 'ys:catalogue', provider_tracking_id: 'track-catalogue',
    profile_id: 'client-1', source_type: 'catalogue', source_id: 'cart-1',
    source_payload: { items: [{ serviceId: 'service-1', quantity: 2, amountCents: 300 }] },
    status: 'submitted', amount_minor: 600, currency: 'USD', charge_amount_minor: 600,
    charge_currency: 'USD', base_amount_usd_minor: 600, poll_count: 0,
    updated_at: '2026-10-16T10:00:00.000Z',
  }
  const rows: Record<string, any[]> = { order_items: [] }
  const db = {
    from: jest.fn((table: string) => {
      let action = 'select'
      let payload: any
      const filters: Array<[string, unknown]> = []
      const builder: any = {
        select: () => { if (action !== 'update') action = 'select'; return builder },
        update: (value: any) => { action = 'update'; payload = value; return builder },
        insert: (value: any) => { action = 'insert'; payload = value; return builder },
        delete: () => { action = 'delete'; return builder },
        eq: (column: string, value: unknown) => { filters.push([column, value]); return builder },
        maybeSingle: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => execute().then(resolve, reject),
      }
      async function execute() {
        const matchesAttempt = filters.every(([column, value]) => attempt[column] === value)
        if (table === 'payment_attempts') {
          if (!matchesAttempt) return { data: null, error: null }
          if (action === 'update') attempt = { ...attempt, ...payload }
          return { data: { ...attempt }, error: null }
        }
        if (table === 'orders') {
          if (action === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
          return { data: { id: attempt.id }, error: null }
        }
        if (table === 'order_items') {
          if (action === 'select') return { data: rows.order_items.filter((row) => filters.every(([column, value]) => row[column] === value)), error: null }
          if (action === 'delete') {
            rows.order_items = rows.order_items.filter((row) => !filters.every(([column, value]) => row[column] === value))
            return { data: null, error: null }
          }
          if (action === 'insert') {
            rows.order_items.push(...(Array.isArray(payload) ? payload : [payload]))
            return { data: null, error: null }
          }
        }
        throw new Error(`Unexpected ${action} on ${table}`)
      }
      return builder
    }),
  }
  return { db: db as any, getAttempt: () => attempt, getOrderItems: () => rows.order_items }
}

const paidStatus: HostedStatusResult = {
  status: 'completed', statusCode: 1, amountCents: 550, currency: 'USD',
  merchantReference: 'ys:ref-1', confirmationCode: 'confirm-1', paymentMethod: 'Card',
  paymentAccount: null, createdAt: '2026-10-16T10:00:00.000Z',
}

describe('Pesapal transaction reconciliation', () => {
  beforeEach(() => jest.clearAllMocks())

  test('fulfills once and makes the duplicate IPN a no-op', async () => {
    const { db, getAttempt } = dbFixture()
    const provider = { getTransactionStatus: jest.fn(async () => paidStatus) } as any
    const args = { db, provider, trackingId: 'track-1', merchantReference: 'ys:ref-1' }
    const first = await reconcilePesapalPayment(args)
    const second = await reconcilePesapalPayment(args)

    expect(first).toMatchObject({ status: 'completed', confirmed: true, orderId: 'order-1', noOp: false })
    expect(second).toMatchObject({ status: 'completed', confirmed: true, noOp: true })
    expect(createPaidOrder).toHaveBeenCalledTimes(1)
    expect(provider.getTransactionStatus).toHaveBeenCalledTimes(2)
    expect(getAttempt().status).toBe('completed')
  })

  test('does not fulfill a tampered merchant reference or provider amount', async () => {
    const { db } = dbFixture()
    const provider = { getTransactionStatus: jest.fn(async () => paidStatus) } as any
    const forgedReference = await reconcilePesapalPayment({ db, provider, trackingId: 'track-1', merchantReference: 'ys:forged' })
    expect(forgedReference.httpStatus).toBe(409)
    expect(createPaidOrder).not.toHaveBeenCalled()

    const wrongAmount = await reconcilePesapalPayment({
      db, provider: { getTransactionStatus: jest.fn(async () => ({ ...paidStatus, amountCents: 1 })) } as any,
      trackingId: 'track-1', merchantReference: 'ys:ref-1',
    })
    expect(wrongAmount.httpStatus).toBe(409)
    expect(createPaidOrder).not.toHaveBeenCalled()
  })

  test('repairs missing catalogue order items after a partial fulfillment retry', async () => {
    const { db, getAttempt, getOrderItems } = catalogueRetryDbFixture()
    const provider = { getTransactionStatus: jest.fn(async () => ({ ...paidStatus, amountCents: 600, merchantReference: 'ys:catalogue' })) } as any

    const result = await reconcilePesapalPayment({ db, provider, trackingId: 'track-catalogue', merchantReference: 'ys:catalogue' })

    expect(result).toMatchObject({ status: 'completed', confirmed: true, orderId: 'attempt-catalogue' })
    expect(getOrderItems()).toEqual([{ order_id: 'attempt-catalogue', service_id: 'service-1', quantity: 2, unit_price: 300 }])
    expect(getAttempt().status).toBe('completed')
  })
})
