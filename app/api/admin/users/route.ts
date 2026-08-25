/**
 * GET /api/admin/users
 * Paginated user list for the admin role-management surfaces. Sits beside
 * the existing per-id handler at /api/admin/users/[id] which is responsible
 * for PATCH/DELETE on individual profiles.
 *
 * Query params:
 *   role        — student | client | consultant | attorney | admin | support | all (default all)
 *   status      — active | pending | suspended | declined | all (default all)
 *   country     — ISO-3166-1 alpha-2 filter (case-insensitive); ignored if not in our allowlist
 *   q           — substring search across full_name + email
 *   sort        — full_name | email | role | status | country | country_code | created_at (default created_at)
 *   dir         — asc | desc (default desc)
 *   page        — 1-indexed (default 1)
 *   page_size   — rows per page (default 50, max 200)
 *
 * Response shape mirrors app/api/admin/escrow/route.ts: { users, total,
 * page, page_size, total_pages, has_more }. Returns country_code +
 * country_source alongside the existing free-form `country` field so the
 * UI can render either.
 */
import { requireAdminUser } from '@/lib/portalAuth'
import { ok, fail, CPU_TIMEOUT_REGEX } from '@/lib/apiEnvelope'
import { normalizeCountryCode } from '@/lib/countryList'

const SORTABLE_COLUMNS: Record<string, string> = {
  full_name:    'full_name',
  email:        'email',
  role:         'role',
  status:       'status',
  country:      'country',
  country_code: 'country_code',
  created_at:   'created_at',
}

const ROLES = new Set(['student', 'client', 'consultant', 'attorney', 'admin', 'support'])
const STATUSES = new Set(['active', 'pending', 'suspended', 'declined'])

const BASE_COLUMNS = 'id, full_name, email, role, status, country, country_code, country_source, created_at'
const LEGACY_COLUMNS = 'id, full_name, email, role, status, country, created_at'

export async function GET(req: Request) {
  // ── abort guard: client disconnect → fast 499 ──
  if (req.signal.aborted) {
    return Response.json({ error: 'Request cancelled by client' }, { status: 499 })
  }
  const abortHandler = () => { /* no-op */ }
  req.signal.addEventListener('abort', abortHandler)

  try {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { db } = auth
  const { searchParams } = new URL(req.url)
  const warnings: string[] = []

  const page     = Math.max(1, Number(searchParams.get('page') || 1))
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('page_size') || 50)))

  const sortKey = searchParams.get('sort') || 'created_at'
  let sortCol = SORTABLE_COLUMNS[sortKey] || 'created_at'
  const sortAsc = searchParams.get('dir') === 'asc'

  const role    = (searchParams.get('role') || 'all').toLowerCase()
  const status  = (searchParams.get('status') || 'all').toLowerCase()
  const country = normalizeCountryCode(searchParams.get('country'))
  const q       = searchParams.get('q')?.trim() || ''

  const build = (columns: string) => {
    let query = db.from('profiles').select(columns, { count: 'exact' })
      .order(sortCol as any, { ascending: sortAsc })
      .range((page - 1) * pageSize, page * pageSize - 1)
    if (ROLES.has(role)) query = query.eq('role', role)
    if (STATUSES.has(status)) query = query.eq('status', status)
    if (country && columns.includes('country_code')) query = query.eq('country_code', country)
    if (q.length >= 1) {
      const safe = q.replace(/[%_,]/g, m => '\\' + m)
      // FTS on full_name (indexed via idx_consultant_applications_name_fts pattern);
      // email is short — keep ilike.
      const safeQ = safe.replace(/[,()"'\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
      if (safeQ && safeQ.length >= 2) {
        // plainto_tsquery (`plfts`): `-`/quotes in user queries can never
        // raise "syntax error in tsquery" (to_tsquery parses `-` as NOT).
        query = query.or(`full_name.plfts.${safeQ},email.ilike.%${safe}%`)
      } else {
        query = query.or(`email.ilike.%${safe}%`)
      }
    }
    return query
  }

  let { data, error, count } = await build(BASE_COLUMNS) as any

  if (error && /column .*(country_code|country_source)/i.test(error.message || '')) {
    warnings.push('schema_partial — run the profiles country_code migration')
    // Sort-by-country_code degrades to sort-by-country for the legacy path.
    if (sortCol === 'country_code') sortCol = 'country'
    const retry = await build(LEGACY_COLUMNS) as any
    data = retry.data
    error = retry.error
    count = retry.count
  }

  if (error) return fail(error.message, 500)

  const rows = (data ?? []).map((u: any) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    status: u.status,
    country: u.country ?? null,
    country_code: u.country_code ?? null,
    country_source: u.country_source ?? null,
    created_at: u.created_at,
  }))

  const total = count ?? rows.length
  return ok({
    users: rows,
    total,
    page,
    page_size: pageSize,
    total_pages: Math.ceil(total / pageSize),
    has_more: page * pageSize < total,
  }, {}, warnings.length ? { data_warnings: warnings } : {})
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const isCpuTimeout = CPU_TIMEOUT_REGEX.test(message)
    return fail(message, isCpuTimeout ? 503 : 500)
  } finally {
    req.signal.removeEventListener('abort', abortHandler)
  }
}
