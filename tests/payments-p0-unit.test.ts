import { PAYMENT_CAPABILITIES, getMethodCapability, getProviderCapability, isSupportedCurrency } from '@/lib/payments/registry'
import { createVersionedSettingsCache, type PaymentSettingsSnapshot } from '@/lib/payments/settings'
import { resolveAvailableMethods } from '@/lib/payments/availability'
import { convertMinorUnits, ecbCrossRate, fetchEcbDailyRates, isFxQuoteExpired, makeFxQuote, resolveChargeCurrency, resolvePesapalCurrencyQuote, roundHalfUp } from '@/lib/payments/fx'
import { isPaymentSettingsOwner, parsePaymentSettingsOwnerIds } from '@/lib/payments/adminSettings'

const OWNER_ID = 'd90e74a5-b4cf-4f3e-81ed-9ef71e7235a7'

function settings(overrides: Partial<PaymentSettingsSnapshot> = {}): PaymentSettingsSnapshot {
  return {
    version: 1,
    providers: [
      { provider: 'nmi', enabled: true, retired: false, test_mode_owner_only: false, test_allowlist: [], priority: 10, is_default: true, updated_by: null, updated_at: null, version: 1 },
      { provider: 'pesapal', enabled: true, retired: false, test_mode_owner_only: true, test_allowlist: [OWNER_ID], priority: 20, is_default: false, updated_by: null, updated_at: null, version: 1 },
    ],
    methods: [
      { provider: 'nmi', method: 'card', enabled: true, currencies: ['USD'], countries: ['GB'], priority: 10, min_amount_minor: null, max_amount_minor: null },
      { provider: 'pesapal', method: 'card', enabled: true, currencies: ['USD', 'GBP'], countries: ['GB'], priority: 20, min_amount_minor: null, max_amount_minor: null },
      { provider: 'pesapal', method: 'mpesa', enabled: true, currencies: ['USD', 'GBP'], countries: ['GB'], priority: 30, min_amount_minor: null, max_amount_minor: null },
    ],
    global: { country_default_routing_enabled: false, fx_markup_bps: 0, version: 1 },
    ...overrides,
  }
}

describe('payment capability registry', () => {
  it('contains unique provider/method capabilities and local logos', () => {
    const keys = PAYMENT_CAPABILITIES.flatMap((provider) => provider.methods.map((method) => `${provider.provider}:${method.id}`))
    expect(new Set(keys).size).toBe(keys.length)
    expect(PAYMENT_CAPABILITIES.every((provider) => provider.logoAsset.startsWith('/payments/') && provider.logoAsset.endsWith('.svg'))).toBe(true)
    expect(getProviderCapability('pesapal')?.mode).toBe('hosted-redirect')
    expect(getMethodCapability('pesapal', 'mpesa')?.currencies).toEqual(['USD', 'GBP'])
    expect(getMethodCapability('unknown', 'card')).toBeUndefined()
    expect(isSupportedCurrency('cad')).toBe(true)
    expect(isSupportedCurrency('KES')).toBe(false)
  })
})

describe('payment availability', () => {
  it('requires enabled providers and methods, and enforces the USD-equivalent $5 minimum', () => {
    const snapshot = settings()
    expect(resolveAvailableMethods({ currency: 'USD', amount: 4.99 }, snapshot)).toHaveLength(0)
    expect(resolveAvailableMethods({ currency: 'USD', amount: 4.999 }, snapshot)).toHaveLength(0)
    expect(resolveAvailableMethods({ currency: 'USD', amount: 5 }, snapshot).map((method) => method.methodKey)).toContain('nmi:card')

    snapshot.providers[0]!.enabled = false
    snapshot.methods[0]!.enabled = false
    expect(resolveAvailableMethods({ currency: 'USD', amount: 20 }, snapshot)).toEqual([])
  })

  it('limits owner-test methods to the allowlist', () => {
    const snapshot = settings()
    const allowed = resolveAvailableMethods({ profile: { id: OWNER_ID }, currency: 'USD', amount: 10 }, snapshot)
    const other = resolveAvailableMethods({ profile: { id: '11111111-1111-4111-8111-111111111111' }, currency: 'USD', amount: 10 }, snapshot)
    expect(allowed.map((method) => method.provider)).toContain('pesapal')
    expect(other.map((method) => method.provider)).not.toContain('pesapal')
  })

  it('uses provider fallback currency and ignores country until routing is enabled', () => {
    const snapshot = settings()
    const methods = resolveAvailableMethods({ profile: { id: OWNER_ID }, currency: 'GBP', country: 'US', amount: 10 }, snapshot)
    expect(methods.find((method) => method.methodKey === 'nmi:card')?.chargeCurrency).toBe('USD')
    expect(methods.find((method) => method.methodKey === 'pesapal:card')?.chargeCurrency).toBe('GBP')

    snapshot.global.country_default_routing_enabled = true
    expect(resolveAvailableMethods({ profile: { id: OWNER_ID }, currency: 'GBP', country: 'US', amount: 10 }, snapshot)).toEqual([])
  })

  it('falls back to USD for CAD and AUD on USD-only capabilities', () => {
    const snapshot = settings({ providers: settings().providers.slice(0, 1), methods: settings().methods.slice(0, 1) })
    for (const currency of ['CAD', 'AUD']) {
      expect(resolveAvailableMethods({ currency, amount: 10 }, snapshot)[0]?.chargeCurrency).toBe('USD')
    }
    expect(resolveAvailableMethods({ currency: 'KES', amount: 10 }, snapshot)).toEqual([])
  })
})

