import { confirmedMarketplaceOrderHref } from '@/lib/orderLinks'

describe('confirmed checkout order destination', () => {
  it('opens the specific portal order after payment is confirmed', () => {
    expect(confirmedMarketplaceOrderHref({ confirmed: true, orderId: 'order-123' }))
      .toBe('/?view=orders&order=order-123')
  })

  it('does not open an order before confirmation or without an order ID', () => {
    expect(confirmedMarketplaceOrderHref({ confirmed: false, orderId: 'order-123' })).toBeNull()
    expect(confirmedMarketplaceOrderHref({ confirmed: true })).toBeNull()
    expect(confirmedMarketplaceOrderHref(null)).toBeNull()
  })
})
