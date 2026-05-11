import { getClerkUserId } from '@/lib/auth'
import {
  createHostedCheckoutSession,
  createPaidOrder,
  payWithSavedCard,
  payWithWallet,
  resolveCheckoutItem,
  type CheckoutSourceType,
} from '@/lib/checkoutOrders'
import { requirePortalUser } from '@/lib/portalAuth'
import { getStripe } from '@/lib/stripe'

const VALID_SOURCE_TYPES = new Set(['unified_offer', 'attorney_offer', 'consultant_offer', 'gig'])
const VALID_METHODS = new Set(['stripe', 'wallet', 'saved_card'])

export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.role !== 'client') return Response.json({ error: 'Only students can check out.' }, { status: 403 })

  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const sourceType = String(body.sourceType || body.source_type || '') as CheckoutSourceType
  const sourceId = String(body.sourceId || body.source_id || '')
  const tierId = body.tierId || body.tier_id ? String(body.tierId || body.tier_id) : undefined
  const method = String(body.paymentMethod || body.payment_method || 'stripe')

  if (!VALID_SOURCE_TYPES.has(sourceType) || !sourceId) {
    return Response.json({ error: 'Invalid checkout source.' }, { status: 400 })
  }
  if (!VALID_METHODS.has(method)) {
    return Response.json({ error: 'Invalid payment method.' }, { status: 400 })
  }

  if ((method === 'wallet' || method === 'saved_card') && (body.acceptedTerms !== true || body.acceptedRefundPolicy !== true)) {
    return Response.json(
      { error: 'You must accept the Terms of Service and Refund Policy before completing payment.' },
      { status: 400 },
    )
  }

  const resolved = await resolveCheckoutItem(auth.db, sourceType, sourceId, auth.profileId, tierId)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

  try {
    if (method === 'stripe') {
      const session = await createHostedCheckoutSession(req, resolved)
      return Response.json({ url: session.url, session_id: session.id })
    }

    if (method === 'wallet') {
      const paymentIntentId = await payWithWallet(clerkUserId, resolved)
      const order = await createPaidOrder(auth.db, resolved, {
        paymentIntentId,
        paymentMethod: 'wallet',
        actorId: auth.profileId,
      })
      return Response.json({ success: true, orderId: order.id })
    }

    const paymentMethodId = String(body.paymentMethodId || body.payment_method_id || '')
    if (!paymentMethodId) return Response.json({ error: 'Choose a saved card first.' }, { status: 400 })

    const pi = await payWithSavedCard(clerkUserId, resolved, paymentMethodId)
    if (pi.status === 'succeeded') {
      const order = await createPaidOrder(auth.db, resolved, {
        paymentIntentId: pi.id,
        paymentMethod: 'saved_card',
        actorId: auth.profileId,
      })
      return Response.json({ success: true, orderId: order.id })
    }
    if (pi.status === 'requires_action' || pi.status === 'requires_confirmation') {
      return Response.json({
        requiresAction: true,
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
      })
    }
    return Response.json({ error: `Payment is ${pi.status}` }, { status: 402 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed.'
    console.error('[checkout/order]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  if (auth.role !== 'client') return Response.json({ error: 'Only students can check out.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const paymentIntentId = String(body.paymentIntentId || body.payment_intent_id || '')
  if (!paymentIntentId) return Response.json({ error: 'Missing payment intent.' }, { status: 400 })

  try {
    const pi = await getStripe().paymentIntents.retrieve(paymentIntentId)
    if (pi.status !== 'succeeded') return Response.json({ error: `Payment is ${pi.status}` }, { status: 402 })

    const sourceType = pi.metadata?.checkout_source_type as CheckoutSourceType | undefined
    const sourceId = pi.metadata?.checkout_source_id
    if (!sourceType || !sourceId || !VALID_SOURCE_TYPES.has(sourceType)) {
      return Response.json({ error: 'Payment metadata is missing checkout source.' }, { status: 400 })
    }
    if (pi.metadata?.client_profile_id !== auth.profileId) return Response.json({ error: 'Forbidden.' }, { status: 403 })

    const resolved = await resolveCheckoutItem(auth.db, sourceType, sourceId, auth.profileId, pi.metadata?.checkout_tier_id || undefined)
    if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })

    const order = await createPaidOrder(auth.db, resolved, {
      paymentIntentId: pi.id,
      paymentMethod: 'saved_card',
      actorId: auth.profileId,
    })
    return Response.json({ success: true, orderId: order.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not complete payment.'
    console.error('[checkout/order PATCH]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
