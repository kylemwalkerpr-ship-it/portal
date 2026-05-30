/**
 * Payment-provider registry — the single switch point for the whole estate.
 *
 * To swap payment gateways:
 *   1. Add an adapter file under `providers/` that implements `PaymentProvider`.
 *   2. Register it in `PROVIDERS` below (one line).
 *   3. Set the `PAYMENT_PROVIDER` env var to its id.
 * No commerce code changes. See `README.md`.
 */
import type { PaymentProvider } from './types'
import { nmiProvider } from './providers/nmi'
import { manualProvider } from './providers/manual'
import { authorizenetProvider } from './providers/authorizenet'

export * from './types'

const PROVIDERS: Record<string, PaymentProvider> = {
  nmi: nmiProvider,
  authorizenet: authorizenetProvider,
  manual: manualProvider,
}

const DEFAULT_PROVIDER = 'nmi'

/**
 * Resolve a payment provider by id. Pass an explicit id to dispatch by the
 * gateway recorded on a stored card / order (`student_payment_methods.gateway`,
 * `orders.gateway`). Omit to fall back to the platform default — read from
 * `PAYMENT_PROVIDER` so we don't have to redeploy to change the new-card
 * default once both gateways are wired.
 */
export function getPaymentProvider(gatewayId?: string | null): PaymentProvider {
  const id = (gatewayId || process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER).toLowerCase()
  const provider = PROVIDERS[id]
  if (!provider) {
    throw new Error(
      `Unknown payment provider "${id}". Registered: ${Object.keys(PROVIDERS).join(', ')}.`,
    )
  }
  return provider
}

/** The platform default gateway id — used when a flow has no per-record pinning. */
export function getDefaultGatewayId(): string {
  return (process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER).toLowerCase()
}

/** Ids of every registered adapter — useful for admin tooling and tests. */
export function listPaymentProviders(): string[] {
  return Object.keys(PROVIDERS)
}
