let mockAuth: any
let mockAssertMethodAllowed: jest.Mock
let mockInvoiceOrder: jest.Mock
const mockCharge = jest.fn()

jest.mock('@/lib/auth', () => ({ getClerkUserId: jest.fn(async () => 'clerk-client') }))
jest.mock('@/lib/cpuTimeout', () => ({ CPU_TIMEOUT_REGEX: /cpu timeout/i }))
jest.mock('@/lib/checkoutOrders', () => ({
  resolveCheckoutItem: jest.fn(async () => ({
    clientProfileId: 'client-profile', providerProfileId: 'provider-profile',
    totalCents: 2500, title: 'Test service', gigId: 'gig-1', sourceId: 'gig-1', sourceType: 'gig',
  })),
  createPaidOrder: jest.fn(),
}))
jest.mock('@/lib/portalAuth', () => ({ requirePortalUser: jest.fn(async () => mockAuth) }))
jest.mock('@/lib/attribution/cookies', () => ({ readAttributionToken: jest.fn(() => null) }))
jest.mock('@/lib/wallet', () => ({ credit: jest.fn(), debit: jest.fn(), getOrCreateWallet: jest.fn() }))
jest.mock('@/lib/earnings', () => ({ creditEarning: jest.fn() }))
jest.mock('@/lib/payments', () => ({ getPaymentProvider: () => ({ charge: mockCharge, chargeVaulted: mockCharge }) }))
jest.mock('@/lib/payments/availability', () => {
  const actual = jest.requireActual('@/lib/payments/availability')
  return { ...actual, assertMethodAllowed: (...args: unknown[]) => mockAssertMethodAllowed(...args) }
})
jest.mock('@/lib/payments/invoiceRequest', () => ({ createInvoiceRequestOrder: (...args: unknown[]) => mockInvoiceOrder(...args) }))
jest.mock('@/lib/payments/settings', () => ({ getConfiguredDefaultGateway: jest.fn(async () => 'nmi') }))
jest.mock('@/lib/orderLinks', () => ({ marketplaceOrdersHref: jest.fn(() => '/dashboard/orders') }))
jest.mock('@/lib/idempotency', () => ({
  claimIdempotencyKey: jest.fn(), completeIdempotencyKey: jest.fn(), extractIdempotencyKey: jest.fn(() => null), recordPaymentIncident: jest.fn(),
}))

describe('POST /api/checkout/order payment enforcement', () => {
  beforeEach(() => {
    mockAuth = {
      db: {}, profileId: 'client-profile', role: 'client',
      profile: { id: 'client-profile', email: 'client@example.test', full_name: 'Test Client' },
    }
    mockAssertMethodAllowed = jest.fn()
    mockInvoiceOrder = jest.fn(async () => ({ id: 'invoice-order-1' }))
    mockCharge.mockReset()
  })

  async function postNewCard() {
    const { POST } = await import('@/app/api/checkout/order/route')
    return POST(new Request('http://portal.test/api/checkout/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceType: 'gig', sourceId: 'gig-1', paymentMethod: 'new_card', token: 'opaque-test-token' }),
    }))
  }

  it('returns 409 for a disabled selected method before calling a gateway', async () => {
    const { MethodUnavailableError } = jest.requireActual('@/lib/payments/availability')
    mockAssertMethodAllowed.mockRejectedValue(new MethodUnavailableError('nmi:card', false))

    const response = await postNewCard()
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe('method_unavailable')
    expect(mockCharge).not.toHaveBeenCalled()
    expect(mockInvoiceOrder).not.toHaveBeenCalled()
  })

  it('creates an unpaid invoice request and makes no gateway call when all methods are disabled', async () => {
    const { MethodUnavailableError } = jest.requireActual('@/lib/payments/availability')
    mockAssertMethodAllowed.mockRejectedValue(new MethodUnavailableError('nmi:card', true))

    const response = await postNewCard()
    const payload = await response.json()

    expect(response.status).toBe(409)
    expect(payload.code).toBe('method_unavailable')
    expect(payload.fallback).toBe('invoice_request')
    expect(payload.orderId).toBe('invoice-order-1')
    expect(mockInvoiceOrder).toHaveBeenCalledTimes(1)
    expect(mockCharge).not.toHaveBeenCalled()
  })
})
