import { ok, fail } from '@/lib/apiEnvelope'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi, centsToDollars } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'
import { createPaidOrder, type CheckoutItem } from '@/lib/checkoutOrders'

async function handler(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can accept offers.', 403)

  const { id } = await context.params
  const { data: offer, error } = await auth.db
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Only pending offers can be accepted.', 409)
  if (new Date(offer.expires_at).getTime() <= Date.now()) {
    await auth.db.from('offers').update({ status: 'expired' }).eq('id', id)
    return fail('Offer has expired.', 409)
  }

  const settings = await getPaymentSettingsForApi()
  const amount = Number(offer.discounted_price || offer.price)
  const platformFee = computePlatformFeeCents(amount, offer.sender_type, settings)
  const total = offer.sender_type === 'attorney' ? amount + platformFee : amount
  const netPayout = computeNetPayoutCents(amount, offer.sender_type, settings)

  // Ensure wallet exists and check balance
  const wallet = await getOrCreateWallet(auth.profileId)
  if (wallet.balance_cents < total) {
    return fail('Insufficient wallet balance', 402, { balanceCents: wallet.balance_cents, requiredCents: total })
  }

  // Debit wallet
  let debitTx
  try {
    debitTx = await debit(
      auth.profileId,
      total,
      `Accepted offer: ${offer.title}`,
      undefined,
      { offerId: offer.id, senderType: offer.sender_type }
    )
  } catch (debitErr) {
    const msg = debitErr instanceof Error ? debitErr.message : ''
    if (/insufficient wallet balance/i.test(msg)) {
      return fail('Insufficient wallet balance', 402, { balanceCents: wallet.balance_cents, requiredCents: total })
    }
    console.error('[offers/accept] wallet debit failed:', debitErr)
    return fail(msg || 'Wallet debit failed.', 500)
  }

  // Update offer to accepted
  const acceptedAt = new Date().toISOString()
  const { data: updated, error: updErr } = await auth.db
    .from('offers')
    .update({
      status: 'accepted',
      accepted_at: acceptedAt,
      updated_at: acceptedAt,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updErr || !updated) {
    console.error('[offers/accept] Offer update failed after debit:', updErr)
    return fail(updErr?.message || 'Could not accept offer.', 500)
  }

  // Create order using the same insert shape as the checkout flow
  const item: CheckoutItem = {
    sourceType: 'unified_offer',
    sourceId: offer.id,
    title: offer.title,
    description: offer.description,
    currency: String(offer.currency || settings.primary_currency || 'usd').toLowerCase(),
    subtotalCents: amount,
    platformFeeCents: platformFee,
    totalCents: total,
    netPayoutCents: netPayout,
    providerProfileId: offer.sender_id,
    providerType: offer.sender_type,
    clientProfileId: offer.recipient_id,
    deliveryDays: Number(offer.delivery_days || 1),
    offerId: offer.id,
    gigId: offer.gig_id || null,
  }

  let order
  try {
    order = await createPaidOrder(auth.db, item, {
      paymentMethod: 'wallet',
      actorId: auth.profileId,
      acceptedAt,
      skipSourceUpdate: true, // We already updated the offer to 'accepted'
    })
  } catch (orderErr) {
    console.error('[offers/accept] Order creation failed after debit+accept:', orderErr)
    // Non-fatal: offer is accepted and paid; order can be backfilled
  }

  // Credit provider earning
  try {
    await creditEarning({
      providerId: offer.sender_id,
      orderId: order?.id || updated.id,
      source: 'offer',
      amountCents: netPayout,
      feeCents: platformFee,
    })
  } catch (earnErr) {
    console.error('[offers/accept] creditEarning failed:', earnErr)
  }

  return ok({
    offer: updated,
    breakdown: {
      subtotal: amount,
      platform_fee: platformFee,
      tax: 0,
      total,
      display_subtotal: centsToDollars(amount),
      display_total: centsToDollars(total),
    },
    balanceCents: debitTx.balance_after_cents,
  })
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can view offer details.', 403)

  const { id } = await context.params
  const { data: offer, error } = await auth.db
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)
  if (offer.status !== 'pending') return fail('Only pending offers can be accepted.', 409)
  if (new Date(offer.expires_at).getTime() <= Date.now()) {
    await auth.db.from('offers').update({ status: 'expired' }).eq('id', id)
    return fail('Offer has expired.', 409)
  }

  const settings = await getPaymentSettingsForApi()
  const amount = Number(offer.discounted_price || offer.price)
  const platformFee = computePlatformFeeCents(amount, offer.sender_type, settings)
  const total = offer.sender_type === 'attorney' ? amount + platformFee : amount

  const wallet = await getOrCreateWallet(auth.profileId)

  return ok({
    offer,
    breakdown: {
      subtotal: amount,
      platform_fee: platformFee,
      tax: 0,
      total,
      display_subtotal: centsToDollars(amount),
      display_total: centsToDollars(total),
    },
    balanceCents: wallet.balance_cents,
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  return handler(req, context)
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handler(req, context)
}
