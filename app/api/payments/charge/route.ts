import { NextRequest } from 'next/server'
import { getDefaultGatewayId, getPaymentProvider } from '@/lib/payments'
import { TEMPLATE_PACKS, getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { requirePortalUser } from '@/lib/portalAuth'
import { randomUUID } from 'crypto'

/**
 * POST /api/payments/charge
 *
 * Charges a payment for catalogue items (templates or services).
 * Supports:
 *   - New card: { token, items, customer }
 *   - Saved card: { paymentMethodId, items, customer }
 *
 * Validates every item against authoritative sources server-side.
 * Never trusts client-supplied prices.
 */

interface ChargeBody {
  token?: string
  paymentMethodId?: string
  /** Gateway the client tokenized against. For new-card charges we must
   *  charge through the SAME gateway that produced the token — Accept.js
   *  tokens won't work on NMI and vice versa. Saved-card charges ignore this
   *  and use the gateway pinned on the stored payment method. */
  gateway?: string
  items: Array<{ slug?: string; serviceId?: string; quantity?: number }>
  customer?: { email?: string; name?: string }
  saveCard?: boolean
  brand?: string
  last4?: string
  exp_month?: number
  exp_year?: number
}

export async function POST(request: NextRequest) {
  const auth = await requirePortalUser()
  if ('error' in auth) {
    return Response.json({ ok: false, message: auth.error }, { status: auth.status })
  }
  if (auth.role !== 'client') {
    return Response.json({ ok: false, message: 'Only students can charge' }, { status: 403 })
  }

  let body: ChargeBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  const itemsRaw = Array.isArray(body.items) ? body.items : []
  if (itemsRaw.length === 0) {
    return Response.json({ ok: false, message: 'Cart is empty' }, { status: 400 })
  }

  // ── Resolve items server-side ─────────────────────────────────────────────
  const db = createSupabaseAdminClient()
  const lineItems: { slug?: string; serviceId?: string; name: string; unitAmountCents: number; quantity: number; type: 'template' | 'service' }[] = []
  let amountCents = 0
  const serviceIds: string[] = []

  for (const raw of itemsRaw) {
    const quantity = Math.max(1, Math.floor(Number(raw?.quantity) || 1))

    // Try template pack first
    const slug = typeof raw?.slug === 'string' ? raw.slug : ''
    if (slug) {
      const pack = getTemplatePack(slug)
      if (pack) {
        const unitAmountCents = getTemplatePackPriceCents(slug)
        lineItems.push({ slug, name: pack.name, unitAmountCents, quantity, type: 'template' })
        amountCents += unitAmountCents * quantity
        continue
      }
    }

    // Try service
    const serviceId = typeof raw?.serviceId === 'string' ? raw.serviceId : ''
    if (serviceId) {
      serviceIds.push(serviceId)
      // Defer resolution to batch query
      lineItems.push({ serviceId, name: '', unitAmountCents: 0, quantity, type: 'service' })
      continue
    }

    return Response.json({ ok: false, message: 'Invalid cart item: missing slug or serviceId' }, { status: 400 })
  }

  // Batch-resolve services
  if (serviceIds.length > 0) {
    const { data: services, error: svcErr } = await db
      .from('services')
      .select('id, title, price, usd_price, currency')
      .in('id', serviceIds)
      .eq('is_active', true)

    if (svcErr) {
      return Response.json({ ok: false, message: `Service lookup failed: ${svcErr.message}` }, { status: 500 })
    }

    const serviceMap = new Map((services ?? []).map((s: any) => [s.id, s]))

    for (const item of lineItems) {
      if (item.type !== 'service' || !item.serviceId) continue
      const svc = serviceMap.get(item.serviceId)
      if (!svc) {
        return Response.json({ ok: false, message: `Unknown or inactive service: ${item.serviceId}` }, { status: 400 })
      }
      const priceUsd = Number(svc.usd_price ?? svc.price ?? 0)
      item.name = svc.title
      item.unitAmountCents = Math.round(priceUsd * 100)
      amountCents += item.unitAmountCents * item.quantity
    }
  }

  if (amountCents <= 0) {
    return Response.json({ ok: false, message: 'Invalid order total' }, { status: 400 })
  }

  const profile = auth.profile
  const customer = {
    id: profile.id,
    email: body.customer?.email || profile.email || '',
    name: body.customer?.name || profile.full_name || '',
  }

  // ── Charge ────────────────────────────────────────────────────────────────
  // Gateway dispatch:
  //   - Saved card: use the gateway pinned on the stored card (vault tokens
  //     are not portable across gateways).
  //   - New card: use the gateway the client tokenized against, falling back
  //     to the platform default.
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  let chargeGateway = (body.gateway || getDefaultGatewayId()).toLowerCase()

  let result
  try {
    if (typeof body.paymentMethodId === 'string' && body.paymentMethodId) {
      // Saved card path
      const { data: cardRow, error: cardErr } = await db
        .from('student_payment_methods')
        .select('vault_id, gateway')
        .eq('id', body.paymentMethodId)
        .eq('profile_id', profile.id)
        .single()

      if (cardErr || !cardRow) {
        return Response.json({ ok: false, message: 'Card not found' }, { status: 404 })
      }

      chargeGateway = (cardRow.gateway || chargeGateway).toLowerCase()
      const provider = getPaymentProvider(chargeGateway)
      result = await provider.chargeVaulted({
        vaultId: cardRow.vault_id,
        amountCents,
        currency: 'usd',
        customer,
        metadata: { orderId, profile_id: profile.id, source: 'catalogue_checkout' },
      })
    } else if (typeof body.token === 'string' && body.token) {
      // New card token path
      const provider = getPaymentProvider(chargeGateway)
      result = await provider.charge({
        token: body.token,
        amountCents,
        currency: 'USD',
        items: lineItems.map((i) => ({
          sku: i.slug || i.serviceId || '',
          name: i.name,
          unitAmountCents: i.unitAmountCents,
          quantity: i.quantity,
        })),
        customer: { email: customer.email, name: customer.name },
        metadata: { orderId, profile_id: profile.id, source: 'catalogue_checkout' },
      })
    } else {
      return Response.json({ ok: false, message: 'Provide either paymentMethodId (saved card) or token (new card)' }, { status: 400 })
    }
  } catch (chargeErr: any) {
    console.error('[payments/charge] charge failed:', chargeErr)
    return Response.json({ ok: false, message: chargeErr.message || 'Payment processing failed' }, { status: 500 })
  }

  if (result.status !== 'paid' || !result.ok) {
    return Response.json(
      { ok: false, status: result.status, message: result.message || 'Payment could not be processed' },
      { status: 402 }
    )
  }

  // ── Persist orders ─────────────────────────────────────────────────────────
  try {
    const templateItems = lineItems.filter((i) => i.type === 'template')
    const serviceItems = lineItems.filter((i) => i.type === 'service')

    if (templateItems.length > 0) {
      await db.from('template_orders').insert({
        id: orderId,
        email: customer.email,
        name: customer.name || null,
        slugs: templateItems.map((i) => i.slug!),
        amount_cents: templateItems.reduce((sum, i) => sum + i.unitAmountCents * i.quantity, 0),
        transaction_id: result.transactionId,
        gateway: chargeGateway,
        status: 'paid',
      })
    }

    if (serviceItems.length > 0) {
      // Create parent order
      const serviceOrderId = `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const { error: orderErr } = await db.from('orders').insert({
        id: serviceOrderId,
        client_id: profile.id,
        status: 'pending',
        total_cents: serviceItems.reduce((sum, i) => sum + i.unitAmountCents * i.quantity, 0),
        currency: 'usd',
        payment_method: 'card',
        transaction_id: result.transactionId,
        gateway: chargeGateway,
        created_at: new Date().toISOString(),
      })
      if (orderErr) {
        console.error('[payments/charge] orders insert failed:', orderErr)
      } else {
        const orderItems = serviceItems.map((i) => ({
          order_id: serviceOrderId,
          service_id: i.serviceId,
          quantity: i.quantity,
          unit_price: i.unitAmountCents,
        }))
        const { error: itemsErr } = await db.from('order_items').insert(orderItems)
        if (itemsErr) {
          console.error('[payments/charge] order_items insert failed:', itemsErr)
        }
      }
    }
  } catch (persistErr) {
    console.error('Failed to persist order:', persistErr)
  }

  return Response.json({
    ok: true,
    orderId,
    status: result.status,
    transactionId: result.transactionId,
  })
}
