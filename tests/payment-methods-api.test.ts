let mockMethods: any[]
const mockGetProvider = jest.fn()

jest.mock('@/lib/portalAuth', () => ({ getOptionalPortalUser: jest.fn(async () => null) }))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn(() => ({})) }))
jest.mock('@/lib/payments/availability', () => ({ getAvailableMethods: jest.fn(async () => mockMethods) }))
jest.mock('@/lib/payments', () => ({ getPaymentProvider: (...args: unknown[]) => mockGetProvider(...args) }))

describe('GET /api/payments/methods', () => {
  beforeEach(() => {
    mockMethods = [{
      methodKey: 'nmi:card', provider: 'nmi', id: 'card', label: 'Card', logoAsset: '/payments/nmi.svg',
      mode: 'inline-token', displayCurrency: 'USD', chargeCurrency: 'USD', currencies: ['USD'], countries: [],
      priority: 10, isDefault: true, minAmountMinor: null, maxAmountMinor: null,
      supportsRefund: true, supportsPartialRefund: true, supportsVault: true,
    }]
    mockGetProvider.mockReset().mockReturnValue({ getClientConfig: () => ({
      provider: 'nmi', mode: 'inline-token', tokenizationKey: 'public-token-value', scriptUrl: 'https://example.test/collect.js',
      consumerSecret: 'fake-secret', privateKey: 'fake-private-key', consumerKey: 'fake-consumer-key', token: 'opaque-private-token',
    }) })
  })

  it('is no-store and returns only client-safe fields for available methods', async () => {
    const { GET } = await import('@/app/api/payments/methods/route')
    const response = await GET(new Request('http://portal.test/api/payments/methods?currency=USD&amountUsd=10'))
    const payload = await response.json()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(payload.methods).toHaveLength(1)
    expect(payload.methods[0].clientConfig.tokenizationKey).toBe('public-token-value')
    expect(mockGetProvider).toHaveBeenCalledTimes(1)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toMatch(/PESAPAL_CONSUMER_(KEY|SECRET)|consumer_secret|private_key|fake-secret|fake-private-key|fake-consumer-key|opaque-private-token/i)
    expect(payload.methods[0]).not.toHaveProperty('consumerSecret')
    expect(payload.methods[0].clientConfig).not.toHaveProperty('privateKey')
  })

  it('rejects unsupported display currencies without caching the response', async () => {
    const { GET } = await import('@/app/api/payments/methods/route')
    const response = await GET(new Request('http://portal.test/api/payments/methods?currency=KES'))
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
