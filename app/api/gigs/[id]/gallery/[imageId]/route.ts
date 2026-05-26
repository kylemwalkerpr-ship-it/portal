import { ok, fail } from '@/lib/apiEnvelope'
import { resolveCoverUrl } from '@/lib/galleryImages'
import { requirePortalUser } from '@/lib/portalAuth'

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; imageId: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id, imageId } = await context.params
  const { data: gig } = await auth.db.from('gigs').select('provider_id, gallery_images, cover_image_url').eq('id', id).single()
  if (!gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  const gallery = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
  const next = gallery.filter((image: any) => image.id !== imageId)

  // Re-resolve the cover. If the deleted image was the cover, fall back
  // to whatever is now at index 0 (or null if the gallery is empty).
  // Without this, the public card would keep rendering a 404'd URL.
  const updatePayload: Record<string, any> = {
    gallery_images: next,
    cover_image_url: resolveCoverUrl({ gallery_images: next }),
    updated_at: new Date().toISOString(),
  }
  let updateResult = await auth.db.from('gigs').update(updatePayload).eq('id', id).select('*').single()
  if (updateResult.error && /column .*cover_image_url/i.test(updateResult.error.message || '')) {
    const { cover_image_url: _drop, ...rest } = updatePayload
    updateResult = await auth.db.from('gigs').update(rest).eq('id', id).select('*').single()
  }
  if (updateResult.error || !updateResult.data) return fail(updateResult.error?.message || 'Could not remove image.', 500)
  return ok({ gig: updateResult.data })
}
