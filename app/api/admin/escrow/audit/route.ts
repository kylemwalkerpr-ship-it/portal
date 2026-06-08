/**
 * GET /api/admin/escrow/audit
 * Returns admin_audit_log entries for auto-release sweeps (both cron and manual),
 * so the Escrow tab can monitor cron job health and manual sweep history.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(_req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { db } = auth

  try {
    const { data, error } = await db
      .from('admin_audit_log')
      .select('id, action_type, payload_snapshot, reason, created_at, admin_id')
      .in('action_type', ['cron_auto_release_escrow', 'escrow_run_auto_releases'])
      .order('created_at', { ascending: false })
      .limit(50) as any

    if (error) return fail(`Failed to fetch audit log: ${error.message}`, 500)

    const entries = (data ?? []).map((e: any) => ({
      id: e.id,
      action_type: e.action_type,
      source: e.action_type === 'cron_auto_release_escrow' ? 'cron' : 'manual',
      payload: e.payload_snapshot || {},
      reason: e.reason || '',
      ran_at: e.created_at,
      admin_id: e.admin_id,
    }))

    return ok({ entries })
  } catch (err: any) {
    return fail(err.message || 'Failed to fetch audit log.', 500)
  }
}
