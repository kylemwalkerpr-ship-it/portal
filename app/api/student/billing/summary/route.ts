/**
 * GET /api/student/billing/summary
 * Lifetime + 30-day spend, refunds, wallet credit, escrow held.
 * Cheap aggregate query on the student's own orders.
 */
import { getCurrentStudent } from '@/lib/student'

export async function GET() {
  const auth = await getCurrentStudent()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { db, profile } = auth

  let { data: rows, error } = await db
    .from('orders')
    .select('status, total_amount, escrow_status, escrow_amount, refunded_amount, wallet_credit_amount, refund_status, created_at')
    .eq('client_id', profile.id)

  if (error && /column .* does not exist/i.test(error.message || '')) {
    const r = await db
      .from('orders')
      .select('status, total_amount, created_at')
      .eq('client_id', profile.id)
    rows = r.data as any
    error = r.error as any
  }
  if (error) return Response.json({ error: error.message }, { status: 500 })

  const now = Date.now()
  const day = 86_400_000
  const list: any[] = rows ?? []

  const sum = (filter: (r: any) => boolean, getter: (r: any) => number) =>
    list.filter(filter).reduce((acc: number, r: any) => acc + Number(getter(r) || 0), 0)

  const isCompleted = (r: any) => ['completed', 'review', 'active', 'in_progress', 'under_review'].includes(r.status)
  const recent = (r: any) => new Date(r.created_at).getTime() >= now - 30 * day

  const lifetimeSpend  = sum(isCompleted, r => r.total_amount)
  const last30Spend    = sum(r => isCompleted(r) && recent(r), r => r.total_amount)
  const lifetimeRefund = sum(() => true, r => r.refunded_amount)
  const last30Refund   = sum(r => recent(r), r => r.refunded_amount)
  const walletCredit   = sum(r => (r.refund_status || '').startsWith('wallet_credit_pending'), r => r.wallet_credit_amount)
  const escrowHeld     = sum(r => r.escrow_status === 'held', r => r.escrow_amount)

  return Response.json({
    summary: {
      lifetimeSpend,
      last30Spend,
      lifetimeRefund,
      last30Refund,
      walletCreditPending: walletCredit,
      escrowHeld,
      totalOrders: list.length,
      activeOrders: list.filter((r: any) => ['active', 'in_progress', 'review', 'under_review'].includes(r.status)).length,
    },
  })
}
