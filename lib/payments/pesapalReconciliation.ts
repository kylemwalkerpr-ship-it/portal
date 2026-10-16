import { createPaidOrder, type CheckoutItem } from '@/lib/checkoutOrders'
import { creditEarning } from '@/lib/earnings'
import { recordPaymentIncident } from '@/lib/idempotency'
import { createSupabaseAdminClient } from '@/lib/supabase'
import type { PaymentProvider, HostedStatusResult } from './types'
import { credit } from '@/lib/wallet'
import { sendPesapalMismatchAlert } from './adminNotifications'

type Db = ReturnType<typeof createSupabaseAdminClient>
type PesapalAttempt = {
  id: string
  merchant_reference: string
  provider_tracking_id: string
  profile_id: string
  source_type: string
  source_id: string
  source_payload: Record<string, any>
  status: string
  amount_minor: number
  currency: string
  charge_amount_minor: number
  charge_currency: string
  base_amount_usd_minor: number
  poll_count?: number
  updated_at?: string
  [key: string]: any
}

export type PesapalReconcileResult = {
  httpStatus: number
  status: 'pending' | 'completed' | 'failed' | 'invalid' | 'reversed'
  confirmed: boolean
  message: string
  merchantReference?: string
  trackingId?: string
  orderId?: string | null
  noOp?: boolean
}

type Provider = PaymentProvider & Required<Pick<PaymentProvider, 'getTransactionStatus'>>

function response(status: PesapalReconcileResult['status'], confirmed: boolean, message: string, extra: Partial<PesapalReconcileResult> = {}): PesapalReconcileResult {
  return { httpStatus: 200, status, confirmed, message, ...extra }
}

function toAttemptStatus(status: HostedStatusResult['status']): PesapalReconcileResult['status'] {
  return status === 'completed' || status === 'failed' || status === 'invalid' || status === 'reversed' ? status : 'pending'
}

async function fulfillOrder(db: Db, attempt: PesapalAttempt, verified: HostedStatusResult) {
  const orderItem = attempt.source_payload?.orderItem as CheckoutItem | undefined
  if (!orderItem) throw new Error('The stored Pesapal checkout source cannot be fulfilled.')
  const order = await createPaidOrder(db, orderItem, {
    paymentMethod: 'pesapal',
    actorId: attempt.profile_id,
    acceptedAt: new Date().toISOString(),
    transactionId: attempt.provider_tracking_id,
    attributionToken: null,
  })

  try {
    await creditEarning({
      providerId: orderItem.providerProfileId,
      orderId: order.id,
      source: orderItem.sourceType === 'gig' ? 'gig' : 'offer',
      amountCents: orderItem.netPayoutCents,
      feeCents: orderItem.platformFeeCents,
    })
  } catch {
    await recordPaymentIncident(db, {
      profileId: orderItem.providerProfileId,
      kind: 'earning_credit_failed',
      amountCents: orderItem.netPayoutCents,
      transactionId: verified.confirmationCode || attempt.provider_tracking_id,
      context: { orderId: order.id, source: orderItem.sourceType === 'gig' ? 'gig' : 'offer', clientProfileId: attempt.profile_id },
    })
  }
  return { orderId: order.id, templateOrderId: null as string | null }
}

