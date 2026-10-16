export type EcbRates = Record<string, number>
export type EcbRateSnapshot = { rates: EcbRates; fetchedAt: string; source: 'ECB' }

const ECB_DAILY_XML_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
const ECB_SOURCE = 'https://www.ecb.europa.eu/stats/eurofxref/'

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

/** Convert a two-decimal minor-unit amount using the ECB reference rate, with no markup. */
export function convertMinorUnits(amountMinor: number, from: string, to: string, rates: EcbRates): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Amount must be a non-negative integer in minor units.')
  const rate = ecbCrossRate(from, to, rates)
  return roundHalfUp(amountMinor * rate)
}

/** Parse the ECB daily reference-rate XML response for deterministic tests and route use. */
export function parseEcbDailyRates(xml: string): EcbRateSnapshot {
  const date = xml.match(/<Cube\s+time="(\d{4}-\d{2}-\d{2})"\s*\/?\s*>/i)?.[1]
  if (!date) throw new Error('ECB response did not contain a reference date.')
  const rates: EcbRates = {}
  for (const match of xml.matchAll(/<Cube\s+currency="([A-Z]{3})"\s+rate="([0-9.]+)"\s*\/?\s*>/gi)) {
    const rate = Number(match[2])
    if (Number.isFinite(rate) && rate > 0) rates[match[1].toUpperCase()] = rate
  }
  if (!rates.USD || !rates.GBP || !rates.CAD || !rates.AUD) {
    throw new Error('ECB response is missing a required USD, GBP, CAD, or AUD rate.')
  }
  return { rates, fetchedAt: `${date}T16:00:00.000Z`, source: 'ECB' }
}

/** Fetch the public ECB daily reference rates. Next.js caches the result for one hour. */
export async function fetchEcbDailyRates(fetcher: typeof fetch = fetch): Promise<EcbRateSnapshot> {
  const response = await fetcher(ECB_DAILY_XML_URL, { cache: 'force-cache', next: { revalidate: 3600 } } as RequestInit)
  if (!response.ok) throw new Error('ECB reference rates are temporarily unavailable.')
  return parseEcbDailyRates(await response.text())
}

export function estimateDisplayAmountUsdMinor(baseAmountUsdMinor: number, displayCurrency: string, rates: EcbRates) {
  return convertMinorUnits(baseAmountUsdMinor, 'USD', displayCurrency, rates)
}

export type PesapalCurrencyQuote = {
  baseAmountUsdMinor: number
  chargeAmountMinor: number
  chargeCurrency: 'USD' | 'GBP'
  displayAmountMinor: number
  displayCurrency: 'USD' | 'GBP' | 'CAD' | 'AUD'
  sourceCurrency: 'USD' | 'GBP' | 'CAD' | 'AUD'
  fxRateToUsd: number
  fxRateToDisplay: number
}

/** Resolve a source amount to Pesapal settlement and a no-markup display estimate. */
export function resolvePesapalCurrencyQuote(args: {
  amountMinor: number
  sourceCurrency: string
  displayCurrency?: string
  rates?: EcbRates
}): PesapalCurrencyQuote {
  if (!Number.isSafeInteger(args.amountMinor) || args.amountMinor <= 0) throw new Error('Amount must be a positive integer in minor units.')
  const sourceCurrency = args.sourceCurrency.toUpperCase()
  const displayCurrency = (args.displayCurrency || 'USD').toUpperCase()
  if (!ALLOWED_CURRENCIES.has(sourceCurrency)) throw new Error(`Unsupported source currency: ${sourceCurrency}.`)
  if (!ALLOWED_CURRENCIES.has(displayCurrency)) throw new Error(`Unsupported display currency: ${displayCurrency}.`)
  const rates = args.rates || {}
  const baseAmountUsdMinor = sourceCurrency === 'USD'
    ? args.amountMinor
    : convertMinorUnits(args.amountMinor, sourceCurrency, 'USD', rates)
  const chargeCurrency: 'USD' | 'GBP' = sourceCurrency === 'GBP' ? 'GBP' : 'USD'
  const chargeAmountMinor = chargeCurrency === sourceCurrency ? args.amountMinor : baseAmountUsdMinor
  const displayAmountMinor = displayCurrency === sourceCurrency
    ? args.amountMinor
    : displayCurrency === 'USD'
      ? baseAmountUsdMinor
      : convertMinorUnits(baseAmountUsdMinor, 'USD', displayCurrency, rates)
  return {
    baseAmountUsdMinor,
    chargeAmountMinor,
    chargeCurrency,
    displayAmountMinor,
    displayCurrency: displayCurrency as PesapalCurrencyQuote['displayCurrency'],
    sourceCurrency: sourceCurrency as PesapalCurrencyQuote['sourceCurrency'],
    fxRateToUsd: sourceCurrency === 'USD' ? 1 : ecbCrossRate(sourceCurrency, 'USD', rates),
    fxRateToDisplay: displayCurrency === 'USD' ? 1 : ecbCrossRate('USD', displayCurrency, rates),
  }
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
