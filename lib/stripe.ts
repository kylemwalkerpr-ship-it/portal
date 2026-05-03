import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY
if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable')
}

export function getStripe(): Stripe {
  return new Stripe(stripeSecretKey, {
    apiVersion: Stripe.API_VERSION,
  })
}
