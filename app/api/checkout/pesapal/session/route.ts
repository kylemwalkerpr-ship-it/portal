import { randomUUID } from 'crypto'
import { requirePortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'
import { assertMethodAllowed, MethodUnavailableError } from '@/lib/payments/availability'
import { getPaymentSettings } from '@/lib/payments/settings'
import { resolveCheckoutItem, type CheckoutSourceType } from '@/lib/checkoutOrders'
import { getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { claimIdempotencyKey, completeIdempotencyKey, extractIdempotencyKey, recordPaymentIncident } from '@/lib/idempotency'
import { ecbCrossRate, fetchEcbDailyRates, resolvePesapalCurrencyQuote, roundHalfUp, type EcbRateSnapshot } from '@/lib/payments/fx'

type CatalogueLine = { slug?: string; serviceId?: string; name: string; amountCents: number; quantity: number }
type CheckoutItem = Exclude<Awaited<ReturnType<typeof resolveCheckoutItem>>, { error: string; status: number }>
type Db = ReturnType<typeof createSupabaseAdminClient>

function jsonError(message: string, status: number, code?: string) {
  return Response.json({ error: { message, ...(code ? { code } : {}) } }, { status })
}

function normalizeCurrency(value: unknown, fallback: string) {
  const currency = typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : fallback.toUpperCase()
  if (!['USD', 'GBP', 'CAD', 'AUD'].includes(currency)) throw new Error(`Unsupported payment currency: ${currency}.`)
  return currency
}

function usdCheckoutItem(item: CheckoutItem, sourceCurrency: string, chargeCurrency: 'USD' | 'GBP', rates: EcbRateSnapshot | null): CheckoutItem {
  if (sourceCurrency === chargeCurrency) return item
  if (!rates) throw new Error('ECB reference rates are required to convert this order.')
  const rate = ecbCrossRate(sourceCurrency, chargeCurrency, rates.rates)
  const convert = (amount: number) => roundHalfUp(amount * rate)
  return {
    ...item,
    currency: chargeCurrency.toLowerCase(),
    subtotalCents: convert(item.subtotalCents),
    platformFeeCents: convert(item.platformFeeCents),
    totalCents: convert(item.totalCents),
    netPayoutCents: convert(item.netPayoutCents),
  }
}

async function fxSnapshotIfNeeded(sourceCurrency: string, displayCurrency: string) {
  if (sourceCurrency === 'USD' && displayCurrency === 'USD') return null
  return fetchEcbDailyRates()
}

export async function POST(request: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return jsonError(auth.error, auth.status)
  if (auth.role !== 'client') return jsonError('Only clients can start checkout.', 403)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('A checkout request is required.', 400)
  const methodKey = typeof body.methodKey === 'string' ? body.methodKey : ''
  if (!methodKey.startsWith('pesapal:')) return jsonError('Choose a valid payment method to continue.', 400)

  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : ''
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : ''
  const db = (auth.db || createSupabaseAdminClient()) as Db
  let amountCents = 0
  let description = 'YouSafe checkout'
  let contextPurpose = 'order'
  let sourceCurrency = 'USD'
  let countryCode = typeof auth.profile.country_code === 'string' ? auth.profile.country_code : undefined
  let resolvedItem: CheckoutItem | null = null
  let catalogueLines: CatalogueLine[] = []

  if (sourceType === 'catalogue') {
    const rawItems = Array.isArray(body.items) ? body.items : []
    if (!rawItems.length || rawItems.length > 20) return jsonError('Your cart is empty or contains too many items.', 400)
    const serviceIds = rawItems.map((item: any) => typeof item?.serviceId === 'string' ? item.serviceId : '').filter(Boolean)
    let serviceMap = new Map<string, { id: string; title: string; price: number; usd_price?: number | null }>()
    if (serviceIds.length) {
      const { data: services, error } = await db.from('services')
        .select('id, title, price, usd_price')
        .in('id', serviceIds)
        .eq('is_active', true)
      if (error) return jsonError('Could not verify catalogue services.', 500)
      serviceMap = new Map((services || []).map((service: any) => [service.id, service]))
    }
    for (const item of rawItems) {
      const slug = typeof item?.slug === 'string' ? item.slug : ''
      const serviceId = typeof item?.serviceId === 'string' ? item.serviceId : ''
      if (Boolean(slug) === Boolean(serviceId)) return jsonError('Each cart item must identify one catalogue product.', 400)
      const quantity = Math.floor(Number(item?.quantity) || 1)
      if (quantity < 1 || quantity > 25) return jsonError('A cart item is no longer available.', 409)
      if (slug) {
        const pack = getTemplatePack(slug)
        const price = getTemplatePackPriceCents(slug)
        if (!pack || !price) return jsonError('A cart item is no longer available.', 409)
        catalogueLines.push({ slug, name: pack.name, amountCents: price, quantity })
        amountCents += price * quantity
      } else {
        const service = serviceMap.get(serviceId)
        if (!service) return jsonError('A cart item is no longer available.', 409)
        const price = Math.round(Number(service.usd_price ?? service.price ?? 0) * 100)
        if (!Number.isSafeInteger(price) || price <= 0) return jsonError('A cart item is no longer available.', 409)
        catalogueLines.push({ serviceId, name: service.title, amountCents: price, quantity })
        amountCents += price * quantity
      }
    }
    description = catalogueLines.map((line) => `${line.quantity} × ${line.name}`).join(', ').slice(0, 100)
    contextPurpose = 'catalogue_checkout'
  } else {
    const sourceTypes: CheckoutSourceType[] = ['unified_offer', 'attorney_offer', 'consultant_offer', 'gig']
    if (!sourceTypes.includes(sourceType as CheckoutSourceType) || !sourceId) return jsonError('Invalid checkout source.', 400)
    const resolved = await resolveCheckoutItem(db, sourceType as CheckoutSourceType, sourceId, auth.profileId, typeof body.tierId === 'string' ? body.tierId : undefined)
    if ('error' in resolved) return jsonError(resolved.error, resolved.status)
    resolvedItem = resolved
    amountCents = resolved.totalCents
    description = resolved.title
    try {
      sourceCurrency = normalizeCurrency(resolved.currency, 'USD')
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Unsupported payment currency.', 400)
    }
    contextPurpose = sourceType === 'gig' ? 'order' : 'offer'
  }

  let displayCurrency: string
  try {
    displayCurrency = normalizeCurrency(body.displayCurrency ?? body.currency, 'USD')
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Unsupported payment currency.', 400)
  }

  let rates: EcbRateSnapshot | null = null
  let currencyQuote: ReturnType<typeof resolvePesapalCurrencyQuote>
  try {
    rates = await fxSnapshotIfNeeded(sourceCurrency, displayCurrency)
    currencyQuote = resolvePesapalCurrencyQuote({
      amountMinor: amountCents,
      sourceCurrency,
      displayCurrency,
      rates: rates?.rates,
    })
  } catch {
    return jsonError('Currency estimates are temporarily unavailable. Please try again.', 503)
  }

  const { baseAmountUsdMinor, chargeAmountMinor: chargeAmountCents, chargeCurrency } = currencyQuote
  if (!Number.isSafeInteger(baseAmountUsdMinor) || baseAmountUsdMinor < 500) {
    return jsonError('The minimum checkout total is $5 USD equivalent.', 400)
  }

  try {
    await assertMethodAllowed(methodKey, {
      profile: { id: auth.profileId }, currency: chargeCurrency,
      country: countryCode, amount: baseAmountUsdMinor / 100, purpose: contextPurpose,
    }, db)
  } catch (error) {
    if (error instanceof MethodUnavailableError) return jsonError(error.message, 409, error.code)
    return jsonError('Payment methods are temporarily unavailable.', 503)
  }
  let settingsVersion = 1
  try {
    settingsVersion = (await getPaymentSettings(db)).version
  } catch {
    return jsonError('Payment settings are temporarily unavailable.', 503)
  }

  const idempotencyKey = extractIdempotencyKey(request, body as Record<string, unknown>)
  if (!idempotencyKey) return jsonError('Missing checkout idempotency key.', 400)
  const claim = await claimIdempotencyKey(db, auth.profileId, idempotencyKey)
  if (claim.kind === 'replay') return Response.json(claim.response, { status: claim.statusCode })
  if (claim.kind === 'in_flight') return jsonError('A checkout with this key is already in progress.', 409)

  const finish = async (payload: Record<string, unknown>, status: number) => {
    await completeIdempotencyKey(db, auth.profileId, idempotencyKey, payload, status)
    return Response.json(payload, { status })
  }

  const profile = auth.profile as typeof auth.profile & { country_code?: string | null }
  const submittedEmail = typeof body.customer?.email === 'string' ? body.customer.email.trim() : ''
  const email = submittedEmail || (typeof profile.email === 'string' ? profile.email : '')
  if (!email || !email.includes('@')) return finish({ error: { message: 'Add an email address to your account before paying.' } }, 400)
  const provider = getPaymentProvider('pesapal')
  if (!provider.createHostedSession) return finish({ error: { message: 'Card payment is temporarily unavailable.' } }, 503)

  const reference = `ys:${randomUUID().replace(/-/g, '')}`
  const orderItem = resolvedItem && sourceCurrency !== chargeCurrency
    ? usdCheckoutItem(resolvedItem, sourceCurrency, chargeCurrency, rates)
    : resolvedItem
  const sourcePayload = sourceType === 'catalogue'
    ? { items: catalogueLines, displayCurrency, displayAmountMinor: currencyQuote.displayAmountMinor, email, name: profile.full_name || '' }
    : { orderItem, displayCurrency, displayAmountMinor: currencyQuote.displayAmountMinor }
  const sourceDbId = sourceType === 'catalogue'
    ? catalogueLines.map((line) => `${line.slug ? `slug:${line.slug}` : `service:${line.serviceId}`}x${line.quantity}`).join(',').slice(0, 500)
    : sourceId
  const purpose = sourceType === 'catalogue'
    ? catalogueLines.every((line) => Boolean(line.slug)) ? 'template' : 'order'
    : sourceType === 'gig' ? 'order' : 'offer'
  const insertResult = await db.from('payment_attempts').insert({
    merchant_reference: reference,
    gateway: 'pesapal',
    profile_id: auth.profileId,
    purpose,
    source_type: sourceType,
    source_id: sourceDbId,
    source_payload: sourcePayload,
    status: 'created',
    amount_minor: chargeAmountCents,
    currency: chargeCurrency,
    base_amount_usd_minor: baseAmountUsdMinor,
    charge_currency: chargeCurrency,
    charge_amount_minor: chargeAmountCents,
    fx_rate: currencyQuote.fxRateToUsd,
    fx_rate_source: rates?.source || null,
    fx_rate_fetched_at: rates?.fetchedAt || null,
    fx_markup_bps: 0,
    quote_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    settings_version: settingsVersion,
    is_test: String(process.env.PESAPAL_ENV || 'live').trim().toLowerCase() === 'sandbox',
    updated_at: new Date().toISOString(),
  }).select('id').single()
  if (insertResult.error || !insertResult.data) return finish({ error: { message: 'Could not record the pending payment.' } }, 503)

  try {
    const origin = new URL(request.url).origin
    const session = await provider.createHostedSession({
      merchantReference: reference,
      amountCents: chargeAmountCents,
      currency: chargeCurrency,
      description,
      callbackUrl: `${origin}/checkout/return`,
      cancellationUrl: `${origin}/checkout/return?cancelled=1`,
      notificationId: process.env.PESAPAL_IPN_ID || '',
      customer: {
        email,
        name: (typeof body.customer?.name === 'string' ? body.customer.name.trim() : '') || (typeof profile.full_name === 'string' ? profile.full_name : ''),
        phone: typeof body.customer?.phone === 'string' ? body.customer.phone : undefined,
        countryCode,
      },
      redirectMode: body.redirectMode === 'TOP_WINDOW' ? 'TOP_WINDOW' : 'PARENT_WINDOW',
    })
    if (session.merchantReference !== reference) throw new Error('Payment could not be verified. Please try again.')
    const { error: updateError } = await db.from('payment_attempts').update({
      provider_tracking_id: session.trackingId,
      status: 'submitted',
      updated_at: new Date().toISOString(),
      next_poll_at: new Date(Date.now() + 60_000).toISOString(),
    }).eq('id', insertResult.data.id)
    if (updateError) {
      await recordPaymentIncident(db, {
        profileId: auth.profileId,
        kind: 'charge_without_order',
        gateway: 'pesapal',
        amountCents: chargeAmountCents,
        context: { merchantReference: reference, trackingId: session.trackingId, reason: 'Could not link hosted payment session.' },
      })
      return finish({ error: { message: 'Secure payment could not be safely recorded. Please contact support.' } }, 503)
    }
    return finish({
      ...session,
      amountCents: chargeAmountCents,
      currency: chargeCurrency,
      baseAmountUsdMinor,
      displayAmountMinor: currencyQuote.displayAmountMinor,
      displayCurrency: currencyQuote.displayCurrency,
      fxRate: currencyQuote.fxRateToDisplay,
      fxRateSource: rates?.source || null,
      fxRateFetchedAt: rates?.fetchedAt || null,
    }, 201)
  } catch {
    await db.from('payment_attempts').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', insertResult.data.id)
    return finish({ error: { message: 'Secure payment could not be started. Please try again.' } }, 502)
  }
}