describe('version-keyed cache', () => {
  it('refreshes immediately when the database version changes and again after its TTL', async () => {
    let now = 0
    const cache = createVersionedSettingsCache<number>(30_000, () => now)
    const key = {}
    let version = 1
    let loads = 0
    const readVersion = async () => version
    const load = async (currentVersion: number) => { loads += 1; return currentVersion }

    expect(await cache.get(key, readVersion, load)).toBe(1)
    expect(await cache.get(key, readVersion, load)).toBe(1)
    expect(loads).toBe(1)
    version = 2
    expect(await cache.get(key, readVersion, load)).toBe(2)
    expect(loads).toBe(2)
    now = 30_000
    expect(await cache.get(key, readVersion, load)).toBe(2)
    expect(loads).toBe(3)
  })
})

describe('ECB currency quotes', () => {
  it('derives USD cross rates through EUR', () => {
    expect(ecbCrossRate('USD', 'GBP', { USD: 1.1, GBP: 0.85 })).toBeCloseTo(0.85 / 1.1, 10)
  })

  it('rounds half-up and locks a quote for 30 minutes', () => {
    expect(roundHalfUp(2.5)).toBe(3)
    const quote = makeFxQuote({
      baseAmountUsdMinor: 101,
      chargeCurrency: 'GBP',
      fxRate: 0.5,
      fxRateSource: 'ECB',
      fxRateFetchedAt: '2026-10-16T14:00:00.000Z',
      now: '2026-10-16T14:00:00.000Z',
    })
    expect(quote.chargeAmountMinor).toBe(51)
    expect(quote.quoteExpiresAt).toBe('2026-10-16T14:30:00.000Z')
    expect(isFxQuoteExpired(quote.quoteExpiresAt, '2026-10-16T14:29:59.999Z')).toBe(false)
    expect(isFxQuoteExpired(quote.quoteExpiresAt, '2026-10-16T14:30:00.000Z')).toBe(true)
  })

  it('charges CAD and AUD as USD when a provider does not support them, and keeps GBP in GBP', () => {
    expect(resolveChargeCurrency('CAD', ['USD', 'GBP'])).toEqual({ chargeCurrency: 'USD', usesUsdFallback: true })
    expect(resolveChargeCurrency('AUD', ['USD'])).toEqual({ chargeCurrency: 'USD', usesUsdFallback: true })
    expect(resolveChargeCurrency('GBP', ['USD', 'GBP'])).toEqual({ chargeCurrency: 'GBP', usesUsdFallback: false })
  })

  it('uses ECB rates without markup for Pesapal settlement and display estimates', () => {
    const rates = { USD: 1.2, GBP: 0.8, CAD: 1.6, AUD: 1.8 }
    expect(convertMinorUnits(10_000, 'CAD', 'USD', rates)).toBe(7_500)
    const cad = resolvePesapalCurrencyQuote({ amountMinor: 10_000, sourceCurrency: 'CAD', displayCurrency: 'CAD', rates })
    expect(cad).toMatchObject({ baseAmountUsdMinor: 7_500, chargeAmountMinor: 7_500, chargeCurrency: 'USD', displayAmountMinor: 10_000 })
    const gbp = resolvePesapalCurrencyQuote({ amountMinor: 4_000, sourceCurrency: 'GBP', displayCurrency: 'CAD', rates })
    expect(gbp).toMatchObject({ baseAmountUsdMinor: 6_000, chargeAmountMinor: 4_000, chargeCurrency: 'GBP', displayAmountMinor: 8_000 })
    const belowMinimum = resolvePesapalCurrencyQuote({ amountMinor: 660, sourceCurrency: 'CAD', rates })
    expect(belowMinimum.baseAmountUsdMinor).toBe(495)
  })

  it('fetches and parses the ECB daily rate feed through an injected fetcher', async () => {
    const xml = '<Cube time="2026-10-16"><Cube currency="USD" rate="1.20"/><Cube currency="GBP" rate="0.80"/><Cube currency="CAD" rate="1.60"/><Cube currency="AUD" rate="1.80"/></Cube>'
    const fetcher = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(xml, { status: 200 }))
    const snapshot = await fetchEcbDailyRates(fetcher as unknown as typeof fetch)
    expect(snapshot).toMatchObject({ source: 'ECB', fetchedAt: '2026-10-16T16:00:00.000Z', rates: { USD: 1.2, GBP: 0.8, CAD: 1.6, AUD: 1.8 } })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')
  })
})

describe('payment settings owner ids', () => {
  it('accepts only admin profiles listed in PAYMENT_SETTINGS_OWNER_IDS', () => {
    const value = `PAYMENT_SETTINGS_OWNER_IDS=${OWNER_ID}`.split('=')[1]
    expect(parsePaymentSettingsOwnerIds(value).has(OWNER_ID)).toBe(true)
    expect(isPaymentSettingsOwner(OWNER_ID, 'admin', value)).toBe(true)
    expect(isPaymentSettingsOwner(OWNER_ID, 'support', value)).toBe(false)
    expect(isPaymentSettingsOwner('11111111-1111-4111-8111-111111111111', 'admin', value)).toBe(false)
  })
})
