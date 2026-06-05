/**
 * GET /api/documents/audit?path=<storage-path>
 *
 * Returns the audit trail for one document. Admins only.
 *
 * Why the strict gate: the log itself is sensitive (it reveals who
 * looked at what and when), so a non-admin shouldn't even learn that
 * a path is logged. Anyone other than an admin gets a generic 403 --
 * we never confirm whether the path exists.
 *
 * Query params:
 *   path       (required) -- storage_path on the document
 *   bucket     (optional) -- restrict by bucket
 *   limit      (optional) -- 1..200, default 50
 *
 * Response:
 *   { entries: [{ id, action, accessor_profile_id, accessor_name,
 *                 ip, user_agent, created_at, meta }], total }
 *
 * Self-heals: if the document_access_log table hasn't been applied
 * yet, we return 200 with an empty list and a meta.data_warnings
 * message so the UI can show a "log not yet provisioned" banner
 * instead of throwing a 500.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  if (auth.role !== 'admin') {
    // Generic 403 -- never confirm whether the path exists.
    return fail('Forbidden.', 403)
  }

  const url = new URL(req.url)
  const path = url.searchParams.get('path') || ''
  const bucket = url.searchParams.get('bucket') || ''
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)))
  if (!path) return fail('path query param is required.', 400)

  let query = auth.db
    .from('document_access_log')
    .select('id, document_bucket, document_path, document_id, accessor_profile_id, action, ip, user_agent, meta, created_at', { count: 'exact' })
    .eq('document_path', path)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (bucket) query = query.eq('document_bucket', bucket)

  const { data: rows, error, count } = await query

  if (error) {
    // Tolerate "relation does not exist" -- the migration may not have
    // run yet. Return 200 with a warning so the UI keeps working.
    if (/relation .*document_access_log.* does not exist/i.test(error.message || '')) {
      return ok({ entries: [], total: 0 }, { status: 200 }, {
        data_warnings: ['document_access_log table is not provisioned. Run supabase/document_security_jun2026.sql.'],
      })
    }
    return fail(error.message, 500)
  }

  const accessorIds = Array.from(new Set((rows ?? []).map(r => r.accessor_profile_id).filter(Boolean) as string[]))
  const names = new Map<string, { name: string; email: string | null }>()
  if (accessorIds.length > 0) {
    const { data: profs } = await auth.db
      .from('profiles')
      .select('id, full_name, email, role')
      .in('id', accessorIds)
    for (const p of profs ?? []) {
      names.set(p.id, { name: p.full_name || p.email || 'User', email: p.email || null })
    }
  }

  const entries = (rows ?? []).map(r => ({
    id: r.id,
    action: r.action,
    accessor_profile_id: r.accessor_profile_id,
    accessor_name: r.accessor_profile_id ? (names.get(r.accessor_profile_id)?.name || 'User') : 'Unknown',
    accessor_email: r.accessor_profile_id ? (names.get(r.accessor_profile_id)?.email || null) : null,
    ip: r.ip || null,
    user_agent: r.user_agent || null,
    bucket: r.document_bucket,
    path: r.document_path,
    document_id: r.document_id,
    meta: r.meta || null,
    created_at: r.created_at,
  }))

  return ok({ entries, total: count ?? entries.length })
}
