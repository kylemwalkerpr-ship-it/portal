import Stripe from 'stripe'

export function getStripe(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: Stripe.API_VERSION,
  })
}
