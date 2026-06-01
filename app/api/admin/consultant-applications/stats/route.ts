/**
 * GET /api/admin/consultant-applications/stats
 * Aggregate stats for the consultant applications dashboard. Mirrors the
 * attorney stats endpoint — uses an SQL RPC where present, falls back to JS.
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

interface AppRow {
  status: string
  created_at: string
  decided_at: string | null
  risk_score: number | null
}

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

  const { data, error } = await db.rpc('consultant_applications_stats')

  if (error || !data) {
    const { data: rows } = await db
      .from('consultant_applications')
      .select('status, created_at, decided_at, risk_score')
    const list = ((rows ?? []) as AppRow[])
    const now = Date.now()
    const day = 86_400_000
    const filterDays = (n: number) => list.filter(r => new Date(r.created_at).getTime() >= now - n * day).length
    const decided = list.filter(r => r.decided_at)
    const approvedRecent = decided.filter(r => r.status === 'approved' && new Date(r.decided_at as string).getTime() >= now - 90 * day).length
    const decidedRecent  = decided.filter(r => new Date(r.decided_at as string).getTime() >= now - 90 * day).length
    const totalSeconds = decided.reduce((sum, r) => sum + (new Date(r.decided_at as string).getTime() - new Date(r.created_at).getTime()) / 1000, 0)
    return Response.json({
      stats: {
        total:               list.length,
        pending:             list.filter(r => r.status === 'pending').length,
        approved:            list.filter(r => r.status === 'approved').length,
        declined:            list.filter(r => r.status === 'declined').length,
        waitlist:            list.filter(r => r.status === 'waitlist').length,
        last_7d:             filterDays(7),
        last_30d:            filterDays(30),
        high_risk_pending:   list.filter(r => r.status === 'pending' && (r.risk_score ?? 0) >= 50).length,
        aged_pending:        list.filter(r => r.status === 'pending' && new Date(r.created_at).getTime() < now - 7 * day).length,
        avg_decision_hours:  decided.length ? Math.round((totalSeconds / decided.length / 3600) * 10) / 10 : 0,
        approval_rate_pct:   decidedRecent ? Math.round((approvedRecent / decidedRecent) * 1000) / 10 : 0,
      },
      warnings: ['stats_rpc_missing — run supabase/consultant_applications.sql for full fidelity'],
    })
  }

  return Response.json({ stats: data })
}
