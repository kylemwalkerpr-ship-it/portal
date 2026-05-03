import Stripe from 'stripe'

export function getStripe(): Stripe {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable')
  }
  // Cloudflare Workers don't support Node's http/https modules — must use Fetch
  return new Stripe(stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}
