import { randomUUID } from 'crypto'
import { requirePortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'
import { assertMethodAllowed, MethodUnavailableError } from '@/lib/payments/availability'
import { resolveCheckoutItem, type CheckoutSourceType } from '@/lib/checkoutOrders'
import { getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { claimIdempotencyKey, completeIdempotencyKey, extractIdempotencyKey } from '@/lib/idempotency'

type CatalogueLine = { slug?: string; serviceId?: string; name: string; amountCents: number; quantity: number }

function jsonError(message: string, status: number, code?: string) {
  return Response.json({ error: { message, ...(code ? { code } : {}) } }, { status })
}

export async function POST(request: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return jsonError(auth.error, auth.status)
  if (auth.role !== 'client') return jsonError('Only clients can start checkout.', 403)

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonError('A checkout request is required.', 400)
  const methodKey = typeof body.methodKey === 'string' ? body.methodKey : ''
  if (!methodKey.startsWith('pesapal:')) return jsonError('Pesapal is not the selected payment method.', 400)

  const sourceType = typeof body.sourceType === 'string' ? body.sourceType : ''
  const sourceId = typeof body.sourceId === 'string' ? body.sourceId : ''
  const db = auth.db || createSupabaseAdminClient()
  let amountCents = 0
  let description = 'YouSafe checkout'
  let contextPurpose = 'order'
  let currency = 'USD'
  let countryCode = typeof auth.profile.country_code === 'string' ? auth.profile.country_code : undefined

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
    const lines: CatalogueLine[] = []
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
        lines.push({ slug, name: pack.name, amountCents: price, quantity })
        amountCents += price * quantity
      } else {
        const service = serviceMap.get(serviceId)
        if (!service) return jsonError('A cart item is no longer available.', 409)
        const price = Math.round(Number(service.usd_price ?? service.price ?? 0) * 100)
        if (!Number.isSafeInteger(price) || price <= 0) return jsonError('A cart item is no longer available.', 409)
        lines.push({ serviceId, name: service.title, amountCents: price, quantity })
        amountCents += price * quantity
      }
    }
    description = lines.map((line) => `${line.quantity} × ${line.name}`).join(', ').slice(0, 100)
    contextPurpose = 'catalogue_checkout'
  } else {
    const sourceTypes: CheckoutSourceType[] = ['unified_offer', 'attorney_offer', 'consultant_offer', 'gig']
    if (!sourceTypes.includes(sourceType as CheckoutSourceType) || !sourceId) return jsonError('Invalid checkout source.', 400)
    const resolved = await resolveCheckoutItem(db, sourceType as CheckoutSourceType, sourceId, auth.profileId, typeof body.tierId === 'string' ? body.tierId : undefined)
    if ('error' in resolved) return jsonError(resolved.error, resolved.status)
    amountCents = resolved.totalCents
    description = resolved.title
    currency = resolved.currency.toUpperCase()
    contextPurpose = sourceType === 'gig' ? 'order' : 'offer'
  }

  if (!Number.isSafeInteger(amountCents) || amountCents < 500) return jsonError('The minimum checkout total is $5 USD.', 400)
  try {
    await assertMethodAllowed(methodKey, {
      profile: { id: auth.profileId },
      currency,
      country: countryCode,
      amount: amountCents / 100,
      purpose: contextPurpose,
    }, db)
  } catch (error) {
    if (error instanceof MethodUnavailableError) return jsonError(error.message, 409, error.code)
    throw error
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

  try {
    const profile = auth.profile as typeof auth.profile & { country_code?: string | null }
    const submittedEmail = typeof body.customer?.email === 'string' ? body.customer.email.trim() : ''
    const email = submittedEmail || (typeof profile.email === 'string' ? profile.email : '')
    if (!email || !email.includes('@')) return finish({ error: { message: 'Add an email address to your account before paying.' } }, 400)
    const provider = getPaymentProvider('pesapal')
    if (!provider.createHostedSession) return finish({ error: { message: 'Pesapal hosted checkout is unavailable.' } }, 503)
    const reference = `ys:${randomUUID().replace(/-/g, '')}`
    const origin = new URL(request.url).origin
    const session = await provider.createHostedSession({
      merchantReference: reference,
      amountCents,
      currency,
      description,
      callbackUrl: `${origin}/checkout/pesapal/return`,
      cancellationUrl: `${origin}/checkout/pesapal/return?cancelled=1`,
      notificationId: process.env.PESAPAL_IPN_ID || '',
      customer: {
        email,
        name: (typeof body.customer?.name === 'string' ? body.customer.name.trim() : '') || (typeof profile.full_name === 'string' ? profile.full_name : ''),
        phone: typeof body.customer?.phone === 'string' ? body.customer.phone : undefined,
        countryCode,
      },
      redirectMode: body.redirectMode === 'TOP_WINDOW' ? 'TOP_WINDOW' : 'PARENT_WINDOW',
    })
    return finish({ ...session, amountCents, currency }, 201)
  } catch {
    return finish({ error: { message: 'Pesapal could not start checkout. Please try again.' } }, 502)
  }
}
