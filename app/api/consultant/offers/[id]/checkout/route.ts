import { getCurrentStudent } from '@/lib/student'
import { createHostedCheckoutSession, resolveCheckoutItem } from '@/lib/checkoutOrders'

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { id } = await context.params
  const { data: offer } = await auth.db
    .from('consultant_offers')
    .select('id, order_id, consultant_id, consultant_profile_id, client_profile_id, title, description, price, platform_fee, consultant_payout, currency, delivery_days, status, expires_at')
    .eq('id', id)
    .single()
  if (!offer) {
    const resolved = await resolveCheckoutItem(auth.db, 'unified_offer', id, auth.profile.id)
    if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })
    const session = await createHostedCheckoutSession(req, resolved)
    return Response.json({ url: session.url, session_id: session.id })
  }
  if (offer.client_profile_id !== auth.profile.id) return Response.json({ error: 'Forbidden.' }, { status: 403 })
  if (offer.status !== 'sent') return Response.json({ error: `Offer is ${offer.status}.` }, { status: 409 })
  if (offer.expires_at && new Date(offer.expires_at) < new Date()) {
    await auth.db.from('consultant_offers').update({ status: 'expired' }).eq('id', id)
    return Response.json({ error: 'Offer has expired.' }, { status: 410 })
  }

  const resolved = await resolveCheckoutItem(auth.db, 'consultant_offer', id, auth.profile.id)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: resolved.status })
  const session = await createHostedCheckoutSession(req, resolved)

  await auth.db.from('consultant_offers').update({ stripe_session_id: session.id }).eq('id', id)

  return Response.json({ url: session.url, session_id: session.id })
}
