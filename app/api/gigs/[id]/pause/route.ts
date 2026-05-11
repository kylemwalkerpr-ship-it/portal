import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function PATCH(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: gig } = await auth.db.from('gigs').select('provider_id').eq('id', id).single()
  if (!gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  const { data: updated, error } = await auth.db.from('gigs').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error || !updated) return fail(error?.message || 'Could not pause gig.', 500)
  return ok({ gig: updated })
}
