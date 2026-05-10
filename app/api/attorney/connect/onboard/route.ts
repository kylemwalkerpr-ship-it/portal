import { getStripe } from '@/lib/stripe'
import { requireAttorney } from '@/lib/attorneyAuth'

function describeStripeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { raw?: { message?: string; code?: string }; message?: string; code?: string }
    const msg = e.raw?.message || e.message || 'Unknown Stripe error'
    const code = e.raw?.code || e.code
    return code ? `${msg} (${code})` : msg
  }
  return 'Unknown error'
}

export async function POST() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { data: attorney, error: fetchErr } = await ctx.db
    .from('attorneys')
    .select('id, stripe_account_id, stripe_onboarding_complete')
    .eq('id', ctx.attorneyId)
    .single()

  if (fetchErr || !attorney) return Response.json({ error: 'Attorney record missing.' }, { status: 404 })
  if (!ctx.email) return Response.json({ error: 'Add an email to your profile first.' }, { status: 400 })

  let stripeAccountId = attorney.stripe_account_id
  try {
    if (!stripeAccountId) {
      const account = await getStripe().accounts.create({
        type: 'express',
        email: ctx.email,
        capabilities: { transfers: { requested: true } },
        metadata: { attorneyId: String(attorney.id) },
      })
      stripeAccountId = account.id
      const { error: updErr } = await ctx.db
        .from('attorneys')
        .update({ stripe_account_id: stripeAccountId, stripe_onboarding_complete: false })
        .eq('id', attorney.id)
      if (updErr) {
        console.error('[attorney/connect/onboard] persist failed', updErr.message)
        return Response.json({ error: `Stripe account created but couldn't be saved: ${updErr.message}` }, { status: 500 })
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.yousafeconsultancy.com'
    const link = await getStripe().accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${appUrl}/dashboard?attorney_connect=refresh`,
      return_url: `${appUrl}/dashboard?attorney_connect=complete`,
      type: 'account_onboarding',
    })

    return Response.json({ url: link.url })
  } catch (err) {
    const message = describeStripeError(err)
    console.error('[attorney/connect/onboard] Stripe error', message, err)
    return Response.json({ error: `Stripe Connect: ${message}` }, { status: 500 })
  }
}
