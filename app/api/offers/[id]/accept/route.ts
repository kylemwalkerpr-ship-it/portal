import { ok, fail } from '@/lib/apiEnvelope'
import { computeNetPayoutCents, computePlatformFeeCents, getPaymentSettingsForApi, centsToDollars } from '@/lib/fiverr'
import { requirePortalUser } from '@/lib/portalAuth'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { creditEarning } from '@/lib/earnings'
import { createPaidOrder, type CheckoutItem } from '@/lib/checkoutOrders'
import { getPaymentProvider } from '@/lib/payments'
import { listCards } from '@/lib/payment-methods'

async function handler(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Only students can accept offers.', 403)

  const { id } = await context.params

  // ── Resolve offer (shared by all branches) ────────────────────────────
  const { data: offer, error } = await auth.db
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !offer) return fail(error?.message || 'Offer not found.', 404)
  if (offer.recipient_id !== auth.profileId) return fail('Forbidden.', 403)

  const settings = await getPaymentSettingsForApi()
  const amount = Number(offer.discounted_price || offer.price)
  const platformFee = computePlatformFeeCents(amount, offer.sender_type, settings)
  const total = offer.sender_type === 'attorney' ? amount + platformFee : amount
  const netPayout = computeNetPayoutCents(amount, offer.sender_type, settings)

  // ── Parse payment method ──────────────────────────────────────────────
  let body: Record<string, unknown> = {}
  if (req.method !== 'GET') {
    try { body = await req.json() } catch { /* empty body defaults to wallet */ }
  }
  const paymentMethod = String(body?.paymentMethod || 'wallet') as 'wallet' | 'saved_card' | 'new_card'

  // ── Idempotency / double-pay guard ────────────────────────────────────
  // Re-read offer status right before any charge to prevent double-payment
  const { data: freshOffer } = await auth.db
    .from('offers')
    .select('status, expires_at')
    .eq('id', id)
    .single()

  if (freshOffer?.status !== 'pending') {
    return fail('Offer already accepted or expired.', 409)
  }
  if (freshOffer?.expires_at && new Date(freshOffer.expires_at).getTime() <= Date.now()) {
    await auth.db.from('offers').update({ status: 'expired' }).eq('id', id)
    return fail('Offer has expired.', 409)
  }

  // ── Branch: wallet ────────────────────────────────────────────────────
  if (paymentMethod === 'wallet') {
    const wallet = await getOrCreateWallet(auth.profileId)
    if (wallet.balance_cents < total) {
      return fail('Insufficient wallet balance', 402, { balanceCents: wallet.balance_cents, requiredCents: total })
    }

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

    const acceptedAt = new Date().toISOString()
    const { data: updated, error: updErr } = await auth.db
      .from('offers')
      .update({ status: 'accepted', accepted_at: acceptedAt, updated_at: acceptedAt })
      .eq('id', id)
      .select('*')
      .single()

    if (updErr || !updated) {
      console.error('[offers/accept] Offer update failed after debit:', updErr)
      return fail(updErr?.message || 'Could not accept offer.', 500)
    }

    const item = buildCheckoutItem(offer, amount, platformFee, total, netPayout, settings)
    let order
    try {
      order = await createPaidOrder(auth.db, item, {
        paymentMethod: 'wallet',
        actorId: auth.profileId,
        acceptedAt,
        skipSourceUpdate: true,
      })
    } catch (orderErr) {
      console.error('[offers/accept] Order creation failed after debit+accept:', orderErr)
    }

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
      breakdown: buildBreakdown(amount, platformFee, total),
      balanceCents: debitTx.balance_after_cents,
    })
  }

  // ── Branch: saved_card ────────────────────────────────────────────────
  if (paymentMethod === 'saved_card') {
    const paymentMethodId = String(body?.paymentMethodId || '')
    if (!paymentMethodId) return fail('Payment method ID is required for saved card payment.', 400)

    const { data: cardRow, error: cardErr } = await auth.db
      .from('student_payment_methods')
      .select('id, vault_id')
      .eq('id', paymentMethodId)
      .eq('profile_id', auth.profileId)
      .single()

    if (cardErr || !cardRow) return fail('Card not found', 404)

    const provider = getPaymentProvider()
    const profile = auth.profile
    const customer = {
      email: profile.email || '',
      name: profile.full_name || '',
    }

    let result
    try {
      result = await provider.chargeVaulted({
        vaultId: cardRow.vault_id,
        amountCents: total,
        currency: 'usd',
        customer,
        metadata: { offerId: offer.id, source: 'offer_accept' },
      })
    } catch (chargeErr: any) {
      console.error('[offers/accept] chargeVaulted failed for offer', offer.id, ':', chargeErr)
      return fail(chargeErr?.message || 'Payment could not be processed', 500, { provider_status: 'error' })
    }

    if (result.status !== 'paid') {
      console.error('[offers/accept] chargeVaulted declined for offer', offer.id, ':', result.message)
      return fail(result.message || 'Payment could not be processed', 402, { provider_status: result.status })
    }

    const acceptedAt = new Date().toISOString()
    const { data: updated, error: updErr } = await auth.db
      .from('offers')
      .update({ status: 'accepted', accepted_at: acceptedAt, updated_at: acceptedAt })
      .eq('id', id)
      .select('*')
      .single()

    if (updErr || !updated) {
      console.error('[offers/accept] Offer update failed after saved_card charge:', updErr)
      return fail(updErr?.message || 'Could not accept offer.', 500)
    }

    const item = buildCheckoutItem(offer, amount, platformFee, total, netPayout, settings)
    let order
    try {
      order = await createPaidOrder(auth.db, item, {
        paymentMethod: 'saved_card',
        actorId: auth.profileId,
        acceptedAt,
        skipSourceUpdate: true,
      })
    } catch (orderErr) {
      console.error('[offers/accept] Order creation failed after saved_card charge+accept:', orderErr)
    }

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
      breakdown: buildBreakdown(amount, platformFee, total),
      balanceCents: null,
    })
  }

  // ── Branch: new_card ──────────────────────────────────────────────────
  if (paymentMethod === 'new_card') {
    const token = String(body?.token || '')
    if (!token) return fail('Card token is required for new card payment.', 400)

    const provider = getPaymentProvider()
    const profile = auth.profile
    const customer = {
      email: profile.email || '',
      name: profile.full_name || '',
    }

    let result
    try {
      result = await provider.charge({
        token,
        amountCents: total,
        currency: 'USD',
        items: [{
          sku: offer.id,
          name: offer.title,
          unitAmountCents: total,
          quantity: 1,
        }],
        customer: { email: customer.email, name: customer.name },
        metadata: { offerId: offer.id, source: 'offer_accept' },
      })
    } catch (chargeErr: any) {
      console.error('[offers/accept] charge failed for offer', offer.id, ':', chargeErr)
      return fail(chargeErr?.message || 'Payment could not be processed', 500, { provider_status: 'error' })
    }

    if (result.status !== 'paid') {
      console.error('[offers/accept] charge declined for offer', offer.id, ':', result.message)
      return fail(result.message || 'Payment could not be processed', 402, { provider_status: result.status })
    }

    const acceptedAt = new Date().toISOString()
    const { data: updated, error: updErr } = await auth.db
      .from('offers')
      .update({ status: 'accepted', accepted_at: acceptedAt, updated_at: acceptedAt })
      .eq('id', id)
      .select('*')
      .single()

    if (updErr || !updated) {
      console.error('[offers/accept] Offer update failed after new_card charge:', updErr)
      return fail(updErr?.message || 'Could not accept offer.', 500)
    }

    const item = buildCheckoutItem(offer, amount, platformFee, total, netPayout, settings)
    let order
    try {
      order = await createPaidOrder(auth.db, item, {
        paymentMethod: 'new_card',
        actorId: auth.profileId,
        acceptedAt,
        skipSourceUpdate: true,
      })
    } catch (orderErr) {
      console.error('[offers/accept] Order creation failed after new_card charge+accept:', orderErr)
    }

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
      breakdown: buildBreakdown(amount, platformFee, total),
      balanceCents: null,
    })
  }

  return fail('Invalid payment method.', 400)
}

function buildCheckoutItem(
  offer: any,
  amount: number,
  platformFee: number,
  total: number,
  netPayout: number,
  settings: any,
): CheckoutItem {
  return {
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
}

function buildBreakdown(amount: number, platformFee: number, total: number) {
  return {
    subtotal: amount,
    platform_fee: platformFee,
    tax: 0,
    total,
    display_subtotal: centsToDollars(amount),
    display_total: centsToDollars(total),
  }
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

  // Fetch saved cards (graceful degradation)
  let savedCards: Array<{ id: string; brand: string | null; last4: string; exp_month: number | null; exp_year: number | null; is_default: boolean }> = []
  try {
    const cards = await listCards(auth.profileId)
    savedCards = cards.map(c => ({
      id: c.id,
      brand: c.brand,
      last4: c.last4,
      exp_month: c.exp_month,
      exp_year: c.exp_year,
      is_default: c.is_default,
    }))
  } catch (cardErr) {
    console.error('[offers/accept] listCards failed:', cardErr)
  }

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
    savedCards,
  })
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  return handler(req, context)
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  return handler(req, context)
}
