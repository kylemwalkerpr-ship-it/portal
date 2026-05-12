import { getClerkUserId } from '@/lib/auth'
import { getStripe } from '@/lib/stripe'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { dollarsToCents } from '@/lib/money'

export async function POST(req: Request) {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { templateId, currency = 'usd' } = await req.json()
  if (!templateId) return Response.json({ error: 'Missing template id' }, { status: 400 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role, status')
    .eq('clerk_user_id', clerkUserId)
    .single()

  if (profile?.role !== 'client' || profile.status !== 'active') {
    return Response.json({ error: 'Template checkout requires an active student account' }, { status: 403 })
  }

  const { data: template, error } = await db
    .from('services')
    .select('*')
    .eq('id', templateId)
    .eq('product_type', 'template')
    .neq('status', 'archived')
    .single()

  if (error || !template || template.status !== 'active') {
    return Response.json({ error: 'Template not found' }, { status: 404 })
  }

  const wantsCad = String(currency).toLowerCase() === 'cad'
  const configuredLink = wantsCad
    ? template.stripe_payment_link_cad || template.stripe_payment_link_usd || template.stripe_payment_link_url
    : template.stripe_payment_link_usd || template.stripe_payment_link_url

  if (configuredLink) return Response.json({ url: configuredLink })

  const amount = dollarsToCents(template.usd_price ?? template.price)
  if (amount < 100) return Response.json({ error: 'Template price is invalid' }, { status: 400 })

  // TODO: Replace this redirect-only fallback with paid download entitlements
  // once digital fulfillment is wired to Stripe webhook verification.
  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.yousafeconsultancy.com'
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: clerkUserId,
    success_url: `${origin}/dashboard?lane=student&template=success`,
    cancel_url: `${origin}/dashboard?lane=student&template=cancelled`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: template.title ?? 'YouSafe immigration template',
            description: template.short_description ?? 'Digital immigration preparation template',
            metadata: {
              product_type: 'template',
              service_id: String(template.id),
              slug: template.slug ?? '',
              file_path: template.file_path ?? '',
            },
          },
        },
      },
    ],
    metadata: {
      product_type: 'template',
      service_id: String(template.id),
      slug: template.slug ?? '',
      file_path: template.file_path ?? '',
    },
  })

  return Response.json({ url: session.url })
}
