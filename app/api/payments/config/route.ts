import { getPaymentProvider } from '@/lib/payments'

/**
 * GET /api/payments/config
 *
 * Returns the client-safe configuration the checkout UI needs (payment mode,
 * and for inline-token providers the public tokenization key + script URL).
 * Never returns a secret. Public — guest checkout needs it before sign-in.
 *
 * Because the checkout UI reads its provider config from here at runtime,
 * swapping the PAYMENT_PROVIDER env var changes the checkout with no rebuild.
 */
export async function GET() {
  try {
    const config = getPaymentProvider().getClientConfig()
    return Response.json(config, { headers: { 'cache-control': 'no-store' } })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Payment provider not configured.' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}
