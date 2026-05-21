/**
 * NMI payment adapter.
 *
 * Flow: the checkout UI loads NMI Collect.js (key from `getClientConfig`),
 * the card fields tokenize client-side into a single-use `payment_token`, and
 * `charge()` POSTs that token to the NMI Payment API server-side. Card data
 * never touches our server — this keeps the portal in PCI-DSS SAQ A scope.
 *
 * Secrets/config (set on the Worker, see lib/payments/README.md):
 *   NMI_SECURITY_KEY      private API key — server only, never client-side.
 *   NMI_TOKENIZATION_KEY  public tokenization key — safe for the browser.
 *   NMI_API_URL           optional; defaults to NMI's standard endpoint.
 *                         Set this if your reseller gave a white-label URL.
 */
import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  RefundResult,
  PublicClientConfig,
} from '../types'

const DEFAULT_API_URL = 'https://secure.nmi.com/api/transact.php'
const COLLECT_JS_URL = 'https://secure.nmi.com/token/Collect.js'

function apiUrl(): string {
  return process.env.NMI_API_URL || DEFAULT_API_URL
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
      scriptUrl: COLLECT_JS_URL,
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
}
