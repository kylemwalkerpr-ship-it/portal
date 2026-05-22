/**
 * POST /api/wallet/debit
 * Purchase template packs by debiting wallet balance.
 *
 * Body:
 *   { items: [{ slug, quantity }], saveToAccount?: boolean }
 *
 * Server resolves prices from catalogue (trusts nothing from client).
 * On success: debits wallet, writes ledger row, inserts template_orders.
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
  let totalCents = 0
  const validated: { slug: string; name: string; quantity: number; unitCents: number }[] = []

  for (const raw of rawItems) {
    const slug = typeof raw?.slug === 'string' ? raw.slug : ''
    const qty = Math.max(1, Math.floor(Number(raw?.quantity) || 1))
    const pack = getTemplatePack(slug)
    if (!pack) {
      return Response.json({ error: `Unknown product: ${slug}` }, { status: 400 })
    }
    const unitCents = getTemplatePackPriceCents(slug)
    totalCents += unitCents * qty
    validated.push({ slug, name: pack.name, quantity: qty, unitCents })
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
    const slugs = validated.map(v => v.slug)
    const tx = await debit(
      profile.id,
      totalCents,
      `Purchase: ${validated.map(v => v.name).join(', ')}`,
      undefined,
      { slugs, items: validated }
    )

    // Record the order
    const orderId = randomUUID()
    const db = createSupabaseAdminClient()
    const { error: orderErr } = await db.from('template_orders').insert({
      id: orderId,
      email: profile.email || '',
      name: profile.full_name || '',
      slugs,
      amount_cents: totalCents,
      status: 'paid',
      transaction_id: tx.id,
    })

    if (orderErr) {
      console.error('[wallet/debit] template_orders insert failed:', orderErr)
      // We already debited the wallet. Log loudly but don't roll back —
      // the student paid and should receive their goods. Ops can reconcile.
    }

    return Response.json({
      ok: true,
      orderId,
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
