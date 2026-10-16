import { createPesapalProvider } from '@/lib/payments/providers/pesapal'
import { getPaymentProvider } from '@/lib/payments'

const env = {
  PESAPAL_CONSUMER_KEY: 'test-consumer-key',
  PESAPAL_CONSUMER_SECRET: 'test-consumer-secret',
  PESAPAL_IPN_ID: 'test-ipn-id',
  PESAPAL_ENV: 'live',
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

function sessionRequest() {
  return {
    merchantReference: 'ys:order-42:attempt-1',
    amountCents: 750,
    currency: 'USD',
    description: 'A legal consultation '.repeat(8),
    callbackUrl: 'https://portal.test/checkout/pesapal/return',
    cancellationUrl: 'https://portal.test/checkout/pesapal/return?cancelled=1',
    notificationId: 'test-ipn-id',
    customer: { email: 'buyer@example.test', name: 'Taylor Buyer', phone: '+15555550123', countryCode: 'US' },
  }
}

describe('Pesapal hosted provider', () => {
  it('is registered and never exposes credentials in its client config', () => {
    const provider = getPaymentProvider('pesapal')
    expect(provider.mode).toBe('hosted-redirect')
    expect(provider.supportsVault).toBe(false)
    expect(provider.getClientConfig()).toEqual({ provider: 'pesapal', mode: 'hosted-redirect' })
    expect(JSON.stringify(provider.getClientConfig())).not.toMatch(/test-consumer|secret|ipn/i)
  })

  it('caches auth tokens and submits a validated hosted checkout payload', async () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/api/Auth/RequestToken')) return jsonResponse({ token: 'short-lived-token', expiryDate: '2026-10-16T12:05:00Z' })
      const submitted = JSON.parse(String(init?.body))
      return jsonResponse({ order_tracking_id: 'tracking-1', merchant_reference: submitted.id, redirect_url: 'https://pay.pesapal.com/checkout/1' })
    })
    const provider = createPesapalProvider({ env, fetcher, now: () => now })

    const result = await provider.createHostedSession!(sessionRequest())
    await provider.createHostedSession!({ ...sessionRequest(), merchantReference: 'ys:order-43:attempt-1' })

    expect(result).toEqual({
      redirectUrl: 'https://pay.pesapal.com/checkout/1',
      trackingId: 'tracking-1',
      merchantReference: 'ys:order-42:attempt-1',
    })
    expect(calls.filter((call) => call.url.endsWith('/api/Auth/RequestToken'))).toHaveLength(1)
    const submit = calls.find((call) => call.url.endsWith('/api/Transactions/SubmitOrderRequest'))!
    expect(new Headers(submit.init?.headers).get('authorization')).toBe('Bearer short-lived-token')
    const body = JSON.parse(String(submit.init?.body))
    expect(body).toMatchObject({
      id: 'ys:order-42:attempt-1', currency: 'USD', amount: 7.5,
      callback_url: sessionRequest().callbackUrl,
      cancellation_url: sessionRequest().cancellationUrl,
      notification_id: 'test-ipn-id', redirect_mode: 'PARENT_WINDOW',
      billing_address: { email_address: 'buyer@example.test', phone_number: '+15555550123', country_code: 'US', first_name: 'Taylor', last_name: 'Buyer' },
    })
    expect(body.description.length).toBeLessThanOrEqual(100)
  })

  it('refreshes a token before its 30-second safety window', async () => {
    let now = Date.parse('2026-10-16T12:00:00Z')
    let tokens = 0
    const fetcher = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/Auth/RequestToken')) {
        tokens += 1
        return jsonResponse({ token: `token-${tokens}`, expiryDate: tokens === 1 ? '2026-10-16T12:01:00Z' : '2026-10-16T12:06:00Z' })
      }
      return jsonResponse({ order_tracking_id: 'tracking', redirect_url: 'https://pay.pesapal.com/checkout' })
    })
    const provider = createPesapalProvider({ env, fetcher, now: () => now })
    await provider.createHostedSession!(sessionRequest())
    now += 31_000
    await provider.createHostedSession!(sessionRequest())
    expect(tokens).toBe(2)
  })

  it.each([
    [0, 'invalid'], [1, 'completed'], [2, 'failed'], [3, 'reversed'], [9, 'pending'],
  ] as const)('maps transaction status %s to %s', async (statusCode, status) => {
    const fetcher = jest.fn(async (input: RequestInfo | URL) => String(input).endsWith('/api/Auth/RequestToken')
      ? jsonResponse({ token: 'status-token', expiryDate: '2026-10-16T12:05:00Z' })
      : jsonResponse({
          status_code: statusCode, amount: 7.5, currency: 'USD', merchant_reference: 'ys:order-42:attempt-1',
          confirmation_code: 'confirm-1', payment_method: 'Visa', payment_account: '**** 1111', created_date: '2026-10-16T12:00:00Z',
        }))
    const provider = createPesapalProvider({ env, fetcher })
    const result = await provider.getTransactionStatus!('tracking / id')
    expect(result.status).toBe(status)
    expect(result).toMatchObject({ statusCode, amountCents: 750, currency: 'USD', confirmationCode: 'confirm-1', paymentAccount: '**** 1111' })
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('orderTrackingId=tracking%20%2F%20id')
  })

  it('sends a single async refund request in currency units', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return String(input).endsWith('/api/Auth/RequestToken')
        ? jsonResponse({ token: 'refund-token', expiryDate: '2026-10-16T12:05:00Z' })
        : jsonResponse({ message: 'Refund request received' })
    })
    const provider = createPesapalProvider({ env, fetcher })
    const result = await provider.refund('confirmation-1', 750, { username: 'merchant-user', remarks: 'Requested refund' })
    const refund = calls.find((call) => call.url.endsWith('/api/Transactions/RefundRequest'))!
    expect(JSON.parse(String(refund.init?.body))).toEqual({
      confirmation_code: 'confirmation-1', amount: 7.5, username: 'merchant-user', remarks: 'Requested refund',
    })
    expect(result).toMatchObject({ ok: true, transactionId: 'confirmation-1', status: 'pending' })
  })

  it('surfaces provider errors without exposing credentials', async () => {
    const fetcher = jest.fn(async (input: RequestInfo | URL) => String(input).endsWith('/api/Auth/RequestToken')
      ? jsonResponse({ token: 'error-token', expiryDate: '2026-10-16T12:05:00Z' })
      : jsonResponse({ error: 'payment temporarily unavailable' }, 503))
    const provider = createPesapalProvider({ env, fetcher })
    await expect(provider.createHostedSession!(sessionRequest())).rejects.toThrow('payment temporarily unavailable')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('uses sandbox endpoints and accepts only the cybqa redirect host when sandbox is selected', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      return url.endsWith('/api/Auth/RequestToken')
        ? jsonResponse({ token: 'sandbox-token', expiryDate: '2026-10-16T12:05:00Z' })
        : jsonResponse({ order_tracking_id: 'tracking-sandbox', merchant_reference: sessionRequest().merchantReference, redirect_url: 'https://cybqa.pesapal.com/pesapalv3/checkout/1' })
    })
    const provider = createPesapalProvider({ env: { ...env, PESAPAL_ENV: 'sandbox' }, fetcher })
    const result = await provider.createHostedSession!(sessionRequest())
    expect(result.redirectUrl).toBe('https://cybqa.pesapal.com/pesapalv3/checkout/1')
    expect(calls.map((call) => call.url)).toEqual([
      'https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken',
      'https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest',
    ])
  })

  it('registers GET or POST IPNs and returns the registered IPN list', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetcher = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (url.endsWith('/api/Auth/RequestToken')) return jsonResponse({ token: 'ipn-token' })
      if (url.endsWith('/api/URLSetup/RegisterIPN')) return jsonResponse({ ipn_id: 'registered-ipn' })
      return jsonResponse([{ ipn_id: 'registered-ipn', url: 'https://portal.test/api/webhooks/pesapal/ipn' }])
    })
    const provider = createPesapalProvider({ env, fetcher })
    await expect(provider.registerIpn('https://portal.test/api/webhooks/pesapal/ipn', 'GET')).resolves.toMatchObject({ ipn_id: 'registered-ipn' })
    await expect(provider.registerIpn('https://portal.test/api/webhooks/pesapal/ipn', 'POST')).resolves.toMatchObject({ ipn_id: 'registered-ipn' })
    await expect(provider.getIpnList()).resolves.toEqual([{ ipn_id: 'registered-ipn', url: 'https://portal.test/api/webhooks/pesapal/ipn' }])
    const registerCalls = calls.filter((call) => call.url.endsWith('/api/URLSetup/RegisterIPN'))
    expect(registerCalls.map((call) => JSON.parse(String(call.init?.body)).ipn_notification_type)).toEqual(['GET', 'POST'])
    expect(calls.some((call) => call.url.endsWith('/api/URLSetup/GetIpnList'))).toBe(true)
  })

  it('allows only USD and GBP settlement currencies', async () => {
    const fetcher = jest.fn()
    const provider = createPesapalProvider({ env, fetcher })
    await expect(provider.createHostedSession!({ ...sessionRequest(), currency: 'CAD' })).rejects.toThrow('only settles USD or GBP')
    await expect(provider.createHostedSession!({ ...sessionRequest(), currency: 'AUD' })).rejects.toThrow('only settles USD or GBP')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
