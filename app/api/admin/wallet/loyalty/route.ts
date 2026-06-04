/**
 * GET /api/admin/wallet/loyalty
 *
 * Paginated list of students with earned-but-not-yet-awarded loyalty credit.
 * Mirrors the admin/escrow pattern: paginated rows + a `summary` block of
 * platform-wide totals, plus self-healing meta warnings when schema is
 * partial.
 *
 * Query params:
 *   page         — 1-indexed (default 1)
 *   page_size    — rows per page (default 25, max 200)
 *   sort         — available_desc (default) | available_asc | earned_desc | spent_desc | name
 *   q            — free-text search on full_name / email (post-filter)
 *   include_all  — '1' to return every student (including those with zero
 *                  available credit). Default is to filter to rows with
 *                  available_credit_cents > 0 so the admin sees a true
 *                  worklist of payable credits.
 *
 * Returns:
 *   {
 *     rows: [{ profile_id, full_name, email, lifetime_spent_cents,
 *              earned_credit_cents, awarded_credit_cents,
 *              available_credit_cents }],
 *     total, page, page_size, total_pages,
 *     summary: {
 *       total_lifetime_spent_cents,
 *       total_earned_credit_cents,
 *       total_awarded_credit_cents,
 *       total_outstanding_credit_cents,
 *       students_with_available_credit,
 *     }
 *   }
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail } from '@/lib/apiEnvelope'
import { aggregateAllLoyaltyStates } from '@/lib/loyaltyWallet'

type SortKey = 'available_desc' | 'available_asc' | 'earned_desc' | 'spent_desc' | 'name'
const SORTS: SortKey[] = ['available_desc', 'available_asc', 'earned_desc', 'spent_desc', 'name']

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { searchParams } = new URL(req.url)

  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 25)))
  const sortKey  = (searchParams.get('sort') as SortKey) || 'available_desc'
  const sort     = (SORTS as readonly string[]).includes(sortKey) ? sortKey : 'available_desc'
  const q        = (searchParams.get('q') || '').trim().toLowerCase()
  const includeAll = searchParams.get('include_all') === '1'

  const { rows: allRows, warnings } = await aggregateAllLoyaltyStates()

  // Platform-wide totals BEFORE filtering. The metric cards always reflect
  // the entire platform, never the current page or filter.
  const summary = allRows.reduce(
    (s, r) => {
      s.total_lifetime_spent_cents     += r.lifetime_spent_cents
      s.total_earned_credit_cents      += r.earned_credit_cents
      s.total_awarded_credit_cents     += r.awarded_credit_cents
      s.total_outstanding_credit_cents += r.available_credit_cents
      if (r.available_credit_cents > 0) s.students_with_available_credit += 1
      return s
    },
    {
      total_lifetime_spent_cents:     0,
      total_earned_credit_cents:      0,
      total_awarded_credit_cents:     0,
      total_outstanding_credit_cents: 0,
      students_with_available_credit: 0,
    }
  )

  // Default view: only rows with unawarded credit, so the admin sees a
  // worklist rather than every student that ever transacted.
  let filtered = includeAll
    ? allRows
    : allRows.filter(r => r.available_credit_cents > 0)

  // Profile join — full_name / email for display + search.
  const profileMap: Record<string, { full_name: string | null; email: string | null; role: string | null }> = {}
  if (filtered.length > 0) {
    const ids = filtered.map(r => r.profile_id)
    try {
      const { data: profs, error } = await db
        .from('profiles')
        .select('id, full_name, email, role')
        .in('id', ids)
      if (error) {
        warnings.push(`profile_lookup_failed: ${error.message}`)
      } else {
        for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string | null }>) {
          profileMap[p.id] = { full_name: p.full_name, email: p.email, role: p.role }
        }
      }
    } catch (e: any) {
      warnings.push(`profile_lookup_failed: ${e?.message || 'unknown'}`)
    }
  }

  const enriched = filtered.map(r => ({
    ...r,
    full_name: profileMap[r.profile_id]?.full_name ?? null,
    email:     profileMap[r.profile_id]?.email ?? null,
    role:      profileMap[r.profile_id]?.role ?? null,
  }))

  // Free-text filter
  let post = enriched
  if (q && q.length >= 2) {
    post = post.filter(r =>
      [r.full_name, r.email, r.profile_id].some(v => v && String(v).toLowerCase().includes(q))
    )
  }

  // Sort
  post.sort((a, b) => {
    switch (sort) {
      case 'available_asc': return a.available_credit_cents - b.available_credit_cents
      case 'earned_desc':   return b.earned_credit_cents    - a.earned_credit_cents
      case 'spent_desc':    return b.lifetime_spent_cents   - a.lifetime_spent_cents
      case 'name':          return String(a.full_name || a.email || '').localeCompare(String(b.full_name || b.email || ''))
      case 'available_desc':
      default:              return b.available_credit_cents - a.available_credit_cents
    }
  })

  const total      = post.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start      = (page - 1) * pageSize
  const slice      = post.slice(start, start + pageSize)

  return ok(
    {
      rows: slice,
      total,
      page,
      page_size: pageSize,
      total_pages: totalPages,
      has_more: page * pageSize < total,
      summary,
    },
    {},
    warnings.length ? { data_warnings: warnings } : {}
  )
}
