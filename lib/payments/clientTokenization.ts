/**
 * Client-side tokenization helpers — abstracts NMI Collect.js and
 * Authorize.net Accept.js behind a single API so payment UIs don't need to
 * branch by provider.
 *
 * Usage:
 *   const cfg = await fetch('/api/payments/config').then(r => r.json())
 *   await loadTokenizer(cfg)
 *   const result = await tokenizeCard(cfg, cardData)
 *   // result.token is the opaque value to POST to /api/payments/charge.
 *
 * For NMI the "card data" is provided via Collect.js's own iframe-secured
 * fields (the SDK calls the callback with a token); for Authorize.net the
 * caller passes raw card data and we dispatch via Accept.dispatchData. Both
 * paths return a single string token that lib/payments/providers/* understand.
 *
 * This module is intentionally framework-free so it can be imported from
 * .jsx, .tsx, and admin tooling. It is browser-only — `loadTokenizer` only
 * makes sense after the page has mounted.
 */

type Gateway = 'nmi' | 'authorizenet'

interface PaymentConfig {
  provider: Gateway | string
  scriptUrl: string
  tokenizationKey?: string
  publicKey?: string
  variant?: 'lightbox' | 'inline'
  defaultGateway?: string
  availableGateways?: string[]
}

interface RawCardData {
  cardNumber: string
  expMonth: string // "MM"
  expYear: string  // "YY" or "YYYY"
  cvv: string
  zip?: string
}

export interface TokenizeResult {
  token: string
  brand?: string
  last4?: string
  expMonth?: string
  expYear?: string
}

/** Inject the gateway's tokenization SDK into the page once. */
export function loadTokenizer(cfg: PaymentConfig): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('loadTokenizer is browser-only'))
  if (!cfg.scriptUrl) return Promise.reject(new Error('Missing scriptUrl in payment config'))

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${cfg.scriptUrl}"]`)
    if (existing) return resolve()

    const script = document.createElement('script')
    script.src = cfg.scriptUrl
    script.async = true
    // NMI Collect.js reads its public key from this attribute. Accept.js
    // ignores it — Authorize.net takes the public client key in the
    // dispatchData call payload instead.
    if (cfg.provider === 'nmi' && cfg.tokenizationKey) {
      script.dataset.tokenizationKey = cfg.tokenizationKey
    }
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load ${cfg.scriptUrl}`))
    document.body.appendChild(script)
  })
}

/**
 * Tokenize raw card data via Authorize.net Accept.js. Returns the
 * opaque-data envelope ready to POST as the `token` field.
 *
 * Note: Accept.js requires the page to be served over HTTPS (or localhost)
 * and accepts plain card values — using this path puts the integration in
 * PCI SAQ A-EP scope. For SAQ A parity with NMI Collect.js's hosted iframe
 * fields, use the AcceptUI hosted modal variant instead (out of scope for
 * this helper).
 */
export async function tokenizeWithAcceptJs(
  cfg: PaymentConfig,
  card: RawCardData,
): Promise<TokenizeResult> {
  if (typeof window === 'undefined') throw new Error('tokenizeWithAcceptJs is browser-only')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Accept = (window as any).Accept
  if (!Accept) throw new Error('Accept.js not loaded — call loadTokenizer first')
  const publicKey = cfg.publicKey || cfg.tokenizationKey
  if (!publicKey || !cfg.tokenizationKey) {
    // We deliberately read both fields: getClientConfig() populates both for
    // Authorize.net but we don't want to require both here.
  }

  const apiLoginId = (cfg as PaymentConfig & { apiLoginId?: string }).apiLoginId
  // Authorize.net Accept.js needs BOTH the publicClientKey and the
  // apiLoginID. We don't ship apiLoginID from /api/payments/config (it's
  // sensitive enough that we'd rather not put it in client JSON). Callers
  // that need direct tokenization should pass it in cfg explicitly.
  return new Promise<TokenizeResult>((resolve, reject) => {
    const expYear = card.expYear.length === 4 ? card.expYear.slice(-2) : card.expYear
    Accept.dispatchData(
      {
        authData: { clientKey: publicKey, apiLoginID: apiLoginId },
        cardData: {
          cardNumber: card.cardNumber.replace(/\s+/g, ''),
          month: card.expMonth.padStart(2, '0'),
          year: expYear,
          cardCode: card.cvv,
          zip: card.zip,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (response: any) => {
        if (response?.messages?.resultCode !== 'Ok') {
          const msg = response?.messages?.message?.[0]?.text || 'Tokenization failed'
          reject(new Error(msg))
          return
        }
        const opaque = response.opaqueData
        // We serialize as JSON so the server adapter (parseToken) can read
        // both dataDescriptor + dataValue without a second body field.
        resolve({
          token: JSON.stringify({ dataDescriptor: opaque.dataDescriptor, dataValue: opaque.dataValue }),
          last4: card.cardNumber.replace(/\D/g, '').slice(-4),
          expMonth: card.expMonth.padStart(2, '0'),
          expYear,
        })
      },
    )
  })
}
