import { getDefaultGatewayId, getPaymentProvider, listPaymentProviders } from '@/lib/payments'

/**
 * GET /api/payments/config?gateway=nmi|authorizenet
 *
 * Returns the client-safe configuration the checkout UI needs (payment mode,
 * public tokenization key + script URL). Never returns a secret. Public —
 * guest checkout needs it before sign-in.
 *
 * `?gateway=` pins the response to a specific gateway. Omit for the platform
 * default (env `PAYMENT_PROVIDER` / `getDefaultGatewayId()`). The response
 * also includes the platform default and the full set of registered gateway
 * ids so the UI can render a toggle without a second round-trip.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const requested = url.searchParams.get('gateway')
    const defaultGateway = getDefaultGatewayId()
    const gatewayId = (requested || defaultGateway).toLowerCase()

    const config = getPaymentProvider(gatewayId).getClientConfig()
    return Response.json(
      {
        ...config,
        defaultGateway,
        availableGateways: listPaymentProviders(),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Payment provider not configured.' },
      { status: 500, headers: { 'cache-control': 'no-store' } },
    )
  }
}