async function fulfillCatalogue(db: Db, attempt: PesapalAttempt, verified: HostedStatusResult) {
  const items = Array.isArray(attempt.source_payload?.items) ? attempt.source_payload.items : []
  if (!items.length) throw new Error('The stored Pesapal catalogue checkout cannot be fulfilled.')
  const templates = items.filter((item: any) => typeof item.slug === 'string')
  const services = items.filter((item: any) => typeof item.serviceId === 'string')
  let templateOrderId: string | null = null
  let orderId: string | null = null

  if (templates.length) {
    templateOrderId = `pesapal_${attempt.id}`
    const { error } = await db.from('template_orders').insert({
      id: templateOrderId,
      email: String(attempt.source_payload?.email || ''),
      name: String(attempt.source_payload?.name || '') || null,
      slugs: templates.flatMap((item: any) => Array(Number(item.quantity) || 1).fill(String(item.slug))),
      amount_cents: templates.reduce((sum: number, item: any) => sum + Number(item.amountCents) * Number(item.quantity), 0),
      transaction_id: verified.confirmationCode || attempt.provider_tracking_id,
      status: 'paid',
    })
    if (error) {
      const existing = await db.from('template_orders').select('id').eq('id', templateOrderId).maybeSingle()
      if (!existing.data?.id) throw new Error(error.message || 'Could not create the template order.')
    }
  }

  if (services.length) {
    orderId = attempt.id
    const serviceTotalCents = services.reduce((sum: number, item: any) => sum + Number(item.amountCents) * Number(item.quantity), 0)
    const { error } = await db.from('orders').insert({
      id: orderId,
      client_id: attempt.profile_id,
      status: 'pending',
      total_amount: serviceTotalCents / 100,
      currency: 'usd',
      payment_method: 'pesapal',
      transaction_id: attempt.provider_tracking_id,
      gateway: 'pesapal',
    })
    if (error) {
      const existing = await db.from('orders').select('id').eq('id', orderId).maybeSingle()
      if (!existing.data?.id) throw new Error(error.message || 'Could not create the service order.')
    }

    // An earlier fulfillment attempt can create the order and then fail while
    // writing its items. On retry, repair the deterministic order's items
    // before marking the payment complete.
    const expectedItems = services.map((item: any) => ({
      order_id: orderId,
      service_id: String(item.serviceId),
      quantity: Number(item.quantity),
      unit_price: Number(item.amountCents),
    }))
    const { data: existingItems, error: readItemsError } = await db.from('order_items')
      .select('order_id, service_id, quantity, unit_price').eq('order_id', orderId)
    if (readItemsError) throw new Error(readItemsError.message || 'Could not verify service order items.')

    const normalized = (rows: any[]) => rows.map((row) => ({
      order_id: String(row.order_id),
      service_id: String(row.service_id),
      quantity: Number(row.quantity),
      unit_price: Number(row.unit_price),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    if (JSON.stringify(normalized(existingItems || [])) !== JSON.stringify(normalized(expectedItems))) {
      const { error: deleteItemsError } = await db.from('order_items').delete().eq('order_id', orderId)
      if (deleteItemsError) throw new Error(deleteItemsError.message || 'Could not repair service order items.')
      const { error: insertItemsError } = await db.from('order_items').insert(expectedItems)
      if (insertItemsError) throw new Error(insertItemsError.message || 'Could not create service order items.')
    }
  }

  return { orderId, templateOrderId }
}

/**
 * Reconcile only from Pesapal's authenticated status endpoint. Request fields
 * are identifiers used to locate a stored attempt; they never set payment state.
 */
export async function reconcilePesapalPayment(args: {
  db?: Db
  provider: Provider
  trackingId: string
  merchantReference: string
  now?: () => number
}): Promise<PesapalReconcileResult> {
  const db = args.db || createSupabaseAdminClient()
  const trackingId = args.trackingId.trim()
  const suppliedReference = args.merchantReference.trim()
  if (!trackingId || !suppliedReference) {
    return { httpStatus: 400, status: 'invalid', confirmed: false, message: 'A Pesapal tracking id and merchant reference are required.' }
  }

  const { data: attempt, error: lookupError } = await db.from('payment_attempts').select('*')
    .eq('gateway', 'pesapal').eq('provider_tracking_id', trackingId).maybeSingle()
  if (lookupError) return { httpStatus: 503, status: 'pending', confirmed: false, message: 'Payment status is temporarily unavailable.' }
  if (!attempt) return { httpStatus: 404, status: 'invalid', confirmed: false, message: 'Pesapal payment session not found.' }

  let verified: HostedStatusResult
  try {
    verified = await args.provider.getTransactionStatus(trackingId)
  } catch {
    return { httpStatus: 503, status: 'pending', confirmed: false, message: 'Could not verify payment status with Pesapal.' }
  }

  const stored = attempt as PesapalAttempt
  const currency = String(stored.charge_currency || stored.currency || '').trim().toUpperCase()
  if (
    suppliedReference !== stored.merchant_reference ||
    verified.merchantReference !== stored.merchant_reference ||
    verified.amountCents !== Number(stored.charge_amount_minor ?? stored.amount_minor) ||
    String(verified.currency || '').toUpperCase() !== currency
  ) {
    if ((attempt as any).purpose === 'wallet_topup') {
      await db.from('payment_attempts').update({ status: 'invalid', last_status_raw: { mismatch: true }, updated_at: new Date().toISOString() }).eq('id', (attempt as any).id)
      await sendPesapalMismatchAlert({ db, profileId: String((attempt as any).profile_id), trackingId, merchantReference: stored.merchant_reference })
    }
    return { httpStatus: 409, status: 'invalid', confirmed: false, message: 'Pesapal payment details did not match the pending checkout.' }
  }

  const nextStatus = toAttemptStatus(verified.status)
  const providerFields = {
    provider_status_code: verified.statusCode,
    confirmation_code: verified.confirmationCode,
    payment_method: verified.paymentMethod,
    last_status_raw: {
      status: verified.status,
      amountCents: verified.amountCents,
      currency: verified.currency,
      merchantReference: verified.merchantReference,
      statusCode: verified.statusCode,
    },
    poll_count: Number(stored.poll_count || 0) + 1,
    next_poll_at: new Date(Date.now() + 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (stored.status === 'completed') {
    if (nextStatus === 'completed') {
      return response('completed', true, 'Payment confirmed.', { merchantReference: stored.merchant_reference, trackingId, orderId: stored.order_id || null, noOp: true })
    }
    if (nextStatus === 'reversed' || nextStatus === 'failed') {
      await db.from('payment_attempts').update({ ...providerFields, status: nextStatus }).eq('id', stored.id).eq('status', 'completed')
      return response(nextStatus, false, 'Pesapal reports that this payment is no longer completed.', {
        merchantReference: stored.merchant_reference, trackingId, orderId: stored.order_id || null, noOp: true,
      })
    }
    return response('pending', false, 'Pesapal is still checking this payment.', { merchantReference: stored.merchant_reference, trackingId, orderId: stored.order_id || null, noOp: true })
  }
  if (['failed', 'invalid', 'reversed', 'cancelled', 'expired'].includes(stored.status)) {
    const terminalStatus = stored.status === 'reversed' ? 'reversed' : stored.status === 'invalid' ? 'invalid' : 'failed'
    return response(terminalStatus, false, 'Payment was not completed.', {
      merchantReference: stored.merchant_reference, trackingId, noOp: true,
    })
  }
  if (nextStatus !== 'completed') {
    await db.from('payment_attempts').update({ ...providerFields, status: nextStatus }).eq('id', stored.id).eq('status', stored.status)
    return response(nextStatus, false, nextStatus === 'failed' || nextStatus === 'reversed' ? 'Payment was not completed.' : 'Payment is still processing.', {
      merchantReference: stored.merchant_reference, trackingId,
    })
  }

  // An atomic status compare-and-set means duplicate return/IPN calls have one
  // fulfiller. A stale processing claim can be recovered after two minutes.
  const now = args.now || Date.now
  const staleProcessing = stored.status === 'processing' && stored.updated_at && now() - Date.parse(stored.updated_at) > 2 * 60_000
  if (stored.status === 'processing' && !staleProcessing) {
    return response('pending', false, 'Payment confirmation is being finalized.', { merchantReference: stored.merchant_reference, trackingId, noOp: true })
  }
  if (!['submitted', 'pending', 'processing'].includes(stored.status)) {
    return response('pending', false, 'Payment session is not eligible for fulfillment.', { merchantReference: stored.merchant_reference, trackingId, noOp: true })
  }
  let claim = db.from('payment_attempts').update({ ...providerFields, status: 'processing' }).eq('id', stored.id).eq('status', stored.status)
  if (stored.status === 'processing') claim = claim.eq('updated_at', stored.updated_at)
  const { data: claimed, error: claimError } = await claim.select('*').maybeSingle()
  if (claimError) return { httpStatus: 503, status: 'pending', confirmed: false, message: 'Could not claim payment fulfillment.' }
  if (!claimed) {
    return response('pending', false, 'Payment confirmation is already being processed.', { merchantReference: stored.merchant_reference, trackingId, noOp: true })
  }

  try {
    if (stored.purpose === 'wallet_topup') {
      try {
        await credit(stored.profile_id, Number(stored.charge_amount_minor ?? stored.amount_minor), 'Pesapal wallet top-up', `pesapal:${trackingId}`, { kind: 'topup', provider: 'pesapal', merchant_reference: stored.merchant_reference, order_tracking_id: trackingId })
      } catch (error: any) {
        if (error?.code !== '23505' && !/duplicate key|unique constraint/i.test(String(error?.message || ''))) throw error
      }
    }
    const fulfilled = stored.purpose === 'wallet_topup'
      ? { orderId: null, templateOrderId: null }
      : stored.source_type === 'catalogue'
      ? await fulfillCatalogue(db, stored, verified)
      : await fulfillOrder(db, stored, verified)
    const completedAt = new Date().toISOString()
    const { error: completeError } = await db.from('payment_attempts').update({
      ...providerFields,
      status: 'completed',
      order_id: fulfilled.orderId,
      template_order_id: fulfilled.templateOrderId,
      completed_at: completedAt,
      next_poll_at: null,
      updated_at: completedAt,
    }).eq('id', stored.id).eq('status', 'processing')
    if (completeError) throw new Error(completeError.message)
    return response('completed', true, 'Payment confirmed.', {
      merchantReference: stored.merchant_reference, trackingId, orderId: fulfilled.orderId, noOp: false,
    })
  } catch {
    await db.from('payment_attempts').update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('id', stored.id).eq('status', 'processing')
    return { httpStatus: 503, status: 'pending', confirmed: false, message: 'Payment is received and order fulfillment is being retried.' }
  }
}
