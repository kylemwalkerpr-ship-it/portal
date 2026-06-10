/**
 * GET /api/admin/payouts/providers
 *
 * Per-provider payout aggregates for the admin Payouts surface (Top
 * Providers table + Providers tab). Derived from provider_earnings; amounts
 * are in DOLLARS to match the queue route's shape.
 *
 * Connect onboarding is retired (see /api/admin/payouts route) — every
 * provider is connect_ready, none are bypassed.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET() {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { data: earnings, error } = await auth.db
    .from('provider_earnings')
    .select('provider_id, amount_cents, fee_cents, status')
    .limit(5000)
  if (error) return fail(error.message, 500)

  type Agg = {
    provider_id: string
    order_count: number
    total_gross: number
    total_fee: number
    transferred: number
    pending: number
    failed: number
  }
  const byProvider = new Map<string, Agg>()
  for (const e of (earnings ?? []) as any[]) {
    if (!e.provider_id) continue
    const agg = byProvider.get(e.provider_id) ?? {
      provider_id: e.provider_id, order_count: 0, total_gross: 0, total_fee: 0,
      transferred: 0, pending: 0, failed: 0,
    }
    const amount = Number(e.amount_cents || 0) / 100
    const fee = Number(e.fee_cents || 0) / 100
    agg.order_count += 1
    agg.total_gross += amount + fee
    agg.total_fee += fee
    if (e.status === 'paid') agg.transferred += amount
    else if (e.status === 'owed' || e.status === 'releasable') agg.pending += amount
    else if (e.status === 'cancelled' || e.status === 'refunded') agg.failed += amount
    byProvider.set(e.provider_id, agg)
  }

  const ids = Array.from(byProvider.keys())
  const profileById = new Map<string, any>()
  if (ids.length) {
    const { data: profiles } = await auth.db
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', ids)
    for (const p of profiles ?? []) profileById.set((p as any).id, p)
  }

  const providers = Array.from(byProvider.values())
    .map((agg) => {
      const p = profileById.get(agg.provider_id) || {}
      return {
        ...agg,
        name: p.full_name || p.email || 'Provider',
        role: p.role || 'consultant',
        connect_ready: true,
        bypass_active: false,
      }
    })
    .sort((a, b) => (b.pending + b.transferred) - (a.pending + a.transferred))

  return ok({ providers })
}
