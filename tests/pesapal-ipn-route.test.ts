jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn(() => ({})) }))
jest.mock('@/lib/payments', () => ({ getPaymentProvider: jest.fn(() => ({ getTransactionStatus: jest.fn() })) }))
jest.mock('@/lib/payments/pesapalReconciliation', () => ({
  reconcilePesapalPayment: jest.fn(async () => ({ httpStatus: 200, status: 'completed', confirmed: true, message: 'Payment confirmed.' })),
}))

import { reconcilePesapalPayment } from '@/lib/payments/pesapalReconciliation'
import { GET, POST } from '@/app/api/webhooks/pesapal/ipn/route'

describe('Pesapal IPN route', () => {
  beforeEach(() => jest.clearAllMocks())

  test('acknowledges a GET IPN after requesting server-side reconciliation', async () => {
    const response = await GET(new Request('https://portal.example/api/webhooks/pesapal/ipn?OrderTrackingId=track-1&OrderMerchantReference=ys%3Aref-1&OrderNotificationType=CHANGE'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      orderNotificationType: 'CHANGE', orderTrackingId: 'track-1', orderMerchantReference: 'ys:ref-1', status: 200,
    })
    expect(reconcilePesapalPayment).toHaveBeenCalledWith(expect.objectContaining({ trackingId: 'track-1', merchantReference: 'ys:ref-1' }))
  })

  test('accepts Pesapal POST form notifications and returns the required acknowledgement', async () => {
    const response = await POST(new Request('https://portal.example/api/webhooks/pesapal/ipn', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'OrderTrackingId=track-1&OrderMerchantReference=ys%3Aref-1&OrderNotificationType=POST',
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      orderNotificationType: 'POST', orderTrackingId: 'track-1', orderMerchantReference: 'ys:ref-1', status: 200,
    })
  })

  test('ignores unverified status, amount, and currency fields in a JSON notification', async () => {
    const response = await POST(new Request('https://portal.example/api/webhooks/pesapal/ipn', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        OrderTrackingId: 'track-1', OrderMerchantReference: 'ys:ref-1', OrderNotificationType: 'POST',
        status: 'COMPLETED', amount: 0.01, currency: 'AUD',
      }),
    }))
    expect(response.status).toBe(200)
    expect(reconcilePesapalPayment).toHaveBeenCalledWith(expect.objectContaining({ trackingId: 'track-1', merchantReference: 'ys:ref-1' }))
    expect((reconcilePesapalPayment as jest.Mock).mock.calls[0]?.[0]).not.toHaveProperty('amount')
    expect((reconcilePesapalPayment as jest.Mock).mock.calls[0]?.[0]).not.toHaveProperty('currency')
  })

  test('does not acknowledge mismatched stored/provider payment details as valid', async () => {
    ;(reconcilePesapalPayment as jest.Mock).mockResolvedValueOnce({
      httpStatus: 409, status: 'invalid', confirmed: false, message: 'Pesapal payment details did not match the pending checkout.',
    })
    const response = await GET(new Request('https://portal.example/api/webhooks/pesapal/ipn?OrderTrackingId=track-1&OrderMerchantReference=ys%3Afake&OrderNotificationType=CHANGE'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ confirmed: false })
  })
})
