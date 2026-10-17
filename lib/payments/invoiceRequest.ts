import type { CheckoutItem } from '@/lib/checkoutOrders'
import type { getSupabaseAdminClient } from '@/lib/supabase'
import { sendNoPaymentMethodsAlert } from './adminNotifications'

type Db = ReturnType<typeof getSupabaseAdminClient>

/** Create an unpaid manual order only when no payment method remains available. */
export async function createInvoiceRequestOrder(
  db: Db,
  item: CheckoutItem,
  actorId: string,
  options: { alertAdmin?: boolean } = {},
) {
  const { data: order, error } = await db.from('orders').insert({
    client_id: item.clientProfileId,
    consultant_id: item.providerProfileId,
    status: 'pending_invoice',
    currency: item.currency,
    total_amount: item.totalCents / 100,
    amount_paid: 0,
    escrow_amount: 0,
    payment_method: 'invoice_request',
    gateway: 'manual',
    requirements: item.description || item.title,
    offer_id: item.offerId || null,
    source_offer_id: item.sourceOfferId || null,
    source_consultant_offer_id: item.sourceConsultantOfferId || null,
    source_inquiry_id: item.sourceInquiryId || null,
    gig_id: item.gigId || null,
  }).select('id').single()
  if (error || !order) throw new Error(error?.message || 'Invoice request could not be created.')

  await db.from('order_events').insert({
    order_id: order.id,
    actor_id: actorId,
    actor_role: 'client',
    to_status: 'pending_invoice',
    note: `Invoice requested for ${item.title}. No payment was charged.`,
  })
  await db.from('order_status_history').insert({
    order_id: order.id,
    from_status: null,
    to_status: 'pending_invoice',
    changed_by_id: actorId,
    note: `Invoice requested for ${item.title}.`,
  })

  if (options.alertAdmin !== false) {
    try {
      const incident = await db.from('payment_incidents').insert({
        profile_id: actorId,
        kind: 'payment_methods_unavailable',
        gateway: 'manual',
        transaction_id: order.id,
        amount_cents: item.totalCents,
        context: { order_id: order.id, source: 'invoice_request', no_gateway_call: true },
      })
      if (incident.error) console.error('[payments/invoice-request] failed to record unavailable-method incident')
    } catch {
      console.error('[payments/invoice-request] failed to record unavailable-method incident')
    }
    await sendNoPaymentMethodsAlert({ db, actorProfileId: actorId, orderId: order.id, amountCents: item.totalCents })
  }
  return order
}
