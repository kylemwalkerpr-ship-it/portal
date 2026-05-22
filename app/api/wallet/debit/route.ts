/**
 * POST /api/wallet/debit
 * Purchase catalogue items by debiting wallet balance.
 *
 * Body:
 *   { items: [{ slug?, serviceId?, quantity }], saveToAccount?: boolean }
 *
 * Server resolves prices from authoritative sources (template catalogue or
 * services table). Never trusts client-supplied prices.
 * On success: debits wallet, writes ledger row, inserts order records.
 */
import { getCurrentStudent } from '@/lib/student'
import { debit, getOrCreateWallet } from '@/lib/wallet'
import { getTemplatePack, getTemplatePackPriceCents } from '@/lib/template-packs'
import { createSupabaseAdminClient } from '@/lib/supabase'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const rawItems = Array.isArray(body.items) ? body.items : []
  if (rawItems.length === 0) {
    return Response.json({ error: 'Cart is empty' }, { status: 400 })
  }

  // Resolve and validate every item server-side
  const db = createSupabaseAdminClient()
  let totalCents = 0
  const templateItems: { slug: string; name: string; quantity: number; unitCents: number }[] = []
  const serviceItems: { serviceId: string; name: string; quantity: number; unitCents: number }[] = []
  const deferredServiceIds: string[] = []

  for (const raw of rawItems) {
    const qty = Math.max(1, Math.floor(Number(raw?.quantity) || 1))

    // Try template pack first
    const slug = typeof raw?.slug === 'string' ? raw.slug : ''
    if (slug) {
      const pack = getTemplatePack(slug)
      if (pack) {
        const unitCents = getTemplatePackPriceCents(slug)
        totalCents += unitCents * qty
        templateItems.push({ slug, name: pack.name, quantity: qty, unitCents })
        continue
      }
    }

    // Try service
    const serviceId = typeof raw?.serviceId === 'string' ? raw.serviceId : ''
    if (serviceId) {
      deferredServiceIds.push(serviceId)
      serviceItems.push({ serviceId, name: '', quantity: qty, unitCents: 0 })
      continue
    }

    return Response.json({ error: 'Invalid cart item: missing slug or serviceId' }, { status: 400 })
  }

  // Batch-resolve deferred services
  if (deferredServiceIds.length > 0) {
    const { data: services, error: svcErr } = await db
      .from('services')
      .select('id, title, price, usd_price')
      .in('id', deferredServiceIds)
      .eq('is_active', true)

    if (svcErr) {
      return Response.json({ error: `Service lookup failed: ${svcErr.message}` }, { status: 500 })
    }

    const serviceMap = new Map((services ?? []).map((s: any) => [s.id, s]))

    for (const item of serviceItems) {
      const svc = serviceMap.get(item.serviceId)
      if (!svc) {
        return Response.json({ error: `Unknown or inactive service: ${item.serviceId}` }, { status: 400 })
      }
      const priceUsd = Number(svc.usd_price ?? svc.price ?? 0)
      item.name = svc.title
      item.unitCents = Math.round(priceUsd * 100)
      totalCents += item.unitCents * item.quantity
    }
  }

  if (totalCents <= 0) {
    return Response.json({ error: 'Total must be greater than zero' }, { status: 400 })
  }

  const profile = auth.profile

  try {
    // Ensure wallet exists and check balance
    const wallet = await getOrCreateWallet(profile.id)
    if (wallet.balance_cents < totalCents) {
      return Response.json(
        {
          error: 'Insufficient wallet balance',
          balanceCents: wallet.balance_cents,
          requiredCents: totalCents,
        },
        { status: 402 }
      )
    }

    // Debit wallet atomically
    const allNames = [
      ...templateItems.map((v) => v.name),
      ...serviceItems.map((v) => v.name),
    ]
    const tx = await debit(
      profile.id,
      totalCents,
      `Purchase: ${allNames.join(', ')}`,
      undefined,
      {
        slugs: templateItems.map((v) => v.slug),
        serviceIds: serviceItems.map((v) => v.serviceId),
        templateItems,
        serviceItems,
      }
    )

    // Record template orders
    if (templateItems.length > 0) {
      const { error: tplErr } = await db.from('template_orders').insert({
        id: randomUUID(),
        email: profile.email || '',
        name: profile.full_name || '',
        slugs: templateItems.map((v) => v.slug),
        amount_cents: templateItems.reduce((sum, i) => sum + i.unitCents * i.quantity, 0),
        status: 'paid',
        transaction_id: tx.id,
      })
      if (tplErr) {
        console.error('[wallet/debit] template_orders insert failed:', tplErr)
      }
    }

    // Record service orders
    if (serviceItems.length > 0) {
      const orderId = `svc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const { error: orderErr } = await db.from('orders').insert({
        id: orderId,
        client_id: profile.id,
        status: 'pending',
        total_cents: serviceItems.reduce((sum, i) => sum + i.unitCents * i.quantity, 0),
        currency: 'usd',
        payment_method: 'wallet',
        transaction_id: tx.id,
        created_at: new Date().toISOString(),
      })
      if (orderErr) {
        console.error('[wallet/debit] orders insert failed:', orderErr)
      } else {
        const orderItemRows = serviceItems.map((i) => ({
          order_id: orderId,
          service_id: i.serviceId,
          quantity: i.quantity,
          unit_price: i.unitCents,
        }))
        const { error: itemsErr } = await db.from('order_items').insert(orderItemRows)
        if (itemsErr) {
          console.error('[wallet/debit] order_items insert failed:', itemsErr)
        }
      }
    }

    return Response.json({
      ok: true,
      orderId: randomUUID(),
      status: 'paid',
      totalCents,
      balanceCents: tx.balance_after_cents,
      ledgerId: tx.id,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Debit failed'
    console.error('[wallet/debit]', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
