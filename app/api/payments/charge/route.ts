import { NextRequest } from 'next/server'
import { getPaymentProvider } from '@/lib/payments'
import { TEMPLATE_PACKS, getTemplatePack } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'

/**
 * POST /api/payments/charge
 *
 * Charges a tokenized payment for template-pack purchases.
 * - Validates every slug against the authoritative catalogue
 * - Resolves prices server-side (never trusts client-supplied amounts)
 * - Calls getPaymentProvider().charge() — the ONLY payment surface
 * - Persists a template_orders record on success
 */

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const itemsRaw = Array.isArray(body.items) ? body.items : []
  const customer = body.customer as { email?: string; name?: string } | undefined

  if (!token) {
    return Response.json({ ok: false, message: 'Missing payment token' }, { status: 400 })
  }
  if (!customer?.email) {
    return Response.json({ ok: false, message: 'Missing customer email' }, { status: 400 })
  }
  if (itemsRaw.length === 0) {
    return Response.json({ ok: false, message: 'Cart is empty' }, { status: 400 })
  }

  // Validate slugs and resolve prices server-side
  const lineItems: { slug: string; name: string; unitAmountCents: number; quantity: number }[] = []
  let amountCents = 0

  for (const raw of itemsRaw) {
    const slug = typeof raw === 'object' && raw !== null ? String((raw as any).slug) : ''
    const quantity = typeof raw === 'object' && raw !== null ? Math.max(1, Math.floor(Number((raw as any).quantity) || 1)) : 1

    if (!slug) {
      return Response.json({ ok: false, message: 'Invalid cart item' }, { status: 400 })
    }

    const pack = getTemplatePack(slug)
    if (!pack) {
      return Response.json({ ok: false, message: `Unknown product: ${slug}` }, { status: 400 })
    }

    const unitAmountCents = Math.round(pack.price_usd * 100)
    lineItems.push({ slug, name: pack.name, unitAmountCents, quantity })
    amountCents += unitAmountCents * quantity
  }

  if (amountCents <= 0) {
    return Response.json({ ok: false, message: 'Invalid order total' }, { status: 400 })
  }

  // Generate order id before charging so we can include it in metadata
  const orderId = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  // Charge through the abstraction — the ONLY payment call
  const provider = getPaymentProvider()
  const result = await provider.charge({
    token,
    amountCents,
    currency: 'USD',
    items: lineItems.map((i) => ({
      sku: i.slug,
      name: i.name,
      unitAmountCents: i.unitAmountCents,
      quantity: i.quantity,
    })),
    customer: { email: customer.email, name: customer.name },
    metadata: { orderId },
  })

  if (result.status === 'paid' && result.ok) {
    // Persist order record
    try {
      const db = createSupabaseAdminClient()
      await db.from('template_orders').insert({
        id: orderId,
        email: customer.email,
        name: customer.name || null,
        slugs: lineItems.map((i) => i.slug),
        amount_cents: amountCents,
        transaction_id: result.transactionId,
        status: 'paid',
      })
    } catch (persistErr) {
      // Log but do not fail the charge — the payment succeeded
      console.error('Failed to persist template_order:', persistErr)
    }

    return Response.json({
      ok: true,
      orderId,
      status: result.status,
      transactionId: result.transactionId,
    })
  }

  // Declined or error
  return Response.json(
    {
      ok: false,
      status: result.status,
      message: result.message || 'Payment could not be processed',
    },
    { status: 402 }
  )
}
