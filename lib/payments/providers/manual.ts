/**
 * Manual-invoice payment adapter.
 *
 * No live gateway. `charge()` records the order as pending and signals that
 * an invoice must be raised out-of-band (bank transfer, a one-off payment
 * link, etc.). Two uses:
 *  1. The interim model for provider services / gigs while automated escrow
 *     is deferred — the offer/accept workflow stays, money moves with a human
 *     in the loop.
 *  2. A safe fallback: if the live gateway is ever terminated, set
 *     PAYMENT_PROVIDER=manual and the estate keeps taking orders (as
 *     pending) instead of failing hard, while a new adapter is wired.
 */
import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  RefundResult,
  VaultCardRequest,
  VaultCardResult,
  ChargeVaultedRequest,
  PublicClientConfig,
} from '../types'

export const manualProvider: PaymentProvider = {
  id: 'manual',
  mode: 'manual-invoice',

  getClientConfig(): PublicClientConfig {
    return { provider: 'manual', mode: 'manual-invoice' }
  },

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    // Nothing is charged. The order is acknowledged as pending; the caller is
    // responsible for raising an invoice and marking the order paid later.
    return {
      ok: true,
      status: 'pending',
      transactionId: null,
      message: `Order recorded for manual invoicing (${req.items.length} item(s), ${req.customer.email}). An invoice will be sent.`,
    }
  },

  async refund(): Promise<RefundResult> {
    return {
      ok: false,
      transactionId: null,
      message: 'Manual provider: process this refund out-of-band.',
    }
  },

  // The manual provider has no gateway, so it cannot store or charge cards
  // on file. Callers must check `supportsVault` before offering card-on-file.
  supportsVault: false,

  async vaultCard(_req: VaultCardRequest): Promise<VaultCardResult> {
    return {
      ok: false,
      vaultId: null,
      cardDisplay: null,
      message: 'Manual provider does not support stored cards.',
    }
  },

  async chargeVaulted(_req: ChargeVaultedRequest): Promise<ChargeResult> {
    return {
      ok: false,
      status: 'error',
      transactionId: null,
      message: 'Manual provider does not support stored cards.',
    }
  },

  async deleteVaultedCard(): Promise<{ ok: boolean; message: string }> {
    return { ok: false, message: 'Manual provider does not support stored cards.' }
  },
}
