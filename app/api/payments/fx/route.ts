import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentSettings } from '@/lib/payments/settings'

export const dynamic = 'force-dynamic'

const LOCAL_CURRENCIES = ['GBP', 'CAD', 'AUD']
const MAX_RATE_AGE_MS = 4 * 24 * 60 * 60 * 1000

export async function GET() {
  try {
    const db = createSupabaseAdminClient()
    const [ratesResult, settings] = await Promise.all([
      db.from('fx_rates').select('base, quote, rate, source, fetched_at')
        .in('base', ['USD', 'EUR']).in('quote', [...LOCAL_CURRENCIES, 'USD']).order('fetched_at', { ascending: false }),
      getPaymentSettings(db),
    ])
    if (ratesResult.error) throw ratesResult.error

    const rates: Record<string, number> = {}
    let fetchedAt: string | undefined
    let source: string | undefined
    const cutoff = Date.now() - MAX_RATE_AGE_MS
    const direct = new Map<string, { rate: number; timestamp: number; fetchedAt: string; source: string }>()
    const euro = new Map<string, { rate: number; timestamp: number; fetchedAt: string; source: string }>()
    for (const row of ratesResult.data || []) {
      const timestamp = new Date(row.fetched_at).getTime()
      const rate = Number(row.rate)
      if (timestamp < cutoff || !Number.isFinite(rate) || rate <= 0) continue
      const target = row.base === 'USD' ? direct : euro
      if (!target.has(row.quote)) target.set(row.quote, { rate, timestamp, fetchedAt: row.fetched_at, source: row.source })
    }
    const usdPerEuro = euro.get('USD')
    for (const currency of LOCAL_CURRENCIES) {
      const directRate = direct.get(currency)
      const euroRate = euro.get(currency)
      const rate = directRate?.rate ?? (euroRate && usdPerEuro ? euroRate.rate / usdPerEuro.rate : undefined)
      if (!rate || !Number.isFinite(rate) || rate <= 0) continue
      const timestamp = directRate?.timestamp ?? Math.min(euroRate!.timestamp, usdPerEuro!.timestamp)
      const rowTime = directRate?.fetchedAt ?? (euroRate!.timestamp <= usdPerEuro!.timestamp ? euroRate!.fetchedAt : usdPerEuro!.fetchedAt)
      rates[currency] = rate * (1 + settings.global.fx_markup_bps / 10_000)
      if (!fetchedAt || timestamp > Date.parse(fetchedAt)) {
        fetchedAt = rowTime
        source = directRate?.source || euroRate?.source || usdPerEuro?.source
      }
    }
    return Response.json({ rates, fetchedAt: fetchedAt || null, source: source || null }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ rates: {}, fetchedAt: null, source: null }, { headers: { 'cache-control': 'no-store' } })
  }
}
