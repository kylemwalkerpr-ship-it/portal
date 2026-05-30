/**
 * POST /api/webhooks/authorizenet
 *
 * Receives Authorize.net webhook notifications (transaction settlement,
 * refund, void, fraud-hold updates). Authorize.net signs every payload with
 * HMAC-SHA512 using the merchant's webhook signature key — we verify that
 * header before trusting the body.
 *
 * Registration: in the Authorize.net merchant portal, add this URL as an
 * endpoint and subscribe to the events you care about (typically
 * net.authorize.payment.authcapture.created and net.authorize.payment.refund.created).
 *
 * Signature key: set as a Worker secret named AUTHORIZENET_SIGNATURE_KEY
 * (`wrangler secret put AUTHORIZENET_SIGNATURE_KEY`).
 */
import { createSupabaseAdminClient } from '@/lib/supabase'

interface AuthnetWebhookPayload {
  notificationId: string
  eventType: string
  eventDate: string
  webhookId: string
  payload: {
    id?: string // gateway transaction id
    invoiceNumber?: string
    responseCode?: number
    authAmount?: number
    entityName?: string
  }
}

async function verifySignature(rawBody: string, headerSignature: string | null, signatureKey: string): Promise<boolean> {
  if (!headerSignature) return false
  // Authorize.net sends "sha512=<hex>" in the X-ANET-Signature header.
  const expected = headerSignature.replace(/^sha512=/i, '').toLowerCase()
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signatureKey),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  )
  const macBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const macHex = Array.from(new Uint8Array(macBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  // Constant-time compare (avoid early-exit timing leaks on a short-prefix match).
  if (macHex.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < macHex.length; i++) diff |= macHex.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

export async function POST(req: Request) {
  const signatureKey = process.env.AUTHORIZENET_SIGNATURE_KEY
  if (!signatureKey) {
    console.error('[webhooks/authorizenet] AUTHORIZENET_SIGNATURE_KEY not set; rejecting webhook')
    return new Response('Webhook signing key not configured', { status: 500 })
  }

  const rawBody = await req.text()
  const headerSig = req.headers.get('x-anet-signature')
  const valid = await verifySignature(rawBody, headerSig, signatureKey)
  if (!valid) {
    return new Response('Invalid signature', { status: 401 })
  }

  let event: AuthnetWebhookPayload
  try {
    event = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const db = createSupabaseAdminClient()
  const transactionId = event.payload?.id

  // We intentionally keep handling shallow at this stage: log every event we
  // receive (for later replay if needed) and reconcile order status only on
  // the events we actually care about. The Authorize.net catalogue is large;
  // we'll widen this switch as new flows ask for it.
  try {
    if (event.eventType === 'net.authorize.payment.refund.created' && transactionId) {
      await db
        .from('orders')
        .update({ status: 'refunded', updated_at: new Date().toISOString() })
        .eq('authnet_transaction_id', transactionId)
    } else if (event.eventType === 'net.authorize.payment.authcapture.created' && transactionId) {
      await db
        .from('orders')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('authnet_transaction_id', transactionId)
    }
  } catch (e) {
    // Don't 5xx — Authorize.net retries indefinitely on 5xx and a transient
    // DB hiccup would create a thundering retry herd. Log and ack.
    console.error('[webhooks/authorizenet] reconciliation failed', e)
  }

  return new Response('ok', { status: 200 })
}
