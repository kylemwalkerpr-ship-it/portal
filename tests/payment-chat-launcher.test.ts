import { isPaymentScreen } from '@/components/ChatWidget'

describe('payment screen launcher suppression', () => {
  test.each([
    '/checkout',
    '/checkout/return',
    '/marketplace/cart',
    '/dev/checkout-preview',
    '/offers/offer-123/pay',
  ])('recognizes %s as a payment screen', (pathname) => {
    expect(isPaymentScreen(pathname)).toBe(true)
  })

  test('leaves unrelated screens eligible to show the launcher', () => {
    expect(isPaymentScreen('/marketplace')).toBe(false)
    expect(isPaymentScreen('/dashboard/billing')).toBe(false)
  })
})
