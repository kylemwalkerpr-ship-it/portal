import { ok, fail } from '@/lib/apiEnvelope'
import { requireAdminUser } from '@/lib/portalAuth'

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const body = await req.json().catch(() => ({}))
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (['draft', 'active', 'paused', 'archived'].includes(body.status)) payload.status = body.status
  if ('seo_title' in body) payload.seo_title = body.seo_title
  if ('seo_description' in body) payload.seo_description = body.seo_description
  if (body.boost_days) payload.boost_until = new Date(Date.now() + Number(body.boost_days) * 86400000).toISOString()
  if (body.feature_days) payload.featured_until = new Date(Date.now() + Number(body.feature_days) * 86400000).toISOString()
  if (body.rank_boost) payload.rank_score = body.rank_boost

  const { data: before } = await auth.db.from('gigs').select('*').eq('id', id).single()
  const { data: gig, error } = await auth.db.from('gigs').update(payload).eq('id', id).select('*').single()
  if (error || !gig) return fail(error?.message || 'Could not update gig.', 500)
  await auth.db.from('admin_audit_log').insert({
    admin_id: auth.profileId,
    action_type: body.action_type || 'update_gig',
    target_table: 'gigs',
    target_id: id,
    payload_snapshot: { before, after: gig, request: body },
    reason: body.reason || null,
  })
  return ok({ gig })
}
