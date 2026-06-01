/**
 * GET /api/admin/consultant-applications
 * Server-side paginated, filtered, searchable list of consultant applications.
 * Mirrors /api/admin/attorney-applications.
 *
 * Query params:
 *   status         — pending | approved | declined | waitlist | all
 *   priority       — normal | high | urgent
 *   consultant_type — individual | firm | student
 *   q              — full-text search (name, email, registration #)
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
  const status         = searchParams.get('status')          || 'pending'
  const priority       = searchParams.get('priority')        || ''
  const consultantType = searchParams.get('consultant_type') || ''
  const q              = searchParams.get('q')?.trim()       || ''
  const minRisk        = Number(searchParams.get('min_risk') || 0)
  const agedOnly       = searchParams.get('aged_only') === 'true'
  const page           = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize       = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 25)))
  const sortCol        = ['created_at','risk_score','priority','full_name','status','decided_at'].includes(searchParams.get('sort') || '')
    ? searchParams.get('sort')! : 'created_at'
  const sortDir        = searchParams.get('dir') === 'asc'

  const FULL_COLS =
    'id, profile_id, email, full_name, phone, consultant_type, jurisdictions, registration_number, ' +
    'specialties, malpractice_insurance, profile_url, capacity, notes, status, priority, ' +
    'risk_score, risk_flags, assigned_to, last_reviewed_at, internal_notes, ' +
    'decided_at, decided_by, decision_notes, created_at'

  const build = (cols: string) => {
    let qb = auth.db
      .from('consultant_applications')
      .select(cols, { count: 'exact' })
      .order(sortCol, { ascending: sortDir })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (status && status !== 'all') qb = qb.eq('status', status)
    if (priority)                   qb = qb.eq('priority', priority)
    if (consultantType)             qb = qb.eq('consultant_type', consultantType)
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
      .from('consultant_applications')
      .select('*', { count: 'exact' })
      .order(sortCol, { ascending: sortDir })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (status && status !== 'all') fb = fb.eq('status', status)
    if (q) fb = fb.ilike('full_name', `%${q}%`)
    const r = await fb
    rows = r.data as never
    error = r.error as never
    count = r.count as never
  }

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const apps = ((rows ?? []) as unknown) as Array<Record<string, unknown>>
  const total = count ?? 0

  // Enrich with reviewer + assigned profile names.
  const reviewerIds = [...new Set(apps.map(a => (a.last_reviewed_by || a.decided_by) as string | null).filter(Boolean) as string[])]
  const assigneeIds = [...new Set(apps.map(a => a.assigned_to as string | null).filter(Boolean) as string[])]
  const profileIds  = [...new Set([...reviewerIds, ...assigneeIds])]
  const profileMap: Record<string, Record<string, unknown>> = {}
  if (profileIds.length) {
    const { data: profs } = await auth.db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', profileIds)
    for (const p of (profs ?? []) as Array<{ id: string }>) profileMap[p.id] = p as Record<string, unknown>
  }

  // byStatus counts.
  const byStatus: Record<string, number> = {}
  try {
    const { data: counts } = await auth.db.from('consultant_applications').select('status')
    for (const r of (counts ?? []) as Array<{ status: string }>) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
  } catch {}

  const enriched = apps.map(a => ({
    ...a,
    assigned_profile: a.assigned_to ? profileMap[a.assigned_to as string] || null : null,
    reviewer_profile: (a.last_reviewed_by || a.decided_by) ? profileMap[(a.last_reviewed_by || a.decided_by) as string] || null : null,
    age_days: a.created_at ? Math.floor((Date.now() - new Date(a.created_at as string).getTime()) / 86_400_000) : 0,
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
