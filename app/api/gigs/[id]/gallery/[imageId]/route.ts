import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id, imageId } = await context.params
  const { data: gig } = await auth.db.from('gigs').select('provider_id, gallery_images').eq('id', id).single()
  if (!gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  const gallery = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
  const next = gallery.filter((image: any) => image.id !== imageId)
  const { data: updated, error } = await auth.db.from('gigs').update({ gallery_images: next, updated_at: new Date().toISOString() }).eq('id', id).select('*').single()
  if (error || !updated) return fail(error?.message || 'Could not remove image.', 500)
  return ok({ gig: updated })
}
