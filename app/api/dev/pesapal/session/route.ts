import { randomUUID } from 'crypto'
import { createPesapalProvider } from '@/lib/payments/providers/pesapal'

function sandboxReady(request: Request) {
  const url = new URL(request.url)
  return process.env.NODE_ENV !== 'production'
    && url.hostname === 'localhost'
    && String(process.env.PESAPAL_ENV || '').trim().toLowerCase() === 'sandbox'
    && Boolean(process.env.PESAPAL_CONSUMER_KEY && process.env.PESAPAL_CONSUMER_SECRET)
}

export async function POST(request: Request) {
  if (!sandboxReady(request)) return new Response(null, { status: 404 })
  const url = new URL(request.url)
  if (request.headers.get('origin') !== url.origin) {
    return Response.json({ error: { message: 'Use the local checkout preview to start a sandbox session.' } }, { status: 403 })
  }
  if (!process.env.PESAPAL_IPN_ID) {
    return Response.json({ error: { message: 'A public sandbox IPN callback must be registered first.' } }, { status: 503 })
  }

  const body: unknown = await request.json().catch(() => null)
  const email = body && typeof body === 'object' && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).email === 'string'
    ? String((body as Record<string, unknown>).email).trim()
    : ''
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: { message: 'Enter a valid test email address.' } }, { status: 400 })
  }

  try {
    const provider = createPesapalProvider()
    const callbackUrl = new URL('/dev/market-checkout-preview?pesapalTest=return&sandbox=1', url.origin).toString()
    const cancellationUrl = new URL('/dev/market-checkout-preview?pesapalTest=cancelled&sandbox=1', url.origin).toString()
    const session = await provider.createHostedSession({
      merchantReference: `dev-${randomUUID().replace(/-/g, '')}`,
      amountCents: 17_500,
      currency: 'USD',
      description: 'YouSafe local sandbox checkout test',
      callbackUrl,
      cancellationUrl,
      notificationId: process.env.PESAPAL_IPN_ID,
      customer: { email, countryCode: 'KE' },
      redirectMode: 'PARENT_WINDOW',
    })
    return Response.json({ redirectUrl: session.redirectUrl, orderTrackingId: session.trackingId }, {
      status: 201,
      headers: { 'cache-control': 'no-store' },
    })
  } catch {
    return Response.json({ error: { message: 'PesaPal sandbox could not start checkout.' } }, { status: 502 })
  }
}
