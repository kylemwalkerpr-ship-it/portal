import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Forbidden.', 403)

  const { id } = await context.params

  const { data, error } = await auth.db
    .from('saved_gigs')
    .delete()
    .eq('id', id)
    .eq('client_profile_id', auth.profileId)
    .select('id')
    .single()

  if (error || !data) return fail('Saved gig not found.', 404)
  return ok({ id: data.id })
}
