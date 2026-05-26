/**
 * GET /api/attorney/orders/stats
 * Aggregate counters for the attorney's order portfolio. Used by the
 * tabs + summary tiles on Active Orders.
 */
import { requireAttorney } from '@/lib/attorneyAuth'

const ACTIVE = ['active', 'in_progress']
const REVIEW = ['review', 'under_review']
const PENDING = ['queued', 'created', 'pending']

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  // The orders table schema has shifted a couple of times (attorney_fee was
  // added by a later migration; some envs have payout_status, others don't).
  // A 500 from any one missing column blanks out the entire Active Orders
  // dashboard, so query defensively: try the full shape first, fall back to
  // the minimal shape if PostgREST complains.
  let rows: any[] | null = null
  {
    const full = await ctx.db
      .from('orders')
      .select('status, escrow_status, total_amount, attorney_fee, deadline, completed_at, created_at, payout_status')
      .eq('consultant_id', ctx.profileId)
    if (!full.error) {
      rows = full.data ?? []
    } else {
      console.warn('[attorney/orders/stats] full select failed, falling back', full.error.message)
      const minimal = await ctx.db
        .from('orders')
        .select('status, total_amount, deadline, completed_at, created_at')
        .eq('consultant_id', ctx.profileId)
      if (minimal.error) {
        console.error('[attorney/orders/stats] minimal select also failed', minimal.error.message)
        // Return zeros rather than a 500 — the dashboard tabs handle the
        // empty state gracefully and the user can still browse.
        rows = []
      } else {
        rows = minimal.data ?? []
      }
    }
  }

  const list = rows ?? []
  const now = Date.now()
  const dueSoon = (o: any) => o.deadline && new Date(o.deadline).getTime() < now + 3 * 86_400_000 && new Date(o.deadline).getTime() > now
  const overdue = (o: any) => o.deadline && new Date(o.deadline).getTime() < now && o.status !== 'completed' && o.status !== 'cancelled'

  const sumFee = (filter: (r: any) => boolean) =>
    list.filter(filter).reduce((s: number, r: any) => s + Number(r.attorney_fee || 0), 0)

  const stats = {
    total:             list.length,
    pending:           list.filter((r: any) => PENDING.includes(r.status)).length,
    active:            list.filter((r: any) => ACTIVE.includes(r.status)).length,
    review:            list.filter((r: any) => REVIEW.includes(r.status)).length,
    completed:         list.filter((r: any) => r.status === 'completed').length,
    cancelled:         list.filter((r: any) => ['cancelled', 'canceled'].includes(r.status)).length,
    refunded:          list.filter((r: any) => r.status === 'refunded' || r.payout_status === 'refunded').length,
    disputed:          list.filter((r: any) => r.status === 'disputed' || r.escrow_status === 'disputed').length,
    overdue:           list.filter(overdue).length,
    dueSoon:           list.filter(dueSoon).length,
    inMotionFee:       sumFee((r: any) => ACTIVE.includes(r.status) || REVIEW.includes(r.status)),
    awaitingApproval:  list.filter((r: any) => REVIEW.includes(r.status)).length,
    pendingPayoutFee:  sumFee((r: any) => r.status === 'completed' && r.payout_status !== 'transferred' && r.payout_status !== 'refunded'),
  }

  return Response.json({ stats })
}
