import Stripe from 'stripe'

let _client: Stripe | null = null

export function getStripe(): Stripe {
  if (!_client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
    _client = new Stripe(key)
  }
  return _client
}
