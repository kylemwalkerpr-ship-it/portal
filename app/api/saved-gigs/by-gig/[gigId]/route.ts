/**
 * DELETE /api/saved-gigs/by-gig/[gigId]
 *
 * Fast-path unsave: deletes the saved_gigs row that matches the signed-in
 * user + this gig_id, without needing the client to know the saved_gigs
 * record id. Saves a round trip and a list-fetch from the prior fallback.
 *
 * Idempotent — returns 200 even if no row matched.
 */
import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function DELETE(_req: Request, ctx: { params: Promise<{ gigId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  if (auth.role !== 'client') return fail('Forbidden.', 403)

  const { gigId } = await ctx.params
  if (!gigId) return fail('gigId required', 400)

  const { error } = await auth.db
    .from('saved_gigs')
    .delete()
    .eq('client_profile_id', auth.profileId)
    .eq('gig_id', gigId)

  if (error) return fail(error.message, 500)
  return ok({ ok: true, gig_id: gigId })
}
