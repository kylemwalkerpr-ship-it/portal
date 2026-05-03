import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { dollarsToCents } from '@/lib/money'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { serviceId } = await req.json()
  if (!serviceId) return Response.json({ error: 'Missing service id' }, { status: 400 })

  const db = createSupabaseAdminClient()
  const { data: service, error } = await db
    .from('services')
    .select('*')
    .eq('id', serviceId)
    .eq('is_active', true)
    .single()

  if (error || !service) return Response.json({ error: 'Service not found' }, { status: 404 })

  if (service.stripe_payment_link_url) {
    return Response.json({ url: service.stripe_payment_link_url })
  }

  const amount = dollarsToCents(service.price)
  if (amount < 100) return Response.json({ error: 'Service price is invalid' }, { status: 400 })

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.yousafeconsultancy.com'
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: clerkUserId,
    success_url: `${origin}/dashboard?checkout=success`,
    cancel_url: `${origin}/dashboard?checkout=cancelled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: String(service.currency || 'usd').toLowerCase(),
          unit_amount: amount,
          product_data: {
            name: service.title ?? 'YouSafe service',
            description: service.category ?? undefined,
          },
        },
      },
    ],
    metadata: {
      service_id: String(service.id),
    },
  })

  return Response.json({ url: session.url })
}
