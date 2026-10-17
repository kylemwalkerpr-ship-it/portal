import { createPesapalProvider } from '@/lib/payments/providers/pesapal'

export async function GET(request: Request) {
  const url = new URL(request.url)
  if (
    process.env.NODE_ENV === 'production' ||
    url.hostname !== 'localhost' ||
    String(process.env.PESAPAL_ENV || '').trim().toLowerCase() !== 'sandbox' ||
    !process.env.PESAPAL_CONSUMER_KEY ||
    !process.env.PESAPAL_CONSUMER_SECRET
  ) {
    return new Response(null, { status: 404 })
  }
  const trackingId = url.searchParams.get('trackingId')?.trim() || ''
  if (!trackingId || trackingId.length > 128) {
    return Response.json({ error: { message: 'A sandbox tracking ID is required.' } }, { status: 400 })
  }

  try {
    const status = await createPesapalProvider().getTransactionStatus(trackingId)
    return Response.json({ status: status.status }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: { message: 'PesaPal sandbox status is unavailable.' } }, { status: 502 })
  }
}
