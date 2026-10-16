import type {
  ChargeRequest,
  ChargeResult,
  ChargeVaultedRequest,
  HostedSessionRequest,
  HostedSessionResult,
  HostedStatusResult,
  PaymentProvider,
  PublicClientConfig,
  RefundOptions,
  RefundResult,
  VaultCardRequest,
  VaultCardResult,
} from '../types'

const LIVE_API = 'https://pay.pesapal.com/v3'
const SANDBOX_API = 'https://cybqa.pesapal.com/pesapalv3'
const MERCHANT_REFERENCE_RE = /^[A-Za-z0-9\-_.:]{1,50}$/

export type PesapalIpnMethod = 'GET' | 'POST'

type PesapalEnvironment = {
  PESAPAL_CONSUMER_KEY?: string
  PESAPAL_CONSUMER_SECRET?: string
  PESAPAL_IPN_ID?: string
  PESAPAL_ENV?: string
}

type PesapalFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type PesapalProvider = PaymentProvider &
  Required<Pick<PaymentProvider, 'createHostedSession' | 'getTransactionStatus'>> & {
    registerIpn(url: string, method: PesapalIpnMethod): Promise<Record<string, unknown>>
    getIpnList(): Promise<unknown>
  }

function messageFrom(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback
  const record = payload as Record<string, unknown>
  const message = record.message || record.error || record.error_description
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 500) : fallback
}

