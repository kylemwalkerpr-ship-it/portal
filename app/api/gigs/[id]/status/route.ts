import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

// Allowed seller transitions (admin can do anything)
const SELLER_TRANSITIONS: Record<string, string[]> = {
  draft: ['active', 'archived', 'deleted'],
  active: ['archived', 'deleted'],
  suspended: ['archived', 'deleted'],
  archived: ['draft', 'deleted'],
  // deleted: only admin can restore
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  const { data: existing, error: loadErr } = await auth.db
    .from('gigs')
    .select('*')
    .eq('id', id)
    .single()

  if (loadErr || !existing) return fail('Gig not found.', 404)

  const isAdmin = auth.role === 'admin'
  const isOwner = existing.provider_id === auth.profileId && existing.provider_type === auth.role

  if (!isAdmin && !isOwner) return fail('Forbidden.', 403)

  const body = await req.json().catch(() => ({}))
  const newStatus: string = String(body.status || '')
  const reason: string | undefined = typeof body.reason === 'string' ? body.reason.trim() : undefined

  const validStatuses = ['draft', 'active', 'suspended', 'archived', 'deleted']
  if (!validStatuses.includes(newStatus)) return fail('Invalid status.', 400)

  const currentStatus: string = String(existing.status || '')

  // Check transition rules for non-admins
  if (!isAdmin) {
    const allowed = SELLER_TRANSITIONS[currentStatus] ?? []
    if (!allowed.includes(newStatus)) {
      return fail(`Cannot transition from '${currentStatus}' to '${newStatus}'.`, 422)
    }
    // Sellers cannot suspend
    if (newStatus === 'suspended') return fail('Forbidden.', 403)
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status: newStatus,
    last_status_changed_at: now,
    updated_at: now,
  }

  if (newStatus === 'suspended') {
    patch.suspended_at = now
    patch.suspended_by = auth.profileId
    if (reason) patch.gig_status_reason = reason
  }

  if (newStatus === 'archived') {
    patch.archived_at = now
  }

  if (newStatus === 'deleted') {
    patch.deleted_at = now
    patch.deleted_by = auth.profileId
  }

  // Clear status reason when un-suspending
  if (currentStatus === 'suspended' && newStatus !== 'suspended') {
    patch.gig_status_reason = null
  }

  const { data: gig, error } = await auth.db
    .from('gigs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !gig) return fail(error?.message || 'Could not update gig status.', 500)
  return ok({ gig })
}
