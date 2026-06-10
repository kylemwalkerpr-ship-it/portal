/**
 * Admin surface for payment_incidents (supabase/checkout_idempotency.sql).
 *
 * GET   — list incidents (default: unresolved), newest first.
 * PATCH — mark an incident resolved: { id, reason? }. Writes an
 *         admin_audit_log row so resolutions are attributable.
 *
 * Incidents are recorded wherever money moved but a follow-up write failed
 * (card charged but order insert threw, wallet debited with failed refund,
 * provider earning credit failed). earning_credit_failed rows are retried
 * automatically by /api/cron/reconcile-incidents; the rest need a human.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function GET(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const url = new URL(req.url)
  const showResolved = url.searchParams.get('resolved') === 'true'
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)))

  let q = auth.db
    .from('payment_incidents')
    .select('id, profile_id, kind, gateway, transaction_id, amount_cents, context, resolved, resolved_by, resolved_at, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!showResolved) q = q.eq('resolved', false)

  const { data: incidents, error, count } = await q
  if (error) return fail(error.message, 500)

  // Hydrate the affected user's name/email for the admin table.
  const profileIds = Array.from(new Set((incidents ?? []).map((i) => i.profile_id).filter(Boolean)))
  const profileById = new Map<string, { full_name: string | null; email: string | null }>()
  if (profileIds.length > 0) {
    const { data: profiles } = await auth.db
      .from('profiles')
      .select('id, full_name, email')
      .in('id', profileIds)
    for (const p of profiles ?? []) profileById.set(p.id, p)
  }

  return ok({
    incidents: (incidents ?? []).map((i) => ({
      ...i,
      profile_name: i.profile_id ? (profileById.get(i.profile_id)?.full_name ?? null) : null,
      profile_email: i.profile_id ? (profileById.get(i.profile_id)?.email ?? null) : null,
    })),
    total: count ?? 0,
  })
}

export async function PATCH(req: Request) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const body = await req.json().catch(() => ({}))
  const id = typeof body.id === 'string' ? body.id : ''
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 500) : ''
  if (!id) return fail('Missing incident id.', 400)

  const { data: incident, error } = await auth.db
    .from('payment_incidents')
    .update({ resolved: true, resolved_by: auth.profileId, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('resolved', false)
    .select('id, kind, amount_cents, transaction_id')
    .maybeSingle()

  if (error) return fail(error.message, 500)
  if (!incident) return fail('Incident not found or already resolved.', 404)

  // Attribution trail — same pattern as payouts.
  try {
    await auth.db.from('admin_audit_log').insert({
      admin_id: auth.profileId,
      action_type: 'resolve_payment_incident',
      target_table: 'payment_incidents',
      target_id: id,
      payload_snapshot: incident,
      reason: reason || `Marked ${incident.kind} incident resolved`,
    })
  } catch { /* audit log is best-effort */ }

  return ok({ resolved: true, id })
}
