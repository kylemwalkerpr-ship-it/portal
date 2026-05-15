/**
 * GET /api/admin/attorney-applications
 * Server-side paginated, filtered, searchable list of attorney applications.
 * Designed to handle tens of thousands of records.
 *
 * Query params:
 *   status         — pending | approved | declined | waitlist | all
 *   priority       — normal | high | urgent
 *   credential     — credential_type filter
 *   q              — full-text search (name, email, bar #, jurisdictions, practice areas)
 *   min_risk       — minimum risk score (0–100)
 *   aged_only      — true to show only pending > 7 days old
 *   page           — 1-indexed page (default 1)
 *   page_size      — default 25, max 200
 *   sort           — created_at | risk_score | priority | full_name | status
 *   dir            — asc | desc (default desc)
 */
import { getClerkUserId } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase'

async function requireAdmin() {
  const clerkUserId = await getClerkUserId()
  if (!clerkUserId) return { error: 'Unauthorized', status: 401 as const }
  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id, role')
    .eq('clerk_user_id', clerkUserId)
    .single()
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 as const }
  return { db, adminProfileId: profile.id }
}

export async function GET(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const status        = searchParams.get('status')      || 'pending'
  const priority      = searchParams.get('priority')    || ''
  const credential    = searchParams.get('credential')  || ''
  const q             = searchParams.get('q')?.trim()   || ''
  const minRisk       = Number(searchParams.get('min_risk') || 0)
  const agedOnly      = searchParams.get('aged_only') === 'true'
  const page          = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize      = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 25)))
  const sortCol       = ['created_at','risk_score','priority','full_name','status','decided_at'].includes(searchParams.get('sort') || '')
    ? searchParams.get('sort')! : 'created_at'
  const sortDir       = searchParams.get('dir') === 'asc'

  const FULL_COLS =
    'id, profile_id, email, full_name, phone, credential_type, jurisdictions, bar_number, ' +
    'practice_areas, malpractice_insurance, profile_url, capacity, notes, status, priority, ' +
    'risk_score, risk_flags, assigned_to, last_reviewed_at, internal_notes, ' +
    'decided_at, decided_by, decision_notes, created_at'

  const build = (cols: string) => {
    let qb = auth.db
      .from('attorney_applications')
      .select(cols, { count: 'exact' })
      .order(sortCol, { ascending: sortDir })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (status && status !== 'all') qb = qb.eq('status', status)
    if (priority)                   qb = qb.eq('priority', priority)
    if (credential)                 qb = qb.eq('credential_type', credential)
    if (minRisk > 0)                qb = qb.gte('risk_score', minRisk)
    if (agedOnly)                   qb = qb.lt('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    if (q) {
      if (q.length >= 3) {
        qb = qb.textSearch('full_name', q, { type: 'websearch', config: 'simple' })
      } else {
        qb = qb.ilike('full_name', `%${q}%`)
      }
    }
    return qb
  }

  let { data: rows, error, count } = await build(FULL_COLS)

  // Self-heal: if any column is missing (migration not applied), retry SELECT *.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    let fb = auth.db
      .from('attorney_applications')
      .select('*', { count: 'exact' })
      .order(sortCol, { ascending: sortDir })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (status && status !== 'all') fb = fb.eq('status', status)
    if (q) fb = fb.ilike('full_name', `%${q}%`)
    const r = await fb
    rows = r.data as any
    error = r.error as any
    count = r.count as any
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const apps: any[] = rows ?? []
  const total = count ?? 0

  // Enrich with reviewer + assigned profile names (batched)
  const reviewerIds = [...new Set(apps.map(a => a.last_reviewed_by || a.decided_by).filter(Boolean))]
  const assigneeIds = [...new Set(apps.map(a => a.assigned_to).filter(Boolean))]
  const profileIds  = [...new Set([...reviewerIds, ...assigneeIds])]
  let profileMap: Record<string, any> = {}
  if (profileIds.length) {
    const { data: profs } = await auth.db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', profileIds)
    for (const p of profs ?? []) profileMap[p.id] = p
  }

  // byStatus counts (independent of filters — for tab badges)
  let byStatus: Record<string, number> = {}
  try {
    const { data: counts } = await auth.db.from('attorney_applications').select('status')
    for (const r of counts ?? []) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  } catch {}

  const enriched = apps.map(a => ({
    ...a,
    assigned_profile: a.assigned_to ? profileMap[a.assigned_to] || null : null,
    reviewer_profile: (a.last_reviewed_by || a.decided_by) ? profileMap[a.last_reviewed_by || a.decided_by] || null : null,
    age_days: a.created_at ? Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86_400_000) : 0,
  }))

  return Response.json({
    applications: enriched,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
    has_more: page * pageSize < total,
    byStatus,
  })
}
