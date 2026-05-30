/**
 * Payment-provider abstraction — the contract.
 *
 * Every payment gateway in the estate is reached ONLY through the
 * `PaymentProvider` interface below. No commerce code imports a gateway SDK
 * directly. Swapping gateways (e.g. if a provider terminates the account) is
 * therefore: write one new adapter file that implements this interface, add
 * it to the registry in `index.ts`, and change the `PAYMENT_PROVIDER` env var.
 * No call site changes. See `README.md` in this directory.
 */

/**
 * How the checkout UI must behave for a given provider:
 *  - inline-token   : card fields tokenize client-side (e.g. NMI Collect.js),
 *                     the server then charges the single-use token.
 *  - hosted-redirect: the buyer is redirected to a provider-hosted page.
 *  - manual-invoice : no live gateway; the order is recorded and an invoice
 *                     is raised out-of-band.
 */
export type PaymentMode = 'inline-token' | 'hosted-redirect' | 'manual-invoice'

export interface LineItem {
  /** Stable product identifier (template-pack slug, gig/offer id, etc.). */
  sku: string
  name: string
  /** Unit price in the smallest currency unit (cents). Server-resolved only. */
  unitAmountCents: number
  quantity: number
}

export interface CustomerInfo {
  email: string
  name?: string
}

export interface ChargeRequest {
  /** Single-use token from client-side tokenization (inline-token mode). */
  token: string
  /** Total to charge, in cents. The caller resolves this server-side from an
   *  authoritative catalogue — never from a client-supplied amount. */
  amountCents: number
  /** ISO currency code, e.g. 'USD'. */
  currency: string
  items: LineItem[]
  customer: CustomerInfo
  /** Free-form reconciliation data. `orderId` is honoured specially where the
   *  gateway supports a native order identifier. */
  metadata?: Record<string, string>
}

export interface ChargeResult {
  ok: boolean
  status: 'paid' | 'declined' | 'error' | 'pending'
  /** Gateway transaction id, when one exists. */
  transactionId: string | null
  /** Human-readable result text from the gateway. */
  message: string
  /** Raw gateway response, for logging/debugging. Never shown to buyers. */
  raw?: unknown
}

export interface RefundResult {
  ok: boolean
  transactionId: string | null
  message: string
}

/** Display-only card details — last4/brand/expiry. Not sensitive; used purely
 *  to show a saved card in the UI. */
export interface CardDisplay {
  brand: string
  last4: string
  expMonth: string
  expYear: string
}

export interface VaultCardRequest {
  /** Single-use token from client-side tokenization. */
  token: string
  customer: CustomerInfo
  /** Display info captured at tokenization time (e.g. NMI Collect.js gives
   *  brand/last4/expiry in its callback). Stored to render the saved card. */
  cardDisplay?: CardDisplay
}

export interface VaultCardResult {
  ok: boolean
  /** The provider's reusable reference to the stored card (NMI customer
   *  vault id, or the equivalent on another gateway). */
  vaultId: string | null
  cardDisplay: CardDisplay | null
  message: string
}

/** Charge a card already stored on file (card-on-file / wallet top-up). */
export interface ChargeVaultedRequest {
  vaultId: string
  amountCents: number
  currency: string
  customer: CustomerInfo
  metadata?: Record<string, string>
}

/**
 * Client-safe configuration the checkout UI needs to render. This is returned
 * by `GET /api/payments/config` and MUST NEVER contain a secret key.
 */
export interface PublicClientConfig {
  provider: string
  mode: PaymentMode
  /** inline-token: public tokenization key + the script the UI must load. */
  tokenizationKey?: string
  scriptUrl?: string
  /** inline-token: which Collect.js UI variant the checkout should mount.
   *  'lightbox' = a single "Pay" button that opens a hosted modal (default,
   *  simplest, no card fields on our page). 'inline' = iframed card fields
   *  embedded directly in the page. */
  variant?: 'lightbox' | 'inline'
  /** hosted-redirect: a publishable/client token. */
  publicKey?: string
  /** Authorize.net Accept.js requires both the public client key AND the
   *  API login id in the browser dispatch payload. The login id is
   *  browser-safe per Authorize.net's threat model — it's paired with the
   *  public client key, with no PCI scope on its own. */
  apiLoginId?: string
}

/**
 * The single interface every gateway adapter implements. The portal's
 * commerce code depends on THIS, never on a concrete gateway.
 */
export interface PaymentProvider {
  /** Stable adapter id, also the value of the PAYMENT_PROVIDER env var. */
  readonly id: string
  readonly mode: PaymentMode

  /** Client-safe config for the checkout UI. Never returns a secret. */
  getClientConfig(): PublicClientConfig

  /** Charge a tokenized payment. The one method every commerce flow calls. */
  charge(req: ChargeRequest): Promise<ChargeResult>

  /** Refund a settled transaction. Omit `amountCents` for a full refund. */
  refund(transactionId: string, amountCents?: number): Promise<RefundResult>

  // ── Card-on-file (vault) ──────────────────────────────────────────────
  // Used by the student wallet: store a card once, then charge it for
  // top-ups without re-collecting card details.

  /** Whether this provider can store cards on file. */
  readonly supportsVault: boolean

  /** Store a tokenized card on file; returns a reusable vault reference. */
  vaultCard(req: VaultCardRequest): Promise<VaultCardResult>

  /** Charge a card already stored on file. */
  chargeVaulted(req: ChargeVaultedRequest): Promise<ChargeResult>

  /** Remove a stored card. */
  deleteVaultedCard(vaultId: string): Promise<{ ok: boolean; message: string }>
}
