import { getCurrentConsultant } from '@/lib/consultant'

/**
 * Stripe Connect onboarding is not yet wired.
 * Once the STRIPE_SECRET_KEY is available and the `stripe` npm package is
 * installed, this endpoint should create a Stripe Account Link and return
 * the onboarding URL so the consultant is redirected to Stripe's hosted
 * onboarding flow.
 *
 * When ready, the implementation pattern is:
 *
 *   import Stripe from 'stripe'
 *   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
 *
 *   // Create or retrieve Stripe account
 *   let accountId = consultant.stripe_account_id
 *   if (!accountId) {
 *     const account = await stripe.accounts.create({ type: 'express' })
 *     accountId = account.id
 *     await db.from('consultants').update({ stripe_account_id: accountId }).eq('id', consultant.id)
 *   }
 *
 *   // Generate onboarding link
 *   const link = await stripe.accountLinks.create({
 *     account: accountId,
 *     refresh_url: `${origin}/dashboard/consultant?goto=connect`,
 *     return_url: `${origin}/dashboard/consultant?goto=connect`,
 *     type: 'account_onboarding',
 *   })
 *   return Response.json({ url: link.url })
 */
export async function POST() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  return Response.json(
    { error: 'Stripe Connect is not yet configured. Please contact support to set up your payout account.' },
    { status: 501 },
  )
}
