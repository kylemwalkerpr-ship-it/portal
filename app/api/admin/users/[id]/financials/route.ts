/**
 * GET /api/admin/users/[id]/financials
 *
 * Comprehensive per-student financial drill-down for the admin dashboard's
 * Financials -> Users tab. The super-admin clicks any row in the
 * "Student / Client Spending" table and this endpoint returns everything
 * needed to populate the side-drawer: profile, wallet balance, every order
 * (with money fields, escrow state, provider name), refunds extracted
 * from the wallet ledger, lifetime totals, and a tail of order_events.
 *
 * Query params:
 *   order_limit  default 50, max 200   — page size for the orders list
 *   event_limit  default 20, max 50    — number of recent order_events
 *
 * Returns ApiEnvelope `{ data, error, meta }`. Auth: requireAdminUser().
 *
 * Self-heal: this endpoint never 500s on a missing column. If
 * wallet_transactions is missing the optional `metadata` / `reference`
 * columns on an older deploy we retry with `select('*')` and emit a
 * `data_warnings` meta entry pointing at the relevant patch script —
 * same pattern as app/api/admin/escrow/route.ts.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'

type Row = Record<string, any>

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { id } = await context.params
  if (!id) return fail('Missing profile id.', 400)

  const { searchParams } = new URL(req.url)
  const orderLimit = Math.min(200, Math.max(1, Number(searchParams.get('order_limit') || 50)))
  const eventLimit = Math.min(50,  Math.max(1, Number(searchParams.get('event_limit') || 20)))
  const warnings: string[] = []

  // 1. Profile lookup — must exist or 404. Done sequentially so the
  // downstream parallel fan-out has a confirmed target.
  const { data: profile, error: profileErr } = await db
    .from('profiles')
    .select('id, full_name, email, role, status, country, created_at')
    .eq('id', id)
    .single() as any
  if (profileErr || !profile) {
    return fail('Profile not found.', 404, { id })
  }

  // 2. Fan out the rest. Wallet, orders, wallet_transactions (refund-typed
  // + full ledger separately), order_events all run in parallel. Each is
  // wrapped in allSettled so a single failing leg degrades to a warning
  // instead of 500-ing the whole drawer.
  const [
    walletRes,
    ordersRes,
    refundTxRes,
    walletLedgerRes,
  ] = await Promise.allSettled([
    db.from('student_wallets')
      .select('profile_id, balance_cents, currency, updated_at')
      .eq('profile_id', id)
      .maybeSingle(),
    db.from('orders')
      .select(
        'id, order_number, status, escrow_status, total_amount, platform_fee_amount, ' +
        'consultant_payout_amount, escrow_amount, escrow_released_amount, escrow_refunded_amount, ' +
        'client_id, consultant_id, attorney_id, created_at, status_updated_at, updated_at'
      )
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(orderLimit),
    // Refunds tab — wallet_transactions of type=refund. We try with the
    // optional metadata + reference columns first, then degrade.
    db.from('wallet_transactions')
      .select('id, type, amount_cents, signed_cents, balance_after_cents, description, reference, metadata, created_at')
      .eq('profile_id', id)
      .eq('type', 'refund')
      .order('created_at', { ascending: false }),
    // Full wallet activity ledger
    db.from('wallet_transactions')
      .select('id, type, amount_cents, signed_cents, balance_after_cents, description, reference, metadata, created_at')
      .eq('profile_id', id)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  // 2a. Wallet
  let wallet: Row | null = null
  if (walletRes.status === 'fulfilled') {
    const { data, error } = walletRes.value as any
    if (error) warnings.push(`wallet_lookup: ${error.message}`)
    else wallet = data || null
  } else {
    warnings.push('wallet_lookup_unavailable')
  }

  // 2b. Orders
  let orders: Row[] = []
  if (ordersRes.status === 'fulfilled') {
    const { data, error } = ordersRes.value as any
    if (error && /column .* does not exist/i.test(error.message || '')) {
      // Self-heal: retry minimal select.
      warnings.push('orders_schema_partial')
      const retry = await db.from('orders').select('*').eq('client_id', id)
        .order('created_at', { ascending: false }).limit(orderLimit) as any
      orders = retry.data || []
    } else if (error) {
      warnings.push(`orders_lookup: ${error.message}`)
    } else {
      orders = data || []
    }
  } else {
    warnings.push('orders_lookup_unavailable')
  }

  // 2c. Refund wallet_transactions
  let refundTx: Row[] = []
  if (refundTxRes.status === 'fulfilled') {
    const { data, error } = refundTxRes.value as any
    if (error && /column .* does not exist/i.test(error.message || '')) {
      warnings.push('wallet_transactions_schema_partial — run supabase/wallet_nmi.sql')
      const retry = await db.from('wallet_transactions').select('*')
        .eq('profile_id', id).eq('type', 'refund')
        .order('created_at', { ascending: false }) as any
      refundTx = retry.data || []
    } else if (error) {
      warnings.push(`refunds_lookup: ${error.message}`)
    } else {
      refundTx = data || []
    }
  } else {
    warnings.push('refunds_lookup_unavailable')
  }

  // 2d. Full wallet ledger
  let walletLedger: Row[] = []
  if (walletLedgerRes.status === 'fulfilled') {
    const { data, error } = walletLedgerRes.value as any
    if (error && /column .* does not exist/i.test(error.message || '')) {
      warnings.push('wallet_transactions_schema_partial — run supabase/wallet_nmi.sql')
      const retry = await db.from('wallet_transactions').select('*')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(200) as any
      walletLedger = retry.data || []
    } else if (error) {
      warnings.push(`wallet_ledger: ${error.message}`)
    } else {
      walletLedger = data || []
    }
  } else {
    warnings.push('wallet_ledger_unavailable')
  }

  // 3. Hydrate provider names for orders + pull recent events for those
  // orders. Both run in parallel. We collect every distinct provider id
  // (consultant_id OR attorney_id) and join via one IN-query against
  // profiles — strict avoidance of N+1.
  const orderIds = orders.map(o => o.id).filter(Boolean)
  const providerIds = [
    ...new Set([
      ...orders.map(o => o.consultant_id).filter(Boolean),
      ...orders.map(o => o.attorney_id).filter(Boolean),
    ]),
  ]
  // service titles come from order_items -> services. Pull them in one go.
  const [providersRes, itemsRes, eventsRes] = await Promise.allSettled([
    providerIds.length
      ? db.from('profiles').select('id, full_name, email, role').in('id', providerIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? db.from('order_items').select('order_id, service_id')
          .in('order_id', orderIds)
      : Promise.resolve({ data: [] }),
    orderIds.length
      ? db.from('order_events')
          .select('id, order_id, actor_id, actor_role, from_status, to_status, note, created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false })
          .limit(eventLimit)
      : Promise.resolve({ data: [] }),
  ])

  const providerMap: Record<string, Row> = {}
  if (providersRes.status === 'fulfilled') {
    for (const p of (((providersRes.value as any)?.data) || []) as Row[]) providerMap[p.id] = p
  } else { warnings.push('provider_lookup_failed') }

  // Resolve service titles via order_items -> services
  let serviceMap: Record<string, string> = {}
  const itemRows: Row[] = itemsRes.status === 'fulfilled'
    ? (((itemsRes.value as any)?.data) || [])
    : []
  const serviceIds = [...new Set(itemRows.map(r => r.service_id).filter(Boolean))]
  if (serviceIds.length) {
    const svc = await db.from('services').select('id, title').in('id', serviceIds) as any
    if (!svc.error) {
      for (const s of (svc.data || []) as Row[]) serviceMap[s.id] = s.title
    } else {
      warnings.push('service_titles_unavailable')
    }
  }
  const itemByOrder: Record<string, string> = {}
  for (const it of itemRows) {
    if (it.order_id && it.service_id && !itemByOrder[it.order_id]) {
      itemByOrder[it.order_id] = serviceMap[it.service_id] || ''
    }
  }

  const events: Row[] = eventsRes.status === 'fulfilled'
    ? (((eventsRes.value as any)?.data) || [])
    : (warnings.push('events_lookup_unavailable'), [])

  // 4. Shape orders for the UI. Money values come from the orders table
  // as numerics (dollars) — we surface them as dollars, leaving the
  // wallet ledger in cents (it is canonically stored in cents).
  const ordersOut = orders.map(o => {
    const providerId = o.consultant_id || o.attorney_id
    const provider = (providerId && providerMap[providerId]) || {}
    return {
      id: o.id,
      order_number: o.order_number,
      status: o.status,
      escrow_status: o.escrow_status || 'held',
      total_amount: Number(o.total_amount || 0),
      platform_fee_amount: Number(o.platform_fee_amount || 0),
      consultant_payout_amount: Number(o.consultant_payout_amount || 0),
      escrow_amount: Number(o.escrow_amount || 0),
      escrow_released_amount: Number(o.escrow_released_amount || 0),
      escrow_refunded_amount: Number(o.escrow_refunded_amount || 0),
      provider_id: providerId || null,
      provider_name: provider.full_name || provider.email || null,
      provider_role: provider.role || (o.attorney_id ? 'attorney' : (o.consultant_id ? 'consultant' : null)),
      service_title: itemByOrder[o.id] || null,
      created_at: o.created_at,
      status_updated_at: o.status_updated_at,
    }
  })

  // 5. Refund rows — already filtered to type='refund'. We try to surface
  // the linked order id from the row's reference / metadata if present.
  const refundsOut = refundTx.map(r => {
    let orderId: string | null = null
    if (r.metadata && typeof r.metadata === 'object') {
      orderId = (r.metadata.order_id || r.metadata.orderId || null) as string | null
    }
    if (!orderId && typeof r.reference === 'string' && /^order[_:-]/i.test(r.reference)) {
      orderId = r.reference.replace(/^order[_:-]/i, '')
    }
    return {
      id: r.id,
      amount_cents: Number(r.amount_cents || 0),
      signed_cents: Number(r.signed_cents || 0),
      balance_after_cents: Number(r.balance_after_cents || 0),
      description: r.description || '',
      reference: r.reference || null,
      order_id: orderId,
      created_at: r.created_at,
    }
  })

  // 6. Full ledger — preserve cents + signed_cents for accurate UI colouring.
  //     Enrich each entry with display_type for semantic metadata overrides.
  const ledgerOut = walletLedger.map(r => {
    const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as Record<string, unknown>) : {}
    let displayType: string | null = null
    if (r.type === 'topup' && meta.kind === 'manual_credit') displayType = 'manual_credit'
    return {
      id: r.id,
      type: r.type,
      display_type: displayType,
      amount_cents: Number(r.amount_cents || 0),
      signed_cents: Number(r.signed_cents || 0),
      balance_after_cents: Number(r.balance_after_cents || 0),
      description: r.description || '',
      reference: r.reference || null,
      created_at: r.created_at,
    }
  })

  // 7. Lifetime totals. We compute these from the *unbounded* sources where
  // possible — orders is already capped at order_limit (default 50) so the
  // counts are the visible page's counts; the money sums likewise. The
  // wallet topup figure is summed from every topup row in the ledger
  // (capped at 200) so for almost every user it's exact. Document this
  // honestly via the meta block so the UI can warn on edge cases.
  const lifetime_spent_cents       = ordersOut.reduce((s, o) => s + Math.round(Number(o.total_amount || 0) * 100), 0)
  const lifetime_refunded_cents    = refundsOut.reduce((s, r) => s + r.amount_cents, 0)
  const lifetime_wallet_topup_cents = ledgerOut
    .filter(t => t.type === 'topup')
    .reduce((s, t) => s + t.amount_cents, 0)
  const lifetime_manual_credit_cents = ledgerOut
    .filter(t => t.type === 'topup' && t.display_type === 'manual_credit')
    .reduce((s, t) => s + t.amount_cents, 0)
  const open_escrow_cents          = ordersOut
    .filter(o => ['held','partial_released','disputed','frozen'].includes(o.escrow_status))
    .reduce((s, o) => s + Math.round(Number(o.escrow_amount || 0) * 100), 0)
  const pending_refund_cents       = ordersOut
    .filter(o => o.status === 'cancelled' && Number(o.escrow_amount || 0) > 0)
    .reduce((s, o) => s + Math.round(Number(o.escrow_amount || 0) * 100), 0)
  const total_orders     = ordersOut.length
  const completed_orders = ordersOut.filter(o => ['completed','released','paid'].includes(o.status)).length
  const refunded_orders  = ordersOut.filter(o => ['refunded','cancelled'].includes(o.status)).length

  const totals = {
    lifetime_spent_cents,
    lifetime_refunded_cents,
    lifetime_wallet_topup_cents,
    lifetime_manual_credit_cents,
    current_wallet_balance_cents: Number(wallet?.balance_cents || 0),
    open_escrow_cents,
    pending_refund_cents,
    total_orders,
    completed_orders,
    refunded_orders,
  }

  return ok(
    {
      profile: {
        id: profile.id,
        full_name: profile.full_name || null,
        email: profile.email || null,
        role: profile.role || null,
        status: profile.status || null,
        country: profile.country || null,
        created_at: profile.created_at || null,
      },
      wallet: wallet
        ? {
            balance_cents: Number(wallet.balance_cents || 0),
            currency: wallet.currency || 'usd',
            updated_at: wallet.updated_at || null,
          }
        : { balance_cents: 0, currency: 'usd', updated_at: null },
      orders: ordersOut,
      refunds: refundsOut,
      wallet_ledger: ledgerOut,
      totals,
      recent_events: events,
    },
    {},
    {
      order_limit: orderLimit,
      event_limit: eventLimit,
      ...(warnings.length ? { data_warnings: warnings } : {}),
    },
  )
}
