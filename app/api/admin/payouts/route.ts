/**
 * GET /api/admin/payouts
 * Master payout queue — all orders grouped by payout lifecycle stage.
 * Returns enriched rows with provider, Connect status, and amounts.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { searchParams } = new URL(req.url)
  const statusFilter   = searchParams.get('status')   // pending | transferred | failed | all
  const providerFilter = searchParams.get('provider_id')
  const limit          = Math.min(200, Number(searchParams.get('limit') || 100))

  let query = auth.db
    .from('orders')
    .select(
      'id, status, escrow_status, payout_status, stripe_transfer_id, ' +
      'total_amount, platform_fee_amount, consultant_payout_amount, ' +
      'created_at, updated_at, cancelled_at, ' +
      'consultant_id, client_id'
    )
    .not('consultant_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(limit)

  // Filter by payout status
  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('payout_status', statusFilter)
  }
  if (providerFilter) {
    query = query.eq('consultant_id', providerFilter)
  }

  const { data: ordersRaw, error } = await query
  if (error) return fail(error.message, 500)

  const orders: any[] = ordersRaw ?? []
  if (!orders.length) {
    return ok({ orders: [], summary: { pending: 0, transferred: 0, failed: 0, total_pending_cents: 0, total_transferred_cents: 0 } })
  }

  // Fetch provider profiles
  const providerIds = [...new Set(orders.map((o: any) => o.consultant_id).filter(Boolean))]
  const { data: profiles } = await auth.db
    .from('profiles')
    .select('id, full_name, email, role')
    .in('id', providerIds)
  const profileMap: Record<string, any> = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  // Fetch Stripe Connect status (consultants table)
  const { data: consultants } = await auth.db
    .from('consultants')
    .select('profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass')
    .in('profile_id', providerIds)
  const connectMap: Record<string, any> = {}
  for (const c of consultants ?? []) connectMap[c.profile_id] = c

  // Also check attorneys table
  const { data: attorneys } = await auth.db
    .from('attorneys')
    .select('profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass')
    .in('profile_id', providerIds)
  for (const a of attorneys ?? []) {
    if (!connectMap[a.profile_id]) connectMap[a.profile_id] = a
  }

  const enriched = orders.map(o => {
    const profile = profileMap[o.consultant_id] || null
    const connect = connectMap[o.consultant_id] || null
    const gross   = Number(o.total_amount) || 0
    const fee     = Number(o.platform_fee_amount) || 0
    const payout  = Number(o.consultant_payout_amount) || gross - fee

    return {
      id:            o.id,
      status:        o.status,
      escrow_status: o.escrow_status,
      payout_status: o.payout_status || 'pending',
      stripe_transfer_id: o.stripe_transfer_id,
      gross_cents:   Math.round(gross * 100),
      fee_cents:     Math.round(fee * 100),
      payout_cents:  Math.round(payout * 100),
      gross:         gross,
      fee:           fee,
      payout:        payout,
      created_at:    o.created_at,
      updated_at:    o.updated_at,
      provider_id:   o.consultant_id,
      provider_name: profile?.full_name || profile?.email || '—',
      provider_email: profile?.email || '—',
      provider_role: profile?.role || 'consultant',
      connect_ready: Boolean(connect?.stripe_onboarding_complete || connect?.stripe_bypass),
      stripe_account: connect?.stripe_account_id || null,
      bypass_active:  Boolean(connect?.stripe_bypass),
      days_waiting:  o.updated_at
        ? Math.floor((Date.now() - new Date(o.updated_at).getTime()) / 86400000)
        : 0,
    }
  })

  // Summary counts
  const summary = {
    pending:              enriched.filter(o => o.payout_status === 'pending').length,
    transferred:          enriched.filter(o => o.payout_status === 'transferred').length,
    failed:               enriched.filter(o => o.payout_status === 'failed').length,
    total_pending_cents:  enriched.filter(o => o.payout_status === 'pending').reduce((s, o) => s + o.payout_cents, 0),
    total_transferred_cents: enriched.filter(o => o.payout_status === 'transferred').reduce((s, o) => s + o.payout_cents, 0),
    total_failed_cents:   enriched.filter(o => o.payout_status === 'failed').reduce((s, o) => s + o.payout_cents, 0),
  }

  return ok({ orders: enriched, summary })
}
