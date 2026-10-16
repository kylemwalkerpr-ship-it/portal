const base = 'https://cybqa.pesapal.com/pesapalv3'
const key = process.env.PESAPAL_SANDBOX_CONSUMER_KEY
const secret = process.env.PESAPAL_SANDBOX_CONSUMER_SECRET
const ipnUrl = process.env.PESAPAL_SANDBOX_IPN_URL
if (!key || !secret || !ipnUrl) throw new Error('Set sandbox consumer credentials and PESAPAL_SANDBOX_IPN_URL.')

async function api(path, token, body) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.message || payload.error || `Pesapal request failed (${response.status}).`)
  return payload
}

const auth = await api('/api/Auth/RequestToken', null, { consumer_key: key, consumer_secret: secret })
const token = auth.token
if (typeof token !== 'string' || !token) throw new Error('Pesapal did not return an access token.')
const ipn = await api('/api/URLSetup/RegisterIPN', token, { url: new URL(ipnUrl).toString(), ipn_notification_type: 'GET' })
const notificationId = ipn.ipn_id || ipn.ipnId
if (!notificationId) throw new Error('Pesapal IPN registration did not return an id.')
const merchantReference = `ys:wallet_topup:${crypto.randomUUID().replaceAll('-', '')}`
const session = await api('/api/Transactions/SubmitOrderRequest', token, {
  id: merchantReference, currency: 'USD', amount: 5, description: 'YouSafe sandbox wallet top-up',
  callback_url: ipnUrl, notification_id: notificationId,
  billing_address: { email_address: 'sandbox@example.com', first_name: 'Sandbox', last_name: 'Student' },
})
const trackingId = session.order_tracking_id
if (!trackingId || !session.redirect_url) throw new Error('Pesapal did not return a hosted checkout session.')
console.log(`redirect_url: ${session.redirect_url}`)
console.log(`order_tracking_id: ${trackingId}`)
const status = await api(`/api/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(trackingId)}`, token)
const mappedStatus = Number(status.status_code) === 1 ? 'completed' : Number(status.status_code) === 2 ? 'failed' : Number(status.status_code) === 3 ? 'reversed' : Number(status.status_code) === 0 && status.error?.code === 'payment_details_not_found' ? 'pending' : 'pending'
console.log(`mapped_status: ${mappedStatus}`)
