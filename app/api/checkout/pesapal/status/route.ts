import { createSupabaseAdminClient } from '@/lib/supabase'
import { getPaymentProvider } from '@/lib/payments'
import { reconcilePesapalPayment } from '@/lib/payments/pesapalReconciliation'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const trackingId = params.get('OrderTrackingId') || ''
  const merchantReference = params.get('OrderMerchantReference') || ''
  const provider = getPaymentProvider('pesapal')
  if (!provider.getTransactionStatus) {
    return Response.json({ status: 'pending', confirmed: false, message: 'Pesapal status checking is unavailable.' }, { status: 503 })
  }

  const result = await reconcilePesapalPayment({
    db: createSupabaseAdminClient(),
    provider: provider as typeof provider & Required<Pick<typeof provider, 'getTransactionStatus'>>,
    trackingId,
    merchantReference,
  })
  return Response.json({
    status: result.status,
    confirmed: result.confirmed,
    message: result.message,
    ...(result.orderId ? { orderId: result.orderId } : {}),
    ...(result.noOp ? { noOp: true } : {}),
  }, { status: result.httpStatus, headers: { 'cache-control': 'no-store' } })
}
