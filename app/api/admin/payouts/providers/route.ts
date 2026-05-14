/**
 * GET /api/admin/payouts/providers
 * Per-provider earnings ledger — aggregates all orders per provider.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  // All orders with a provider
  const { data: orders, error } = await auth.db
    .from('orders')
    .select('consultant_id, total_amount, platform_fee_amount, consultant_payout_amount, payout_status, status, stripe_transfer_id, created_at')
    .not('consultant_id', 'is', null)
    .not('status', 'in', '("cancelled","refunded")')
    .order('created_at', { ascending: false })

  if (error) return fail(error.message, 500)

  // Group by provider
  const map: Record<string, any> = {}
  for (const o of orders ?? []) {
    const id = o.consultant_id
    if (!map[id]) map[id] = { provider_id: id, total_gross: 0, total_fee: 0, total_payout: 0, transferred: 0, pending: 0, failed: 0, order_count: 0, transfers: [] }
    const gross  = Number(o.total_amount) || 0
    const fee    = Number(o.platform_fee_amount) || 0
    const payout = Number(o.consultant_payout_amount) || gross - fee
    map[id].total_gross  += gross
    map[id].total_fee    += fee
    map[id].total_payout += payout
    map[id].order_count  += 1
    if (o.payout_status === 'transferred') map[id].transferred += payout
    else if (o.payout_status === 'failed') map[id].failed += payout
    else map[id].pending += payout
    if (o.stripe_transfer_id) map[id].transfers.push({ id: o.stripe_transfer_id, amount: payout, date: o.created_at })
  }

  // Enrich with provider profiles
  const providerIds = Object.keys(map)
  if (!providerIds.length) return ok({ providers: [] })

  const { data: profiles } = await auth.db.from('profiles').select('id, full_name, email, role').in('id', providerIds)
  const { data: consultants } = await auth.db.from('consultants').select('profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass').in('profile_id', providerIds)
  const { data: attorneys }   = await auth.db.from('attorneys').select('profile_id, stripe_account_id, stripe_onboarding_complete, stripe_bypass').in('profile_id', providerIds)

  const profileMap: Record<string, any> = {}
  for (const p of profiles ?? []) profileMap[p.id] = p

  const connectMap: Record<string, any> = {}
  for (const c of [...(consultants ?? []), ...(attorneys ?? [])]) connectMap[c.profile_id] = c

  const providers = Object.values(map).map((p: any) => ({
    ...p,
    name:          profileMap[p.provider_id]?.full_name || '—',
    email:         profileMap[p.provider_id]?.email || '—',
    role:          profileMap[p.provider_id]?.role || 'consultant',
    connect_ready: Boolean(connectMap[p.provider_id]?.stripe_onboarding_complete || connectMap[p.provider_id]?.stripe_bypass),
    stripe_account: connectMap[p.provider_id]?.stripe_account_id || null,
    bypass_active:  Boolean(connectMap[p.provider_id]?.stripe_bypass),
    transfers:     p.transfers.slice(0, 10), // last 10
  })).sort((a: any, b: any) => b.total_payout - a.total_payout)

  return ok({ providers })
}
