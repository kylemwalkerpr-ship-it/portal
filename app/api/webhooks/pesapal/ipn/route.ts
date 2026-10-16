import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'
import { reconcilePesapalPayment } from '@/lib/payments/pesapalReconciliation'

export const dynamic = 'force-dynamic'

type Notification = { trackingId: string; merchantReference: string; notificationType: string }

function fromRecord(value: Record<string, unknown>): Notification {
  return {
    trackingId: String(value.OrderTrackingId || value.orderTrackingId || ''),
    merchantReference: String(value.OrderMerchantReference || value.orderMerchantReference || ''),
    notificationType: String(value.OrderNotificationType || value.orderNotificationType || ''),
  }
}

async function readNotification(request: Request): Promise<Notification> {
  const params = new URL(request.url).searchParams
  const query = fromRecord(Object.fromEntries(params.entries()))
  if (request.method === 'GET') return query

  const contentType = request.headers.get('content-type')?.toLowerCase() || ''
  let body: Record<string, unknown> = {}
  if (contentType.includes('application/json')) {
    const parsed = await request.json().catch(() => ({}))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    body = Object.fromEntries((await request.formData()).entries())
  } else {
    const raw = await request.text()
    body = Object.fromEntries(new URLSearchParams(raw).entries())
  }
  const parsed = fromRecord(body)
  return {
    trackingId: parsed.trackingId || query.trackingId,
    merchantReference: parsed.merchantReference || query.merchantReference,
    notificationType: parsed.notificationType || query.notificationType,
  }
}

async function handle(request: Request) {
  const notification = await readNotification(request)
  if (!notification.trackingId || !notification.merchantReference || !notification.notificationType) {
    return Response.json({ error: 'Incomplete Pesapal IPN notification.' }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }

  const provider = getPaymentProvider('pesapal')
  if (!provider.getTransactionStatus) {
    return Response.json({ error: 'Pesapal status checking is unavailable.' }, { status: 503, headers: { 'cache-control': 'no-store' } })
  }
  const result = await reconcilePesapalPayment({
    db: createSupabaseAdminClient(),
    provider: provider as typeof provider & Required<Pick<typeof provider, 'getTransactionStatus'>>,
    trackingId: notification.trackingId,
    merchantReference: notification.merchantReference,
  })
  if (result.httpStatus !== 200) {
    return Response.json({ error: result.message, confirmed: false }, { status: result.httpStatus, headers: { 'cache-control': 'no-store' } })
  }
  return Response.json({
    orderNotificationType: notification.notificationType,
    orderTrackingId: notification.trackingId,
    orderMerchantReference: notification.merchantReference,
    status: 200,
  }, { status: 200, headers: { 'cache-control': 'no-store' } })
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
