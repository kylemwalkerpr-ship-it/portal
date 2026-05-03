import Stripe from 'stripe'

export function getStripe(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  }
  // Use the SDK's pinned default API version — passing undefined here breaks the client
  return new Stripe(stripeSecretKey)
}
