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

export * from './types'

const PROVIDERS: Record<string, PaymentProvider> = {
  nmi: nmiProvider,
  manual: manualProvider,
}

const DEFAULT_PROVIDER = 'nmi'

/**
 * The active payment provider, chosen by the `PAYMENT_PROVIDER` env var.
 * This is the ONLY function commerce code should use to reach a gateway.
 */
export function getPaymentProvider(): PaymentProvider {
  const id = (process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER).toLowerCase()
  const provider = PROVIDERS[id]
  if (!provider) {
    throw new Error(
      `Unknown PAYMENT_PROVIDER "${id}". Registered: ${Object.keys(PROVIDERS).join(', ')}.`,
    )
  }
  return provider
}

/** Ids of every registered adapter — useful for admin tooling and tests. */
export function listPaymentProviders(): string[] {
  return Object.keys(PROVIDERS)
}
