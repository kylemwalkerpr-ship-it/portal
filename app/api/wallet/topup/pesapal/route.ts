import { randomUUID } from 'crypto'
import { getCurrentStudent } from '@/lib/student'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'
import { assertMethodAllowed, MethodUnavailableError } from '@/lib/payments/availability'
import { getPaymentSettings } from '@/lib/payments/settings'
import { fetchEcbDailyRates, resolvePesapalCurrencyQuote } from '@/lib/payments/fx'
import { claimIdempotencyKey, completeIdempotencyKey, extractIdempotencyKey } from '@/lib/idempotency'

export function resolveWalletTopupQuote(amountCents: number, currency: string, rates?: Record<string, number>) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 500) throw new Error('Minimum top-up is $5.00.')
  const normalized = currency.toUpperCase()
  if (!['USD', 'GBP', 'CAD', 'AUD'].includes(normalized)) throw new Error('Unsupported currency.')
  return resolvePesapalCurrencyQuote({ amountMinor: amountCents, sourceCurrency: normalized, displayCurrency: normalized, rates })
}

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) }
  const amountCents = Number(body.amountCents)
  if (!Number.isSafeInteger(amountCents) || amountCents < 500) return Response.json({ error: 'Minimum top-up is $5.00.' }, { status: 400 })
  const displayCurrency = String(body.currency || 'USD').toUpperCase()
  if (!['USD', 'GBP', 'CAD', 'AUD'].includes(displayCurrency)) return Response.json({ error: 'Unsupported currency.' }, { status: 400 })
  const db = createSupabaseAdminClient()
  let rates: Awaited<ReturnType<typeof fetchEcbDailyRates>> | null = null
  try { if (displayCurrency !== 'USD') rates = await fetchEcbDailyRates() } catch { return Response.json({ error: 'Currency estimates are temporarily unavailable.' }, { status: 503 }) }
  let quote
  try { quote = resolveWalletTopupQuote(amountCents, displayCurrency, rates?.rates) }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid amount.' }, { status: 400 }) }
  try {
    await assertMethodAllowed('pesapal:card', { profile: { id: auth.profile.id }, currency: quote.chargeCurrency, country: auth.profile.country_code || undefined, amount: quote.baseAmountUsdMinor / 100, purpose: 'wallet_topup' }, db)
  } catch (error) {
    if (error instanceof MethodUnavailableError) return Response.json({ error: error.message, code: error.code }, { status: error.status })
    return Response.json({ error: 'Payment methods are temporarily unavailable.' }, { status: 503 })
  }
  const idemKey = extractIdempotencyKey(req, body)
  if (idemKey) {
    const claim = await claimIdempotencyKey(db, auth.profile.id, idemKey)
    if (claim.kind === 'replay') return Response.json(claim.response, { status: claim.statusCode })
    if (claim.kind === 'in_flight') return Response.json({ error: 'A top-up with this key is already in progress.' }, { status: 409 })
  }
  const finish = async (payload: Record<string, unknown>, status: number) => {
    if (idemKey) await completeIdempotencyKey(db, auth.profile.id, idemKey, payload, status)
    return Response.json(payload, { status })
  }
  let settingsVersion = 1
  try { settingsVersion = (await getPaymentSettings(db)).version } catch { return finish({ error: 'Payment settings are temporarily unavailable.' }, 503) }
  const reference = `ys:wallet:${randomUUID().replace(/-/g, '')}`
  const profile = auth.profile
  const email = typeof profile.email === 'string' ? profile.email : ''
  if (!email.includes('@')) return finish({ error: 'Add an email address to your account before paying.' }, 400)
  const inserted = await db.from('payment_attempts').insert({ merchant_reference: reference, gateway: 'pesapal', profile_id: auth.profile.id, purpose: 'wallet_topup', source_type: 'wallet_topup', source_id: auth.profile.id, source_payload: { displayCurrency, displayAmountMinor: quote.displayAmountMinor }, status: 'created', amount_minor: quote.chargeAmountMinor, currency: quote.chargeCurrency, base_amount_usd_minor: quote.baseAmountUsdMinor, charge_currency: quote.chargeCurrency, charge_amount_minor: quote.chargeAmountMinor, fx_rate: quote.fxRateToUsd, fx_rate_source: rates?.source || null, fx_rate_fetched_at: rates?.fetchedAt || null, fx_markup_bps: 0, quote_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), settings_version: settingsVersion, is_test: String(process.env.PESAPAL_ENV || 'live').toLowerCase() === 'sandbox', updated_at: new Date().toISOString() }).select('id').single()
  if (inserted.error || !inserted.data) return finish({ error: 'Could not record the pending payment.' }, 503)
  try {
    const provider = getPaymentProvider('pesapal')
    if (!provider.createHostedSession) return finish({ error: 'Pesapal is unavailable.' }, 503)
    const origin = new URL(req.url).origin
    const session = await provider.createHostedSession({ merchantReference: reference, amountCents: quote.chargeAmountMinor, currency: quote.chargeCurrency, description: 'YouSafe wallet top-up', callbackUrl: `${origin}/checkout/pesapal/return`, cancellationUrl: `${origin}/checkout/pesapal/return?cancelled=1`, notificationId: process.env.PESAPAL_IPN_ID || '', customer: { email, name: typeof profile.full_name === 'string' ? profile.full_name : '', countryCode: profile.country_code || undefined } })
    const { error } = await db.from('payment_attempts').update({ provider_tracking_id: session.trackingId, status: 'submitted', updated_at: new Date().toISOString() }).eq('id', inserted.data.id)
    if (error) throw error
    return finish({ redirectUrl: session.redirectUrl, orderTrackingId: session.trackingId, merchantReference: reference }, 200)
  } catch {
    await db.from('payment_attempts').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', inserted.data.id)
    return finish({ error: 'Could not start Pesapal checkout.' }, 503)
  }
}
