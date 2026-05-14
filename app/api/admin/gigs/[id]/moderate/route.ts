import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

type ModerationAction = 'suspend' | 'unsuspend' | 'archive' | 'restore'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const body = await req.json().catch(() => ({}))

  const action: ModerationAction = body.action
  const reason: string | undefined = typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined

  const validActions: ModerationAction[] = ['suspend', 'unsuspend', 'archive', 'restore']
  if (!validActions.includes(action)) {
    return fail('Invalid action. Must be one of: suspend, unsuspend, archive, restore.', 400)
  }
  if (action === 'suspend' && !reason) {
    return fail('reason is required when suspending a gig.', 400)
  }

  const { data: existing, error: loadErr } = await auth.db
    .from('gigs')
    .select('id, status')
    .eq('id', id)
    .single()

  if (loadErr || !existing) return fail('Gig not found.', 404)

  const now = new Date().toISOString()
  const previousStatus = String(existing.status || '')
  const patch: Record<string, unknown> = { updated_at: now, last_status_changed_at: now }

  switch (action) {
    case 'suspend':
      patch.status = 'suspended'
      patch.suspended_at = now
      patch.suspended_by = auth.profileId
      patch.gig_status_reason = reason!
      break

    case 'unsuspend':
      patch.status = 'active'
      patch.suspended_at = null
      patch.suspended_by = null
      patch.gig_status_reason = null
      break

    case 'archive':
      patch.status = 'archived'
      patch.archived_at = now
      break

    case 'restore':
      patch.status = 'active'
      patch.deleted_at = null
      patch.deleted_by = null
      break
  }

  const { data: gig, error: updateErr } = await auth.db
    .from('gigs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr || !gig) return fail(updateErr?.message || 'Could not update gig.', 500)

  const newStatus = String(gig.status || '')

  await auth.db.from('admin_audit_log').insert({
    admin_id: auth.profileId,
    action_type: action,
    target_table: 'gigs',
    target_id: id,
    payload_snapshot: { previous_status: previousStatus, new_status: newStatus },
    reason: reason ?? null,
  })

  return ok({ gig })
}
