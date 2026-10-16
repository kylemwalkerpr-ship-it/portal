export type EcbRates = Record<string, number>

export type FxQuote = {
  baseAmountUsdMinor: number
  chargeCurrency: 'USD' | 'GBP' | 'CAD' | 'AUD'
  chargeAmountMinor: number
  fxRate: number
  fxRateSource: string
  fxRateFetchedAt: string
  fxMarkupBps: number
  quoteExpiresAt: string
}

const ALLOWED_CURRENCIES = new Set(['USD', 'GBP', 'CAD', 'AUD'])

/** ECB rates are quoted as units of currency per EUR. */
export function ecbCrossRate(base: string, quote: string, rates: EcbRates): number {
  const baseCode = base.toUpperCase()
  const quoteCode = quote.toUpperCase()
  if (baseCode === quoteCode) return 1
  const basePerEur = baseCode === 'EUR' ? 1 : Number(rates[baseCode])
  const quotePerEur = quoteCode === 'EUR' ? 1 : Number(rates[quoteCode])
  if (!(basePerEur > 0) || !(quotePerEur > 0) || !Number.isFinite(basePerEur) || !Number.isFinite(quotePerEur)) {
    throw new Error(`ECB rate unavailable for ${baseCode}/${quoteCode}.`)
  }
  return quotePerEur / basePerEur
}

/** All P0 currencies use two minor-unit decimals. Positive half values round upward. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Cannot round a non-finite payment amount.')
  return Math.floor(value + 0.5)
}

export function makeFxQuote(args: {
  baseAmountUsdMinor: number
  chargeCurrency: string
  fxRate: number
  fxRateSource: string
  fxRateFetchedAt: string | Date
  fxMarkupBps?: number
  now?: string | Date
  lockMinutes?: number
}): FxQuote {
  const currency = args.chargeCurrency.toUpperCase()
  if (!ALLOWED_CURRENCIES.has(currency)) throw new Error(`Unsupported payment currency: ${currency}.`)
  if (!Number.isSafeInteger(args.baseAmountUsdMinor) || args.baseAmountUsdMinor <= 0) throw new Error('USD amount must be a positive integer in minor units.')
  if (!(args.fxRate > 0) || !Number.isFinite(args.fxRate)) throw new Error('FX rate must be positive and finite.')
  const markup = args.fxMarkupBps ?? 0
  if (!Number.isInteger(markup) || markup < 0) throw new Error('FX markup must be a non-negative integer in basis points.')

  const rate = currency === 'USD' ? 1 : args.fxRate * (1 + markup / 10_000)
  const chargeAmountMinor = currency === 'USD'
    ? args.baseAmountUsdMinor
    : roundHalfUp(args.baseAmountUsdMinor * rate)
  const now = args.now ? new Date(args.now) : new Date()
  const lockMinutes = args.lockMinutes ?? 30
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(lockMinutes) || lockMinutes <= 0) throw new Error('Invalid FX quote lock.')

  return {
    baseAmountUsdMinor: args.baseAmountUsdMinor,
    chargeCurrency: currency as FxQuote['chargeCurrency'],
    chargeAmountMinor,
    fxRate: rate,
    fxRateSource: args.fxRateSource,
    fxRateFetchedAt: new Date(args.fxRateFetchedAt).toISOString(),
    fxMarkupBps: markup,
    quoteExpiresAt: new Date(now.getTime() + lockMinutes * 60_000).toISOString(),
  }
}

export function isFxQuoteExpired(quoteExpiresAt: string | Date, now: string | Date = new Date()): boolean {
  return new Date(now).getTime() >= new Date(quoteExpiresAt).getTime()
}

/** Use the display currency when supported; otherwise charge in USD and keep the local estimate separate. */
export function resolveChargeCurrency(displayCurrency: string, supportedCurrencies: readonly string[]) {
  const display = displayCurrency.toUpperCase()
  if (!ALLOWED_CURRENCIES.has(display)) throw new Error(`Unsupported display currency: ${display}.`)
  const supported = supportedCurrencies.map((currency) => currency.toUpperCase())
  if (supported.includes(display)) return { chargeCurrency: display, usesUsdFallback: false }
  if (supported.includes('USD')) return { chargeCurrency: 'USD', usesUsdFallback: true }
  throw new Error(`No supported charge currency for ${display}.`)
}
