import { getCurrentConsultant } from '@/lib/consultant'

/**
 * Stripe Connect dashboard link is not yet wired.
 * Once the STRIPE_SECRET_KEY is available and the `stripe` npm package is
 * installed, this endpoint should create a Stripe Login Link and return the
 * URL so the consultant can view their payout dashboard.
 *
 * When ready:
 *
 *   import Stripe from 'stripe'
 *   const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
 *   const link = await stripe.accounts.createLoginLink(consultant.stripe_account_id)
 *   return Response.json({ url: link.url })
 */
export async function POST() {
  const auth = await getCurrentConsultant()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { consultant } = auth

  if (!consultant.stripe_account_id) {
    return Response.json(
      { error: 'No Stripe account connected. Please start the onboarding process first.' },
      { status: 400 },
    )
  }

  return Response.json(
    { error: 'Stripe Connect dashboard is not yet available. Please contact support for payout details.' },
    { status: 501 },
  )
}
