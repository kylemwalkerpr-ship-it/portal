import { resolveMobileBuyer, unauthorizedResponse, handleMobileCheckout } from '@/lib/mobileCheckout'
import { CPU_TIMEOUT_REGEX } from '@/lib/cpuTimeout'
import { resolveCheckoutItem } from '@/lib/checkoutOrders'
import { claimIdempotencyKey, completeIdempotencyKey, extractIdempotencyKey } from '@/lib/idempotency'
import { assertMethodAllowed, MethodUnavailableError } from '@/lib/payments/availability'
import { createInvoiceRequestOrder } from '@/lib/payments/invoiceRequest'
import { getConfiguredDefaultGateway } from '@/lib/payments/settings'

async function preflightPaymentMethod(req: Request, auth: Extract<Awaited<ReturnType<typeof resolveMobileBuyer>>, { status: 'authenticated' }>) {
  let body: Record<string, unknown>
  try { body = await req.clone().json() } catch { return null }
  const idempotencyKey = extractIdempotencyKey(req, body)
  if (!idempotencyKey) return null // Preserve the handler's existing validation response.

  // Existing idempotency outcomes must replay even if a provider was disabled later.
  try {
    const { data: existing } = await auth.db.from('checkout_idempotency_keys')
      .select('status, created_at')
      .eq('profile_id', auth.profile.id)
      .eq('key', idempotencyKey)
      .maybeSingle()
    if (existing?.status === 'completed' || existing?.status === 'failed') return null
    if (existing?.status === 'pending' && Date.now() - new Date(existing.created_at).getTime() < 10 * 60 * 1000) return null
  } catch {
    // The checkout handler remains the authority for its idempotency result.
  }

  const sourceType = String(body.sourceType || body.source_type || '')
  const sourceId = String(body.sourceId || body.source_id || '')
  const tierId = body.tierId || body.tier_id ? String(body.tierId || body.tier_id) : undefined
  if (sourceType !== 'gig' || !sourceId || !tierId) return null
  const resolved = await resolveCheckoutItem(auth.db, 'gig', sourceId, auth.profile.id, tierId)
  if ('error' in resolved) return null

  const paymentMethod = String(body.paymentMethod || body.payment_method || 'wallet')
  if (paymentMethod === 'invoice' || paymentMethod === 'invoice_request') {
    let allMethodsUnavailable = false
    try {
      await assertMethodAllowed('manual:invoice', {
        profile: { id: auth.profile.id }, currency: 'USD', amount: resolved.totalCents / 100, purpose: 'order',
      }, auth.db)
    } catch (error) {
      if (!(error instanceof MethodUnavailableError)) throw error
      if (!error.invoiceRequestFallback) return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status })
      allMethodsUnavailable = true
    }
    const claim = await claimIdempotencyKey(auth.db, auth.profile.id, idempotencyKey)
    if (claim.kind !== 'fresh') return null
    try {
      const invoiceOrder = await createInvoiceRequestOrder(auth.db, resolved, auth.profile.id, { alertAdmin: allMethodsUnavailable })
      const payload = allMethodsUnavailable
        ? { error: { message: 'No online payment method is available.', code: 'method_unavailable', fallback: 'invoice_request', orderId: invoiceOrder.id } }
        : { success: true, method: 'invoice_request', status: 'pending_invoice', orderId: invoiceOrder.id }
      const status = allMethodsUnavailable ? 409 : 201
      await completeIdempotencyKey(auth.db, auth.profile.id, idempotencyKey, payload, status, invoiceOrder.id)
      return Response.json(payload, { status })
    } catch {
      const payload = { error: { message: 'The invoice request could not be created.' } }
      await completeIdempotencyKey(auth.db, auth.profile.id, idempotencyKey, payload, 503)
      return Response.json(payload, { status: 503 })
    }
  }

  let selectedMethodKey = 'manual:wallet'
  let gatewayForHandler: string | undefined
  if (paymentMethod === 'saved_card') {
    const paymentMethodId = body.paymentMethodId || body.payment_method_id
    if (!paymentMethodId) return null
    const { data: cardRow, error } = await auth.db.from('student_payment_methods')
      .select('gateway')
      .eq('id', paymentMethodId)
      .eq('profile_id', auth.profile.id)
      .single()
    if (error || !cardRow) return null
    selectedMethodKey = `${String(cardRow.gateway || '').toLowerCase()}:card`
  } else if (paymentMethod === 'new_card') {
    if (!body.token) return null
    const gateway = typeof body.gateway === 'string' && body.gateway ? body.gateway : await getConfiguredDefaultGateway(auth.profile.id, auth.db)
    gatewayForHandler = gateway.toLowerCase()
    selectedMethodKey = `${gatewayForHandler}:card`
  } else if (paymentMethod !== 'wallet') {
    return null
  }

  try {
    await assertMethodAllowed(selectedMethodKey, {
      profile: { id: auth.profile.id }, currency: 'USD', amount: resolved.totalCents / 100, purpose: 'order',
    }, auth.db)
    return gatewayForHandler ? { gateway: gatewayForHandler } : null
  } catch (error) {
    if (error instanceof MethodUnavailableError) {
      if (error.invoiceRequestFallback) {
        const claim = await claimIdempotencyKey(auth.db, auth.profile.id, idempotencyKey)
        if (claim.kind !== 'fresh') return null
        try {
          const invoiceOrder = await createInvoiceRequestOrder(auth.db, resolved, auth.profile.id)
          const payload = { error: { message: error.message, code: error.code, fallback: 'invoice_request', orderId: invoiceOrder.id } }
          await completeIdempotencyKey(auth.db, auth.profile.id, idempotencyKey, payload, error.status, invoiceOrder.id)
          return Response.json(payload, { status: error.status })
        } catch {
          const payload = { error: { message: 'No payment method is available and an invoice could not be requested.', code: error.code } }
          await completeIdempotencyKey(auth.db, auth.profile.id, idempotencyKey, payload, 503)
          return Response.json(payload, { status: 503 })
        }
      }
      return Response.json({ error: { message: error.message, code: error.code } }, { status: error.status })
    }
    throw error
  }
}

/**
 * POST /api/mobile/checkout/order
 * Bearer-verified gig checkout (sourceType: "gig" only).
 * Required Idempotency-Key header. Server-authoritative pricing.
 * Cookie /api/checkout/order is untouched.
 */
export async function POST(req: Request) {
  if (req.signal.aborted) {
    return Response.json({ error: { message: 'Request cancelled by client' } }, { status: 499 })
  }
  const abortHandler = () => {}
  req.signal.addEventListener('abort', abortHandler)

  try {
    const auth = await resolveMobileBuyer(req.headers.get('authorization'))
    if (auth.status === 'unauthenticated') return unauthorizedResponse(auth.reason)
    if (auth.status === 'forbidden') {
      return Response.json({ error: { message: auth.message } }, { status: auth.httpStatus })
    }

    const preflight = await preflightPaymentMethod(req, auth)
    if (preflight instanceof Response) return preflight

    let checkoutRequest = req
    if (preflight?.gateway) {
      const body = await req.clone().json() as Record<string, unknown>
      body.gateway = preflight.gateway
      const headers = new Headers(req.headers)
      headers.delete('content-length')
      checkoutRequest = new Request(req.url, {
        method: req.method,
        headers,
        body: JSON.stringify(body),
        signal: req.signal,
      })
    }

    return await handleMobileCheckout(checkoutRequest, auth)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return Response.json({ error: { message } }, { status: isCpuTimeout ? 503 : 500 })
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
