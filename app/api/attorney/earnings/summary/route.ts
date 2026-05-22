/**
 * GET /api/attorney/earnings/summary
 * Aggregate earnings + payout health for the attorney dashboard tiles.
 * Pulls everything from the orders table (DB-first) so the page renders
 * instantly without an external gateway round trip. Also returns payout setup status
 * (already on attorneys row).
 */
import { requireAttorney } from '@/lib/attorneyAuth'

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const [ordersRes, attorneyRes] = await Promise.all([
    ctx.db
      .from('orders')
      .select('status, escrow_status, total_amount, attorney_fee, platform_fee, refunded_amount, payout_status, completed_at, created_at')
      .eq('consultant_id', ctx.profileId),
    ctx.db
      .from('attorneys')
      .select('available, starting_price')
      .eq('id', ctx.attorneyId)
      .single(),
  ])

  if (ordersRes.error) return Response.json({ error: ordersRes.error.message }, { status: 500 })

  const orders = ordersRes.data ?? []
  const attorney = attorneyRes.data ?? null
  const now = Date.now()
  const day = 86_400_000

  const isCompleted = (o: any) => o.status === 'completed' || ['released', 'paid', 'completed'].includes(String(o.escrow_status || '').toLowerCase())
  const fee = (o: any) => Number(o.attorney_fee || 0)
  const dateOf = (o: any) => o.completed_at ? new Date(o.completed_at).getTime() : 0

  const completed = orders.filter(isCompleted)
  const transferred = completed.filter((o: any) => o.payout_status === 'transferred')
  const pendingPayout = completed.filter((o: any) => o.payout_status !== 'transferred' && o.payout_status !== 'failed' && o.payout_status !== 'refunded')
  const failed = completed.filter((o: any) => o.payout_status === 'failed')

  const sum = (list: any[]) => list.reduce((s, o) => s + fee(o), 0)

  const inWindow = (o: any, days: number) => dateOf(o) >= now - days * day

  return Response.json({
    summary: {
      transferredLifetime: sum(transferred),
      transferred30d:       sum(transferred.filter((o: any) => inWindow(o, 30))),
      transferred90d:       sum(transferred.filter((o: any) => inWindow(o, 90))),
      pendingPayout:        sum(pendingPayout),
      failedPayout:         sum(failed),
      refundedLifetime:     orders.reduce((s: number, o: any) => s + Number(o.refunded_amount || 0), 0),
      platformFeeLifetime:  completed.reduce((s: number, o: any) => s + Number(o.platform_fee || 0), 0),

      completedOrders:      completed.length,
      transferredOrders:    transferred.length,
      pendingPayoutOrders:  pendingPayout.length,
      failedPayoutOrders:   failed.length,
      totalOrders:          orders.length,
    },
  })
}
