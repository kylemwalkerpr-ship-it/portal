/**
 * Authorize.net payment adapter (via Kurv Pay merchant account).
 *
 * Flow: the checkout UI loads Accept.js (URL + AUTHORIZENET_PUBLIC_CLIENT_KEY
 * from `getClientConfig`), the card fields tokenize client-side into a
 * one-time `opaque payment data` blob (`dataDescriptor` + `dataValue`), and
 * `charge()` posts those values to the Authorize.net Payment Transactions API
 * server-side. Card data never touches our server — PCI-DSS SAQ A scope is
 * preserved.
 *
 * Token format on the wire: because the abstraction uses a single `token`
 * string, the client serialises the Accept.js result as JSON
 * `{ "dataDescriptor": "...", "dataValue": "..." }`. The adapter parses it
 * back. If a caller sends a bare string we treat it as `dataValue` with the
 * default Accept.js descriptor.
 *
 * Secrets/config (set on the Worker, see lib/payments/README.md):
 *   AUTHORIZENET_LOGIN_ID            — API login id (Worker secret).
 *   AUTHORIZENET_TRANSACTION_KEY     — API transaction key (Worker secret).
 *   AUTHORIZENET_PUBLIC_CLIENT_KEY   — Accept.js public client key (browser-safe).
 *   AUTHORIZENET_ENVIRONMENT         — "sandbox" | "production" (default sandbox).
 *   AUTHORIZENET_ACCEPT_VARIANT      — "accept-js" (default) | "accept-hosted".
 *   AUTHORIZENET_SIGNATURE_KEY       — webhook HMAC signature key (Worker secret;
 *                                       read by the webhook route, not here).
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

const SANDBOX_API = 'https://apitest.authorize.net/xml/v1/request.api'
const PRODUCTION_API = 'https://api.authorize.net/xml/v1/request.api'
const SANDBOX_ACCEPT_JS = 'https://jstest.authorize.net/v1/Accept.js'
const PRODUCTION_ACCEPT_JS = 'https://js.authorize.net/v1/Accept.js'

function isProduction(): boolean {
  return (process.env.AUTHORIZENET_ENVIRONMENT || 'sandbox').toLowerCase() === 'production'
}

function apiUrl(): string {
  return isProduction() ? PRODUCTION_API : SANDBOX_API
}

function acceptJsUrl(): string {
  return isProduction() ? PRODUCTION_ACCEPT_JS : SANDBOX_ACCEPT_JS
}

function merchantAuth(): { name: string; transactionKey: string } {
  const name = process.env.AUTHORIZENET_LOGIN_ID
  const transactionKey = process.env.AUTHORIZENET_TRANSACTION_KEY
  if (!name || !transactionKey) {
    throw new Error('Missing AUTHORIZENET_LOGIN_ID or AUTHORIZENET_TRANSACTION_KEY')
  }
  return { name, transactionKey }
}

interface OpaqueData {
  dataDescriptor: string
  dataValue: string
}

function parseToken(token: string): OpaqueData {
  // Tolerate three input shapes:
  //   1. JSON `{ dataDescriptor, dataValue }` (preferred, emitted by our UI)
  //   2. JSON `{ opaqueData: { dataDescriptor, dataValue } }` (raw Accept.js
  //      callback shape — useful if a future caller forwards it unmodified)
  //   3. Bare string (treat as dataValue with default descriptor)
  try {
    const parsed = JSON.parse(token)
    if (parsed && typeof parsed === 'object') {
      const o = parsed.opaqueData || parsed
      if (typeof o.dataDescriptor === 'string' && typeof o.dataValue === 'string') {
        return { dataDescriptor: o.dataDescriptor, dataValue: o.dataValue }
      }
    }
  } catch {
    /* fall through */
  }
  return { dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', dataValue: token }
}

