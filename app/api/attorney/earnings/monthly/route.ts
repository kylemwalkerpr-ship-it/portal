/**
 * GET /api/attorney/earnings/monthly
 * 12-month rolling breakdown of transferred attorney fees, computed in JS
 * over the attorney's own orders (no per-row Stripe round trip).
 */
import { requireAttorney } from '@/lib/attorneyAuth'

export async function GET() {
  const { ctx, error, status } = await requireAttorney()
  if (!ctx) return Response.json({ error }, { status })

  const { data: orders, error: ordersErr } = await ctx.db
    .from('orders')
    .select('attorney_fee, payout_status, completed_at')
    .eq('consultant_id', ctx.profileId)
    .not('completed_at', 'is', null)

  if (ordersErr) return Response.json({ error: ordersErr.message }, { status: 500 })

  const transferred = (orders ?? []).filter((o: any) => o.payout_status === 'transferred')

  const map = new Map<string, { key: string; label: string; amount: number; count: number; ts: number }>()
  for (const o of transferred as any[]) {
    const d = new Date(o.completed_at)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const ts  = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
        amount: 0, count: 0, ts,
      })
    }
    const row = map.get(key)!
    row.amount += Number(o.attorney_fee || 0)
    row.count += 1
  }

  const rows = Array.from(map.values())
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 12)

  return Response.json({ monthly: rows })
}