async function readJson(response: Response, fallback: string): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(messageFrom(payload, fallback))
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error(fallback)
  return payload as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Pesapal returned an invalid ${label}.`)
  return value.trim()
}

function statusFromCode(value: unknown): HostedStatusResult['status'] {
  switch (Number(value)) {
    case 0: return 'invalid'
    case 1: return 'completed'
    case 2: return 'failed'
    case 3: return 'reversed'
    default: return 'pending'
  }
}

function amountToCents(value: unknown): number | null {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null
}

/** A provider factory with an injectable transport. Tests can exercise the full adapter without networking. */
export function createPesapalProvider(options: {
  env?: PesapalEnvironment
  fetcher?: PesapalFetch
  now?: () => number
} = {}): PesapalProvider {
  const env = options.env ?? process.env
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now
  const environment = String(env.PESAPAL_ENV || 'live').trim().toLowerCase()
  if (!['live', 'sandbox'].includes(environment)) throw new Error('PESAPAL_ENV must be either live or sandbox.')
  const baseUrl = environment === 'sandbox' ? SANDBOX_API : LIVE_API
  let tokenCache: { token: string; expiresAt: number } | null = null
  let tokenPromise: Promise<string> | null = null

  function credentials() {
    const consumerKey = env.PESAPAL_CONSUMER_KEY
    const consumerSecret = env.PESAPAL_CONSUMER_SECRET
    if (!consumerKey || !consumerSecret) throw new Error('Pesapal is not configured.')
    return { consumerKey, consumerSecret }
  }

  async function getToken(): Promise<string> {
    if (tokenCache && tokenCache.expiresAt - 30_000 > now()) return tokenCache.token
    if (tokenPromise) return tokenPromise

    tokenPromise = (async () => {
      const { consumerKey, consumerSecret } = credentials()
      const response = await fetcher(`${baseUrl}/api/Auth/RequestToken`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ consumer_key: consumerKey, consumer_secret: consumerSecret }),
      })
      const payload = await readJson(response, 'Pesapal authentication failed.')
      const token = requiredString(payload.token, 'access token')
      const expiry = typeof payload.expiryDate === 'string' ? Date.parse(payload.expiryDate) : Number.NaN
      tokenCache = { token, expiresAt: Number.isFinite(expiry) ? expiry : now() + 4.5 * 60_000 }
      return token
    })()

    try {
      return await tokenPromise
    } finally {
      tokenPromise = null
    }
  }

  async function request(path: string, init: RequestInit = {}) {
    const token = await getToken()
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    headers.set('Content-Type', 'application/json')
    headers.set('Authorization', `Bearer ${token}`)
    return fetcher(`${baseUrl}${path}`, { ...init, headers })
  }

  async function registerIpn(url: string, method: PesapalIpnMethod) {
    if (method !== 'GET' && method !== 'POST') throw new Error('Pesapal IPN method must be GET or POST.')
    const notificationUrl = new URL(url)
    if (notificationUrl.protocol !== 'https:' || notificationUrl.username || notificationUrl.password) {
      throw new Error('Pesapal IPN URL must be a public HTTPS URL.')
    }
    const response = await request('/api/URLSetup/RegisterIPN', {
      method: 'POST',
      body: JSON.stringify({ url: notificationUrl.toString(), ipn_notification_type: method }),
    })
    return readJson(response, 'Pesapal IPN registration failed.')
  }

  async function getIpnList() {
    const response = await request('/api/URLSetup/GetIpnList', { method: 'GET' })
    const payload: unknown = await response.json().catch(() => null)
    if (!response.ok) throw new Error(messageFrom(payload, 'Pesapal IPN list is unavailable.'))
    if (!Array.isArray(payload) && (!payload || typeof payload !== 'object')) {
      throw new Error('Pesapal returned an invalid IPN list.')
    }
    return payload
  }

  const unsupported = (feature: string) => new Error(`Pesapal does not support ${feature} in hosted checkout.`)

  return {
    id: 'pesapal',
    mode: 'hosted-redirect',
    supportsVault: false,

    getClientConfig(): PublicClientConfig {
      return { provider: 'pesapal', mode: 'hosted-redirect' }
    },

    async charge(_req: ChargeRequest): Promise<ChargeResult> {
      throw new Error('Pesapal uses a hosted checkout session; direct card charges are not supported.')
    },

    async createHostedSession(req: HostedSessionRequest): Promise<HostedSessionResult> {
      const notificationId = req.notificationId || env.PESAPAL_IPN_ID
      if (!notificationId) throw new Error('Pesapal notification registration is not configured.')
      if (!MERCHANT_REFERENCE_RE.test(req.merchantReference)) throw new Error('Pesapal merchant reference is invalid.')
      if (!Number.isSafeInteger(req.amountCents) || req.amountCents <= 0) throw new Error('Pesapal amount must be positive.')
      const currency = req.currency.toUpperCase()
      if (!['USD', 'GBP'].includes(currency)) throw new Error('Pesapal only settles USD or GBP.')
      if (!req.customer.email) throw new Error('A customer email is required for Pesapal checkout.')

      const billingAddress: Record<string, string> = { email_address: req.customer.email }
      if (req.customer.phone) billingAddress.phone_number = req.customer.phone
      if (req.customer.countryCode) billingAddress.country_code = req.customer.countryCode
      if (req.customer.name) {
        const [firstName, ...lastName] = req.customer.name.trim().split(/\s+/)
        billingAddress.first_name = firstName || 'Customer'
        if (lastName.length) billingAddress.last_name = lastName.join(' ')
      }

      const payload = {
        id: req.merchantReference,
        currency,
        amount: req.amountCents / 100,
        description: req.description.replace(/\s+/g, ' ').slice(0, 100) || 'YouSafe checkout',
        callback_url: req.callbackUrl,
        ...(req.cancellationUrl ? { cancellation_url: req.cancellationUrl } : {}),
        notification_id: notificationId,
        billing_address: billingAddress,
        redirect_mode: req.redirectMode || 'PARENT_WINDOW',
      }
      const response = await request('/api/Transactions/SubmitOrderRequest', { method: 'POST', body: JSON.stringify(payload) })
      const result = await readJson(response, 'Pesapal could not start checkout.')
      const redirectUrl = new URL(requiredString(result.redirect_url, 'redirect URL'))
      if (redirectUrl.protocol !== 'https:' || redirectUrl.hostname !== new URL(baseUrl).hostname) {
        throw new Error('Pesapal returned an unexpected checkout URL.')
      }
      const returnedReference = typeof result.merchant_reference === 'string' && result.merchant_reference
        ? result.merchant_reference : req.merchantReference
      if (returnedReference !== req.merchantReference) throw new Error('Pesapal returned a mismatched merchant reference.')
      return {
        redirectUrl: redirectUrl.toString(),
        trackingId: requiredString(result.order_tracking_id, 'tracking id'),
        merchantReference: returnedReference,
      }
    },

    async getTransactionStatus(trackingId: string): Promise<HostedStatusResult> {
      if (!trackingId.trim()) throw new Error('Pesapal tracking id is required.')
      const response = await request(`/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`, { method: 'GET' })
      const result = await readJson(response, 'Pesapal transaction status is unavailable.')
      const statusCode = Number.isFinite(Number(result.status_code)) ? Number(result.status_code) : null
      return {
        status: statusFromCode(result.status_code),
        statusCode,
        amountCents: amountToCents(result.amount),
        currency: typeof result.currency === 'string' ? result.currency.toUpperCase() : null,
        merchantReference: typeof result.merchant_reference === 'string' ? result.merchant_reference : null,
        confirmationCode: typeof result.confirmation_code === 'string' ? result.confirmation_code : null,
        paymentMethod: typeof result.payment_method === 'string' ? result.payment_method : null,
        paymentAccount: typeof result.payment_account === 'string' ? result.payment_account : null,
        createdAt: typeof result.created_date === 'string' ? result.created_date : null,
      }
    },

    registerIpn,
    getIpnList,

    async refund(confirmationCode: string, amountCents?: number, refundOptions?: RefundOptions): Promise<RefundResult> {
      if (!refundOptions?.username?.trim()) {
        return { ok: false, transactionId: confirmationCode || null, message: 'Pesapal refund requires the merchant username.', status: 'failed' }
      }
      const response = await request('/api/Transactions/RefundRequest', {
        method: 'POST',
        body: JSON.stringify({
          confirmation_code: confirmationCode,
          ...(amountCents === undefined ? {} : { amount: amountCents / 100 }),
          username: refundOptions.username.trim(),
          remarks: refundOptions.remarks?.trim().slice(0, 200) || 'Refund requested by customer support',
        }),
      })
      await readJson(response, 'Pesapal could not submit the refund request.')
      return {
        ok: true,
        transactionId: confirmationCode,
        message: 'Refund request received by Pesapal and awaiting merchant approval.',
        status: 'pending',
      }
    },

    async vaultCard(_req: VaultCardRequest): Promise<VaultCardResult> { throw unsupported('card vaulting') },
    async chargeVaulted(_req: ChargeVaultedRequest): Promise<ChargeResult> { throw unsupported('saved cards') },
    async deleteVaultedCard(): Promise<{ ok: boolean; message: string }> {
      return { ok: false, message: 'Pesapal does not support saved cards in hosted checkout.' }
    },
  }
}

export const pesapalProvider = createPesapalProvider()

/** Register an HTTPS callback URL with the configured live or sandbox account. */
export function registerIpn(url: string, method: PesapalIpnMethod) {
  return pesapalProvider.registerIpn(url, method)
}

/** List IPN URLs registered with the configured live or sandbox account. */
export function getIpnList() {
  return pesapalProvider.getIpnList()
}
