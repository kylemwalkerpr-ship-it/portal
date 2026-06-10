import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

type ModerationAction =
  | 'suspend'
  | 'unsuspend'
  | 'archive'
  | 'restore'
  | 'approve'
  | 'deny'
  | 'approve_appeal'
  | 'deny_appeal'
  | 'flag'
  | 'rank_adjust'

const VALID_ACTIONS: ModerationAction[] = [
  'suspend', 'unsuspend', 'archive', 'restore',
  'approve', 'deny', 'approve_appeal', 'deny_appeal', 'flag', 'rank_adjust',
]

const DENIAL_CATEGORIES = [
  'spam', 'misleading', 'quality', 'ip_violation', 'harmful', 'pricing_abuse', 'duplicate',
] as const

async function snapshotToHistory(
  db: any,
  gig: any,
  adminId: string,
  adminRole: string,
  action: string,
) {
  try {
    // Increment version_number
    const nextVersion = (Number(gig.version_number) || 0) + 1

    await db.from('gig_version_history').insert({
      gig_id: gig.id,
      version_num: nextVersion,
      changed_by: adminId,
      changed_by_role: adminRole,
      snapshot: gig,
      change_summary: action,
    })

    await db
      .from('gigs')
      .update({ version_number: nextVersion })
      .eq('id', gig.id)
  } catch {
    // Non-fatal — history failure should not block the main action
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const { id } = await context.params
  let body: Record<string, any> = {}
  try { body = await req.json() } catch { /* empty body is fine for some actions */ }

  const action: ModerationAction = body.action
  const reason: string | undefined =
    typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined
  const denialCategory: string | undefined =
    typeof body.denial_category === 'string' ? body.denial_category.trim() || undefined : undefined

  if (!VALID_ACTIONS.includes(action)) {
    return fail(`Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}.`, 400)
  }

  // Validation guards
  if (action === 'suspend' && !reason) {
    return fail('reason is required when suspending a gig.', 400)
  }
  if (action === 'suspend' && !denialCategory) {
    return fail('denial_category is required when suspending a gig.', 400)
  }
  if (action === 'deny' && !reason) {
    return fail('reason is required when denying a gig.', 400)
  }
  if (action === 'deny' && !denialCategory) {
    return fail('denial_category is required when denying a gig.', 400)
  }
  if (
    denialCategory !== undefined &&
    !(DENIAL_CATEGORIES as readonly string[]).includes(denialCategory)
  ) {
    return fail(`Invalid denial_category. Must be one of: ${DENIAL_CATEGORIES.join(', ')}.`, 400)
  }
  if (action === 'rank_adjust') {
    const rs = Number(body.rank_score)
    if (isNaN(rs) || rs < 0 || rs > 1) {
      return fail('rank_score must be a number between 0 and 1.', 400)
    }
  }

  // Load existing gig
  const { data: existing, error: loadErr } = await auth.db
    .from('gigs')
    .select('*')
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
      patch.denial_reason = reason!
      patch.denial_category = denialCategory!
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

    case 'approve':
      patch.status = 'active'
      patch.published_at = existing.published_at ?? now
      patch.denial_reason = null
      patch.denial_category = null
      patch.gig_status_reason = null
      break

    case 'deny':
      patch.status = 'denied'
      patch.denial_reason = reason!
      patch.denial_category = denialCategory!
      patch.gig_status_reason = reason!
      break

    case 'approve_appeal':
      patch.status = 'active'
      patch.appeal_resolved_at = now
      patch.denial_reason = null
      patch.denial_category = null
      patch.gig_status_reason = null
      break

    case 'deny_appeal':
      patch.status = 'denied'
      patch.appeal_resolved_at = now
      break

    case 'flag':
      patch.auto_flag_score = Math.min(100, (Number(existing.auto_flag_score) || 0) + 20)
      patch.auto_flagged_at = now
      // Status unchanged; only insert to moderation_queue below
      delete patch.last_status_changed_at
      delete patch.updated_at
      patch.updated_at = now
      break

    case 'rank_adjust':
      patch.rank_score = Number(body.rank_score)
      delete patch.last_status_changed_at
      break
  }

  // Snapshot before update for status-changing actions
  const statusChangingActions: ModerationAction[] = [
    'suspend', 'unsuspend', 'archive', 'restore',
    'approve', 'deny', 'approve_appeal', 'deny_appeal',
  ]
  if (statusChangingActions.includes(action)) {
    await snapshotToHistory(auth.db, existing, auth.profileId, auth.role, action)
  }

  const { data: gig, error: updateErr } = await auth.db
    .from('gigs')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr || !gig) return fail(updateErr?.message || 'Could not update gig.', 500)

  const newStatus = String(gig.status || '')

  // Audit log
  await auth.db.from('admin_audit_log').insert({
    admin_id: auth.profileId,
    action_type: action,
    target_table: 'gigs',
    target_id: id,
    payload_snapshot: {
      previous_status: previousStatus,
      new_status: newStatus,
      rank_score: action === 'rank_adjust' ? body.rank_score : undefined,
    },
    reason: reason ?? null,
  })

  // For 'flag' action: insert into moderation_queue
  if (action === 'flag') {
    await auth.db.from('moderation_queue').insert({
      target_table: 'gigs',
      target_id: id,
      reason: reason ?? 'Admin flagged',
      status: 'open',
      flag_type: 'admin_flag',
      priority: 'high',
      notes: reason ?? null,
    })
  }

  // For 'approve': try to recompute content score via RPC
  if (action === 'approve') {
    try {
      await auth.db.rpc('compute_gig_content_score', { target_gig: id })
    } catch {
      // Non-fatal — function may not exist yet
    }
  }

  // Invalidate public gig listings (cached in KV) after this mutation.
  const { bumpCacheVersion } = await import('@/lib/cache'); await bumpCacheVersion('gigs')
  return ok({ gig, action, previous_status: previousStatus, new_status: newStatus })
}
