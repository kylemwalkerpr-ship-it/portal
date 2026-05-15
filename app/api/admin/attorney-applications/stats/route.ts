/**
 * GET /api/admin/attorney-applications/stats
 * Aggregate stats for the attorney applications dashboard. Uses an SQL RPC for
 * efficient counting at scale (no need to pull every row to the API server).
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

export async function GET() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Try the RPC first — handles all the math in Postgres.
  const { data, error } = await db.rpc('attorney_applications_stats')

  if (error || !data) {
    // Fallback: compute in JS if the RPC isn't installed yet.
    const { data: rows } = await db
      .from('attorney_applications')
      .select('status, created_at, decided_at, risk_score')
    const list = rows ?? []
    const now = Date.now()
    const day = 86_400_000
    const filterDays = (n: number) => list.filter((r: any) => new Date(r.created_at).getTime() >= now - n * day).length
    const decided = list.filter((r: any) => r.decided_at)
    const approvedRecent = decided.filter((r: any) => r.status === 'approved' && new Date(r.decided_at).getTime() >= now - 90 * day).length
    const decidedRecent  = decided.filter((r: any) => new Date(r.decided_at).getTime() >= now - 90 * day).length
    const totalSeconds = decided.reduce((sum: number, r: any) => sum + (new Date(r.decided_at).getTime() - new Date(r.created_at).getTime()) / 1000, 0)
    return Response.json({
      stats: {
        total:               list.length,
        pending:             list.filter((r: any) => r.status === 'pending').length,
        approved:            list.filter((r: any) => r.status === 'approved').length,
        declined:            list.filter((r: any) => r.status === 'declined').length,
        waitlist:            list.filter((r: any) => r.status === 'waitlist').length,
        last_7d:             filterDays(7),
        last_30d:            filterDays(30),
        high_risk_pending:   list.filter((r: any) => r.status === 'pending' && (r.risk_score ?? 0) >= 50).length,
        aged_pending:        list.filter((r: any) => r.status === 'pending' && new Date(r.created_at).getTime() < now - 7 * day).length,
        avg_decision_hours:  decided.length ? Math.round((totalSeconds / decided.length / 3600) * 10) / 10 : 0,
        approval_rate_pct:   decidedRecent ? Math.round((approvedRecent / decidedRecent) * 1000) / 10 : 0,
      },
      warnings: ['stats_rpc_missing — run supabase/attorney_applications_scale.sql for full fidelity'],
    })
  }

  return Response.json({ stats: data })
}
