/**
 * GET /api/student/orders/stats
 * Aggregate counters for the current student's order portfolio. Computed with
 * lightweight `count: 'exact', head: true` queries so it stays cheap even when
 * the student has hundreds of historical orders.
 */
import { getCurrentStudent } from '@/lib/student'

const ACTIVE_STATUSES = ['active', 'in_progress', 'review', 'under_review']
const PENDING_STATUSES = ['queued', 'created', 'pending']

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  const counts = async (filter: (q: any) => any) => {
    let q = db.from('orders').select('id', { count: 'exact', head: true }).eq('client_id', profile.id)
    q = filter(q)
    const { count } = await q
    return count ?? 0
  }

  // Sum totals via a select (head:true doesn't return rows for sum)
  const totalsRes = await db
    .from('orders')
    .select('status, total_amount, escrow_status')
    .eq('client_id', profile.id)

  const rows = totalsRes.data ?? []
  const sumAmount = (filter: (r: any) => boolean) =>
    rows.filter(filter).reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0)

  const [total, active, pending, completed, cancelled, refunded] = await Promise.all([
    counts(q => q),
    counts(q => q.in('status', ACTIVE_STATUSES)),
    counts(q => q.in('status', PENDING_STATUSES)),
    counts(q => q.eq('status', 'completed')),
    counts(q => q.in('status', ['cancelled', 'canceled'])),
    counts(q => q.eq('status', 'refunded')),
  ])

  const escrowHeld     = sumAmount((r: any) => r.escrow_status === 'held')
  const escrowReleased = sumAmount((r: any) => r.escrow_status === 'released')
  const escrowRefunded = sumAmount((r: any) => r.escrow_status === 'refunded')
  const lifetimeSpend  = sumAmount((r: any) => ['completed', 'review', 'active', 'in_progress', 'under_review'].includes(r.status))

  // Awaiting student input — orders in 'review' status (delivery awaiting approval).
  const awaitingApproval = await counts(q => q.in('status', ['review', 'under_review']))

  return Response.json({
    stats: {
      total,
      active,
      pending,
      completed,
      cancelled,
      refunded,
      awaitingApproval,
      escrowHeld,
      escrowReleased,
      escrowRefunded,
      lifetimeSpend,
    },
  })
}
