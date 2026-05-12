import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { dollarsToCents } from '@/lib/money'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { serviceId, templateId, productType, currency = 'usd' } = body
  const requestedId = templateId || serviceId
  const requestedType = templateId || String(productType || '').toLowerCase() === 'template' ? 'template' : 'service'
  if (!requestedId) {
    return Response.json(
      { error: requestedType === 'template' ? 'Missing template id' : 'Missing service id' },
      { status: 400 },
    )
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, status')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'client' || profile.status !== 'active') {
    return Response.json({ error: 'Student checkout requires an active student account' }, { status: 403 })
  }

  let query = db
    .from('services')
    .select('*')
    .eq('id', requestedId)
    .eq('is_active', true)

  if (requestedType === 'template') {
    query = query.eq('product_type', 'template').eq('status', 'active')
  } else {
    query = query.or('product_type.is.null,product_type.eq.service')
  }

  let { data: service, error } = await query.single()

  if (requestedType === 'service' && error && /product_type|schema cache|column/i.test(error.message)) {
    const legacy = await db
      .from('services')
      .select('*')
      .eq('id', requestedId)
      .eq('is_active', true)
      .single()
    service = legacy.data
    error = legacy.error
  }

  if (error || !service) {
    return Response.json({ error: requestedType === 'template' ? 'Template not found' : 'Service not found' }, { status: 404 })
  }

  const isTemplate = String(service.product_type || '').toLowerCase() === 'template'

  if (!isTemplate && service.stripe_payment_link_url) {
    return Response.json({ url: service.stripe_payment_link_url })
  }

  const checkoutCurrency = isTemplate ? 'usd' : String(service.currency || 'usd').toLowerCase()
  const amount = dollarsToCents(isTemplate ? service.usd_price ?? service.price : service.price)
  if (amount < 100) {
    return Response.json({ error: `${isTemplate ? 'Template' : 'Service'} price is invalid` }, { status: 400 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.yousafeconsultancy.com'
  try {
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: clerkUserId,
      success_url: `${origin}/dashboard?lane=student&${isTemplate ? 'template' : 'checkout'}=success`,
      cancel_url: `${origin}/dashboard?lane=student&${isTemplate ? 'template' : 'checkout'}=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: checkoutCurrency,
            unit_amount: amount,
            product_data: {
              name: service.title ?? (isTemplate ? 'YouSafe immigration template' : 'YouSafe service'),
              description: isTemplate
                ? service.short_description ?? 'Digital immigration preparation template'
                : service.category ?? undefined,
              metadata: isTemplate
                ? {
                    product_type: 'template',
                    service_id: String(service.id),
                    slug: service.slug ?? '',
                    file_path: service.file_path ?? '',
                  }
                : undefined,
            },
          },
        },
      ],
      metadata: {
        service_id: String(service.id),
        product_type: isTemplate ? 'template' : 'service',
        ...(isTemplate
          ? {
              slug: service.slug ?? '',
              file_path: service.file_path ?? '',
              display_currency: String(currency || 'usd').toLowerCase(),
            }
          : {}),
      },
    })

    return Response.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Checkout failed'
    console.error('[checkout/service]', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