async function postToAuthnet(payload: Record<string, unknown>): Promise<any> {
  const res = await fetch(apiUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  // Authorize.net's JSON endpoint returns a BOM-prefixed body even for
  // application/json. Strip it before parsing or JSON.parse blows up.
  const text = (await res.text()).replace(/^﻿/, '').trim()
  if (!text) {
    throw new Error('Empty response from Authorize.net')
  }
  return JSON.parse(text)
}

interface AuthnetResultCode {
  resultCode: 'Ok' | 'Error'
  message?: Array<{ code: string; text: string }>
}

interface TransactionResponse {
  responseCode?: '1' | '2' | '3' | '4' // 1=approved, 2=declined, 3=error, 4=held for review
  transId?: string
  messages?: Array<{ code: string; description: string }>
  errors?: Array<{ errorCode: string; errorText: string }>
  accountType?: string
  accountNumber?: string
}

function readMessage(messages?: AuthnetResultCode['message']): string {
  if (!messages || messages.length === 0) return ''
  return messages.map((m) => m.text).join('; ')
}

function readTxMessage(tr: TransactionResponse): string {
  if (tr.messages && tr.messages.length > 0) {
    return tr.messages.map((m) => m.description).join('; ')
  }
  if (tr.errors && tr.errors.length > 0) {
    return tr.errors.map((e) => e.errorText).join('; ')
  }
  return ''
}

function cardDisplayFromAccount(tr: TransactionResponse, fallback?: CardDisplay): CardDisplay | null {
  if (tr.accountNumber) {
    // accountNumber comes back like "XXXX1111"; brand is the accountType.
    return {
      brand: tr.accountType || fallback?.brand || 'card',
      last4: tr.accountNumber.replace(/[^0-9]/g, '').slice(-4),
      expMonth: fallback?.expMonth || '',
      expYear: fallback?.expYear || '',
    }
  }
  return fallback || null
}

export const authorizenetProvider: PaymentProvider = {
  id: 'authorizenet',
  mode: 'inline-token',

  getClientConfig(): PublicClientConfig {
    return {
      provider: 'authorizenet',
      mode: 'inline-token',
      tokenizationKey: process.env.AUTHORIZENET_PUBLIC_CLIENT_KEY || '',
      scriptUrl: acceptJsUrl(),
      // Authorize.net Accept.js doesn't have a "lightbox vs inline" toggle the
      // same way NMI Collect.js does, but we re-use the field to convey the
      // chosen integration surface (accept-js vs the hosted-payment variant).
      // The client surface inspects `provider` and renders accordingly.
      variant: 'inline',
      publicKey: process.env.AUTHORIZENET_PUBLIC_CLIENT_KEY || '',
    }
  },

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const opaque = parseToken(req.token)
    const amount = (req.amountCents / 100).toFixed(2)
    const payload = {
      createTransactionRequest: {
        merchantAuthentication: merchantAuth(),
        refId: req.metadata?.orderId?.slice(0, 20),
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount,
          currencyCode: req.currency.toUpperCase(),
          payment: { opaqueData: opaque },
          order: req.metadata?.orderId
            ? {
                invoiceNumber: req.metadata.orderId.slice(0, 20),
                description: req.items
                  .map((i) => `${i.quantity}x ${i.name}`)
                  .join(', ')
                  .slice(0, 255),
              }
            : undefined,
          customer: { email: req.customer.email },
          billTo: req.customer.name
            ? { firstName: req.customer.name.split(' ')[0]?.slice(0, 50) || '', lastName: req.customer.name.split(' ').slice(1).join(' ').slice(0, 50) || '' }
            : undefined,
        },
      },
    }

    let r: any
    try {
      r = await postToAuthnet(payload)
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        transactionId: null,
        message: err instanceof Error ? err.message : 'Authorize.net request failed',
      }
    }

    const tr: TransactionResponse | undefined = r.transactionResponse
    const outerOk = r.messages?.resultCode === 'Ok'
    const approved = outerOk && tr?.responseCode === '1'
    const declined = tr?.responseCode === '2'
    const held = tr?.responseCode === '4'
    return {
      ok: approved,
      status: approved ? 'paid' : declined ? 'declined' : held ? 'pending' : 'error',
      transactionId: tr?.transId || null,
      message: readTxMessage(tr || {}) || readMessage(r.messages?.message) || 'No response text from Authorize.net',
      raw: r,
    }
  },

  async refund(transactionId: string, amountCents?: number): Promise<RefundResult> {
    // Authorize.net refundTransaction requires the last 4 of the card OR a
    // tokenised payment reference. The transaction we settled has the masked
    // PAN on file, so we issue an unlinkedCredit-style refund via the
    // transaction id. Use `0.00` to refund the full settled amount; the API
    // also accepts an explicit lesser amount.
    const amount = amountCents != null ? (amountCents / 100).toFixed(2) : '0.00'
    const payload = {
      createTransactionRequest: {
        merchantAuthentication: merchantAuth(),
        transactionRequest: {
          transactionType: 'refundTransaction',
          amount,
          refTransId: transactionId,
        },
      },
    }
    try {
      const r = await postToAuthnet(payload)
      const tr: TransactionResponse | undefined = r.transactionResponse
      const ok = r.messages?.resultCode === 'Ok' && tr?.responseCode === '1'
      return {
        ok,
        transactionId: tr?.transId || transactionId,
        message: readTxMessage(tr || {}) || readMessage(r.messages?.message) || 'No response text from Authorize.net',
      }
    } catch (err) {
      return {
        ok: false,
        transactionId,
        message: err instanceof Error ? err.message : 'Authorize.net refund request failed',
      }
    }
  },

  supportsVault: true,

  async vaultCard(req: VaultCardRequest): Promise<VaultCardResult> {
    // Authorize.net CIM: createCustomerProfile with a paymentProfile that
    // wraps the Accept.js opaqueData. The gateway returns
    // customerProfileId + customerPaymentProfileId. We store both joined as
    // "<profileId>:<paymentProfileId>" in `vaultId` so chargeVaulted /
    // deleteVaultedCard can split them back out.
    const opaque = parseToken(req.token)
    const payload = {
      createCustomerProfileRequest: {
        merchantAuthentication: merchantAuth(),
        profile: {
          merchantCustomerId: `ys_${Date.now().toString(36)}`.slice(0, 20),
          email: req.customer.email,
          paymentProfiles: {
            customerType: 'individual',
            payment: { opaqueData: opaque },
          },
        },
        validationMode: isProduction() ? 'liveMode' : 'testMode',
      },
    }
    let r: any
    try {
      r = await postToAuthnet(payload)
    } catch (err) {
      return {
        ok: false,
        vaultId: null,
        cardDisplay: null,
        message: err instanceof Error ? err.message : 'Authorize.net vault request failed',
      }
    }
    const ok = r.messages?.resultCode === 'Ok' && r.customerProfileId
    const customerProfileId: string | undefined = r.customerProfileId
    const paymentProfileId: string | undefined = Array.isArray(r.customerPaymentProfileIdList) && r.customerPaymentProfileIdList[0]
      ? r.customerPaymentProfileIdList[0]
      : undefined
    const vaultId = ok && customerProfileId && paymentProfileId ? `${customerProfileId}:${paymentProfileId}` : null
    return {
      ok: !!vaultId,
      vaultId,
      cardDisplay: vaultId ? req.cardDisplay || null : null,
      message: readMessage(r.messages?.message) || 'No response text from Authorize.net',
    }
  },

  async chargeVaulted(req: ChargeVaultedRequest): Promise<ChargeResult> {
    const [customerProfileId, paymentProfileId] = req.vaultId.split(':')
    if (!customerProfileId || !paymentProfileId) {
      return {
        ok: false,
        status: 'error',
        transactionId: null,
        message: 'Malformed Authorize.net vault id (expected "customerProfileId:paymentProfileId")',
      }
    }
    const amount = (req.amountCents / 100).toFixed(2)
    const payload = {
      createTransactionRequest: {
        merchantAuthentication: merchantAuth(),
        refId: req.metadata?.orderId?.slice(0, 20),
        transactionRequest: {
          transactionType: 'authCaptureTransaction',
          amount,
          currencyCode: req.currency.toUpperCase(),
          profile: {
            customerProfileId,
            paymentProfile: { paymentProfileId },
          },
          order: req.metadata?.orderId
            ? { invoiceNumber: req.metadata.orderId.slice(0, 20) }
            : undefined,
          customer: { email: req.customer.email },
        },
      },
    }
    let r: any
    try {
      r = await postToAuthnet(payload)
    } catch (err) {
      return {
        ok: false,
        status: 'error',
        transactionId: null,
        message: err instanceof Error ? err.message : 'Authorize.net request failed',
      }
    }
    const tr: TransactionResponse | undefined = r.transactionResponse
    const outerOk = r.messages?.resultCode === 'Ok'
    const approved = outerOk && tr?.responseCode === '1'
    const declined = tr?.responseCode === '2'
    const held = tr?.responseCode === '4'
    return {
      ok: approved,
      status: approved ? 'paid' : declined ? 'declined' : held ? 'pending' : 'error',
      transactionId: tr?.transId || null,
      message: readTxMessage(tr || {}) || readMessage(r.messages?.message) || 'No response text from Authorize.net',
      raw: r,
    }
  },

  async deleteVaultedCard(vaultId: string): Promise<{ ok: boolean; message: string }> {
    const [customerProfileId, paymentProfileId] = vaultId.split(':')
    if (!customerProfileId) {
      return { ok: false, message: 'Malformed Authorize.net vault id' }
    }
    // If only one payment profile exists on this customer profile, deleting
    // the whole customer profile is cleanest. Our `vaultCard` always creates
    // one customer profile per stored card, so this is always the right call.
    const payload = {
      deleteCustomerProfileRequest: {
        merchantAuthentication: merchantAuth(),
        customerProfileId,
      },
    }
    void paymentProfileId
    try {
      const r = await postToAuthnet(payload)
      const ok = r.messages?.resultCode === 'Ok'
      return { ok, message: readMessage(r.messages?.message) || 'No response text from Authorize.net' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Authorize.net delete request failed' }
    }
  },
}
