jest.mock('@/lib/portalAuth', () => ({
  requirePortalUser: jest.fn(async () => ({
    db: (globalThis as any).__pesapalSessionDb,
    profile: { id: 'client-1', email: 'client@example.com', full_name: 'Client', country_code: 'CA' },
    profileId: 'client-1', role: 'client',
  })),
}))
jest.mock('@/lib/supabase', () => ({ createSupabaseAdminClient: jest.fn(() => (globalThis as any).__pesapalSessionDb) }))
jest.mock('@/lib/payments', () => ({ getPaymentProvider: jest.fn(() => ({ createHostedSession: mockCreateHostedSession })) }))
jest.mock('@/lib/payments/availability', () => ({
  assertMethodAllowed: jest.fn(async () => ({})),
  MethodUnavailableError: class MethodUnavailableError extends Error {},
}))
jest.mock('@/lib/payments/settings', () => ({ getPaymentSettings: jest.fn(async () => ({ version: 7 })) }))
jest.mock('@/lib/checkoutOrders', () => ({
  resolveCheckoutItem: jest.fn(async () => (globalThis as any).__pesapalResolvedItem),
}))
jest.mock('@/lib/template-packs', () => ({ getTemplatePack: jest.fn(), getTemplatePackPriceCents: jest.fn() }))
jest.mock('@/lib/idempotency', () => ({
  claimIdempotencyKey: jest.fn(async () => ({ kind: 'ok' })),
  completeIdempotencyKey: jest.fn(async () => {}),
  extractIdempotencyKey: jest.fn((_request: Request, body: Record<string, unknown>) => body.idempotencyKey),
  recordPaymentIncident: jest.fn(async () => {}),
}))
jest.mock('@/lib/payments/fx', () => ({
  ecbCrossRate: jest.fn((base: string, quote: string, rates: Record<string, number>) => {
    if (base === quote) return 1
    return rates[quote] / rates[base]
  }),
  fetchEcbDailyRates: jest.fn(async () => ({
    source: 'ECB', fetchedAt: '2026-10-16T16:00:00.000Z', rates: { USD: 1.2, GBP: 0.8, CAD: 1.6, AUD: 1.8 },
  })),
  resolvePesapalCurrencyQuote: jest.requireActual('@/lib/payments/fx').resolvePesapalCurrencyQuote,
  roundHalfUp: jest.requireActual('@/lib/payments/fx').roundHalfUp,
}))

const mockCreateHostedSession = jest.fn()

import { POST } from '@/app/api/checkout/pesapal/session/route'

function fixture(sourceCurrency = 'CAD', totalCents = 10_000) {
  const state: { inserted?: Record<string, any>; updates: Array<Record<string, any>> } = { updates: [] }
  const db = {
    from: jest.fn((table: string) => {
      if (table !== 'payment_attempts') throw new Error(`Unexpected table ${table}`)
      return {
        insert: (payload: Record<string, any>) => {
          state.inserted = payload
          return { select: () => ({ single: async () => ({ data: { id: 'attempt-1' }, error: null }) }) }
        },
        update: (payload: Record<string, any>) => ({
          eq: async () => { state.updates.push(payload); return { error: null } },
        }),
      }
    }),
  }
  ;(globalThis as any).__pesapalSessionDb = db
  ;(globalThis as any).__pesapalResolvedItem = {
    sourceType: 'gig', sourceId: 'gig-1', title: 'Canadian gig', description: 'Work', currency: sourceCurrency.toLowerCase(),
    subtotalCents: totalCents, platformFeeCents: 0, totalCents, netPayoutCents: totalCents,
    providerProfileId: 'provider-1', providerType: 'consultant', clientProfileId: 'client-1', deliveryDays: 2,
    gigId: 'gig-1', tierId: 'tier-1',
  }
  mockCreateHostedSession.mockImplementation(async (request: Record<string, any>) => ({
    redirectUrl: 'https://pay.pesapal.com/v3/redirect', trackingId: 'tracking-1', merchantReference: request.merchantReference,
  }))
  return { state, db }
}

function request(body: Record<string, unknown>) {
  return new Request('https://portal.example/api/checkout/pesapal/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('Pesapal session route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete (globalThis as any).__pesapalSessionDb
    delete (globalThis as any).__pesapalResolvedItem
  })

  test('submits CAD-priced orders in USD and stores the pending session with source and FX data', async () => {
    const { state } = fixture('CAD', 10_000)
    const response = await POST(request({
      sourceType: 'gig', sourceId: 'gig-1', tierId: 'tier-1', methodKey: 'pesapal:card',
      displayCurrency: 'CAD', idempotencyKey: 'idem-1',
    }))
    expect(response.status).toBe(201)
    expect(mockCreateHostedSession).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 7_500, currency: 'USD' }))
    expect(state.inserted).toMatchObject({
      gateway: 'pesapal', profile_id: 'client-1', source_type: 'gig', source_id: 'gig-1',
      amount_minor: 7_500, currency: 'USD', charge_amount_minor: 7_500, charge_currency: 'USD',
      base_amount_usd_minor: 7_500, fx_markup_bps: 0, fx_rate_source: 'ECB', settings_version: 7,
      source_payload: { displayCurrency: 'CAD', displayAmountMinor: 10_000, orderItem: { currency: 'usd', totalCents: 7_500 } },
    })
    expect(state.updates[0]).toMatchObject({ provider_tracking_id: 'tracking-1', status: 'submitted' })
    await expect(response.json()).resolves.toMatchObject({ currency: 'USD', displayCurrency: 'CAD', displayAmountMinor: 10_000, baseAmountUsdMinor: 7_500 })
  })

  test('defaults to USD and rejects a CAD amount below five USD equivalent', async () => {
    fixture('USD', 1_000)
    const defaultResponse = await POST(request({ sourceType: 'gig', sourceId: 'gig-1', methodKey: 'pesapal:card', idempotencyKey: 'idem-usd' }))
    expect(defaultResponse.status).toBe(201)
    expect(mockCreateHostedSession).toHaveBeenLastCalledWith(expect.objectContaining({ currency: 'USD', amountCents: 1_000 }))

    fixture('CAD', 660)
    const lowResponse = await POST(request({ sourceType: 'gig', sourceId: 'gig-1', methodKey: 'pesapal:card', idempotencyKey: 'idem-low' }))
    expect(lowResponse.status).toBe(400)
    expect(mockCreateHostedSession).toHaveBeenCalledTimes(1)
  })
})
