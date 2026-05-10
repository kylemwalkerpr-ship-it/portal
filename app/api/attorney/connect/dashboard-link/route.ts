import { getStripe } from '@/lib/stripe'
import { requireAttorney } from '@/lib/attorneyAuth'

export async function POST() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { data: attorney } = await ctx.db
    .from('attorneys')
    .select('stripe_account_id')
    .eq('id', ctx.attorneyId)
    .single()
  if (!attorney?.stripe_account_id) {
    return Response.json({ error: 'Onboard a payout account first.' }, { status: 412 })
  }

  try {
    const link = await getStripe().accounts.createLoginLink(attorney.stripe_account_id)
    return Response.json({ url: link.url })
  } catch (err) {
    const e = err as { message?: string }
    return Response.json({ error: e.message || 'Stripe error.' }, { status: 500 })
  }
}
