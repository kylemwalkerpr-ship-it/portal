import { getStripe } from './stripe'
import { createSupabaseAdminClient } from './supabase'
import { getPlatformSettings } from './platformConfig'
import { findConsultantForOrder } from './consultant'

function centsFromOrder(order: Record<string, any>) {
  if (Number.isInteger(order.total_amount_cents)) return Number(order.total_amount_cents)
  return Math.round(Number(order.total_amount || 0) * 100)
}

function consultantStripeAccountId(consultant: Record<string, any>) {
  return consultant.stripe_account_id || consultant.stripeAccountId
}

function consultantOnboarded(consultant: Record<string, any>) {
  return Boolean(consultant.stripe_onboarding_complete ?? consultant.stripeOnboardingComplete)
}

function consultantBypassed(consultant: Record<string, any>) {
  return Boolean(consultant.stripe_bypass ?? consultant.stripeBypass)
}

export async function triggerConsultantPayout(orderId: string) {
  const db = createSupabaseAdminClient()
  const { data: order, error } = await db.from('orders').select('*').eq('id', orderId).single()
  if (error || !order) throw new Error(error?.message || 'Order not found')

  if (order.stripe_transfer_id || order.payout_status === 'transferred') {
    return { skipped: true, reason: 'Payout already transferred' }
  }

  if (!order.consultant_id) {
    await db.from('orders').update({ payout_status: 'failed' }).eq('id', order.id)
    console.warn(`[Payout] Order ${order.id} has no consultant. Payout skipped.`)
    return { skipped: true, reason: 'No consultant assigned' }
  }

  const consultant = await findConsultantForOrder(db, order)
  const stripeAccountId = consultant ? consultantStripeAccountId(consultant) : null
  const bypassed = consultant ? consultantBypassed(consultant) : false

  // The bypass flag lets admins assign paid orders to a consultant whose
  // Stripe Connect account is still being verified. The actual transfer still
  // requires a connected account, so we mark the payout as `pending` (not
  // failed) and let ops complete the transfer manually once Connect lands.
  if (!consultant) {
    await db.from('orders').update({ payout_status: 'failed' }).eq('id', order.id)
    console.warn(`[Payout] Consultant for order ${order.id} not found. Payout skipped.`)
    return { skipped: true, reason: 'Consultant not found' }
  }
  if ((!stripeAccountId || !consultantOnboarded(consultant)) && bypassed) {
    await db.from('orders').update({ payout_status: 'pending' }).eq('id', order.id)
    console.warn(`[Payout] Consultant for order ${order.id} bypassed by admin; payout marked pending until Connect completes.`)
    return { skipped: true, reason: 'Stripe Connect bypassed by admin — payout pending manual completion' }
  }
  if (!stripeAccountId || !consultantOnboarded(consultant)) {
    await db.from('orders').update({ payout_status: 'failed' }).eq('id', order.id)
    console.warn(`[Payout] Consultant for order ${order.id} has not completed Stripe onboarding. Payout skipped.`)
    return { skipped: true, reason: 'Consultant onboarding incomplete' }
  }

  const settings = await getPlatformSettings()
  const totalAmount = centsFromOrder(order)
  const platformFee = Math.round(totalAmount * (Number(settings.platform_fee_percent) / 100))
  const consultantPayout = totalAmount - platformFee

  try {
    const transfer = await getStripe().transfers.create({
      amount: consultantPayout,
      currency: settings.primary_currency,
      destination: stripeAccountId,
      transfer_group: `order_${order.id}`,
      metadata: {
        orderId: String(order.id),
        consultantId: String(consultant.id),
        platformFee: String(platformFee),
      },
    })

    await db.from('orders').update({
      platform_fee_amount: platformFee,
      consultant_payout_amount: consultantPayout,
      stripe_transfer_id: transfer.id,
      payout_status: 'transferred',
    }).eq('id', order.id)

    console.log(`[Payout] Transfer ${transfer.id} of ${consultantPayout} cents to ${stripeAccountId} for order ${order.id}`)
    return { transferred: true, transferId: transfer.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown transfer error'
    console.error(`[Payout] Transfer failed for order ${order.id}: ${message}`)
    await db.from('orders').update({
      platform_fee_amount: platformFee,
      consultant_payout_amount: consultantPayout,
      payout_status: 'failed',
    }).eq('id', order.id)
    return { failed: true, error: message }
  }
}
