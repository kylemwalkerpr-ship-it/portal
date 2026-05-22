/**
 * NMI payment adapter.
 *
 * Flow: the checkout UI loads Collect.js (URL + tokenization key from
 * `getClientConfig`), the card fields tokenize client-side into a
 * single-use `payment_token`, and `charge()` POSTs that token to the
 * Payment API server-side. Card data never touches our server — PCI-DSS
 * SAQ A scope is preserved.
 *
 * Reseller white-label note: most NMI accounts are placed via a reseller
 * who issues their own gateway URL (e.g. paykings.transactiongateway.com).
 * Both Collect.js and the Payment API live on that same host. The
 * defaults below resolve to the reseller host automatically when you set
 * `NMI_GATEWAY_HOST` — recommended over setting `NMI_API_URL` directly.
 *
 * Secrets/config (set on the Worker, see lib/payments/README.md):
 *   NMI_SECURITY_KEY      private API key — server only, never client-side.
 *   NMI_TOKENIZATION_KEY  public tokenization key — safe for the browser.
 *   NMI_GATEWAY_HOST      e.g. "paykings.transactiongateway.com" — the
 *                         reseller-issued hostname. Optional; defaults to
 *                         secure.nmi.com.
 *   NMI_COLLECT_VARIANT   "lightbox" (default) or "inline" — the Collect.js
 *                         UI variant the checkout UI should use.
 *   NMI_API_URL           Optional override for the full Payment API URL.
 *                         If set, takes precedence over NMI_GATEWAY_HOST.
 */
import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  RefundResult,
  VaultCardRequest,
  VaultCardResult,
  ChargeVaultedRequest,
  CardDisplay,
  PublicClientConfig,
} from '../types'

const DEFAULT_HOST = 'secure.nmi.com'

function gatewayHost(): string {
  return process.env.NMI_GATEWAY_HOST || DEFAULT_HOST
}

function apiUrl(): string {
  return process.env.NMI_API_URL || `https://${gatewayHost()}/api/transact.php`
}

function collectJsUrl(): string {
  return `https://${gatewayHost()}/token/Collect.js`
}

function collectVariant(): 'lightbox' | 'inline' {
  const v = (process.env.NMI_COLLECT_VARIANT || 'lightbox').toLowerCase()
  return v === 'inline' ? 'inline' : 'lightbox'
}

/** NMI returns an application/x-www-form-urlencoded body. */
function parseNmiResponse(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body))
}

async function postToNmi(params: Record<string, string>): Promise<Record<string, string>> {
  const securityKey = process.env.NMI_SECURITY_KEY
  if (!securityKey) {
    throw new Error('Missing NMI_SECURITY_KEY environment variable')
  }
  const body = new URLSearchParams({ security_key: securityKey, ...params })
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  return parseNmiResponse(await res.text())
}

export const nmiProvider: PaymentProvider = {
  id: 'nmi',
  mode: 'inline-token',

  getClientConfig(): PublicClientConfig {
    return {
      provider: 'nmi',
      mode: 'inline-token',
      tokenizationKey: process.env.NMI_TOKENIZATION_KEY || '',
      scriptUrl: collectJsUrl(),
      variant: collectVariant(),
    }
  },

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    // NMI takes the amount as decimal major units, not cents.
    const amount = (req.amountCents / 100).toFixed(2)
    const params: Record<string, string> = {
      type: 'sale',
      payment_token: req.token,
      amount,
      currency: req.currency,
      email: req.customer.email,
      orderdescription: req.items
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(', ')
        .slice(0, 250),
    }
    if (req.customer.name) params.first_name = req.customer.name.slice(0, 50)
    if (req.metadata?.orderId) params.orderid = req.metadata.orderId

    let r: Record<string, string>
    try {
      r = await postToNmi(params)
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        transactionId: null,
        message: err instanceof Error ? err.message : 'NMI request failed',
      }
    }

    // NMI: response 1 = approved, 2 = declined, 3 = error/invalid.
    const approved = r.response === '1'
    return {
      ok: approved,
      status: approved ? 'paid' : r.response === '2' ? 'declined' : 'error',
      transactionId: r.transactionid || null,
      message: r.responsetext || 'No response text from NMI',
      raw: r,
    }
  },

  async refund(transactionId: string, amountCents?: number): Promise<RefundResult> {
    const params: Record<string, string> = { type: 'refund', transactionid: transactionId }
    if (amountCents != null) params.amount = (amountCents / 100).toFixed(2)
    try {
      const r = await postToNmi(params)
      return {
        ok: r.response === '1',
        transactionId: r.transactionid || transactionId,
        message: r.responsetext || 'No response text from NMI',
      }
    } catch (err) {
      return {
        ok: false,
        transactionId,
        message: err instanceof Error ? err.message : 'NMI refund request failed',
      }
    }
  },

  supportsVault: true,

  async vaultCard(req: VaultCardRequest): Promise<VaultCardResult> {
    // NMI Customer Vault: add_customer with the Collect.js payment token.
    // The gateway generates and returns a customer_vault_id.
    let r: Record<string, string>
    try {
      r = await postToNmi({
        customer_vault: 'add_customer',
        payment_token: req.token,
        email: req.customer.email,
        ...(req.customer.name ? { first_name: req.customer.name.slice(0, 50) } : {}),
      })
    } catch (err) {
      return {
        ok: false,
        vaultId: null,
        cardDisplay: null,
        message: err instanceof Error ? err.message : 'NMI vault request failed',
      }
    }
    const ok = r.response === '1'
    // Card display: prefer what NMI echoed back, else the client-supplied hint.
    const fromNmi: CardDisplay | null = r.cc_number
      ? {
          brand: r.cc_type || 'card',
          last4: r.cc_number.replace(/[^0-9]/g, '').slice(-4),
          expMonth: (r.cc_exp || '').slice(0, 2),
          expYear: (r.cc_exp || '').slice(2, 4),
        }
      : null
    return {
      ok,
      vaultId: ok ? r.customer_vault_id || null : null,
      cardDisplay: ok ? fromNmi || req.cardDisplay || null : null,
      message: r.responsetext || 'No response text from NMI',
    }
  },

  async chargeVaulted(req: ChargeVaultedRequest): Promise<ChargeResult> {
    const amount = (req.amountCents / 100).toFixed(2)
    const params: Record<string, string> = {
      type: 'sale',
      customer_vault_id: req.vaultId,
      amount,
      currency: req.currency,
      email: req.customer.email,
    }
    if (req.metadata?.orderId) params.orderid = req.metadata.orderId
    let r: Record<string, string>
    try {
      r = await postToNmi(params)
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        transactionId: null,
        message: err instanceof Error ? err.message : 'NMI request failed',
      }
    }
    const approved = r.response === '1'
    return {
      ok: approved,
      status: approved ? 'paid' : r.response === '2' ? 'declined' : 'error',
      transactionId: r.transactionid || null,
      message: r.responsetext || 'No response text from NMI',
      raw: r,
    }
  },

  async deleteVaultedCard(vaultId: string): Promise<{ ok: boolean; message: string }> {
    try {
      const r = await postToNmi({ customer_vault: 'delete_customer', customer_vault_id: vaultId })
      return { ok: r.response === '1', message: r.responsetext || 'No response text from NMI' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'NMI delete request failed' }
    }
  },
}
