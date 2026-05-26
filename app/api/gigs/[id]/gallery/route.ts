import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import { createSupabaseAdminClient } from '@/lib/supabase'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const db = createSupabaseAdminClient()
  const { data: gig, error } = await db
    .from('gigs')
    .select('gallery_images')
    .eq('id', id)
    .single()
  if (error) return fail(error.message, 500)
  return ok({ gallery: gig?.gallery_images ?? [] })
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)
  const { id } = await context.params
  const { data: gig } = await auth.db.from('gigs').select('provider_id, gallery_images').eq('id', id).single()
  if (!gig) return fail('Gig not found.', 404)
  if (gig.provider_id !== auth.profileId && auth.role !== 'admin') return fail('Forbidden.', 403)
  const gallery = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
  if (gallery.length >= 3) return fail('Maximum 3 gallery images.', 409)

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) return fail('Image is required.', 422)
  if (file.size > MAX_BYTES) return fail('Image must be 5 MB or less.', 422)
  if (file.type && !ALLOWED.has(file.type)) return fail('Use JPG, PNG, or WEBP.', 422)

  const safe = (file.name || 'gallery').replace(/[^a-zA-Z0-9._-]+/g, '').slice(0, 80)
  const path = `${auth.profileId}/${id}/${crypto.randomUUID()}-${safe}`
  const upload = await auth.db.storage.from('gig-gallery').upload(path, await file.arrayBuffer(), {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (upload.error) return fail(upload.error.message, 500)

  // Store the resolved public URL alongside the storage path so downstream
  // consumers (the wizard preview, the marketplace gig card, the seller
  // profile page) can render the image without re-resolving on every read.
  const { data: pub } = auth.db.storage.from('gig-gallery').getPublicUrl(path)
  const publicUrl = pub?.publicUrl || path
  const image = { id: crypto.randomUUID(), url: publicUrl, path, name: safe, size: file.size }
  const nextGallery = [...gallery, image]
  // First upload becomes the cover. Subsequent uploads append to the
  // gallery but don't change the cover unless the user explicitly
  // reorders via PATCH /api/gigs/[id]. This keeps the "Set as cover"
  // wizard control authoritative.
  const updatePayload: Record<string, any> = {
    gallery_images: nextGallery,
    updated_at: new Date().toISOString(),
  }
  if (nextGallery.length === 1) {
    updatePayload.cover_image_url = publicUrl
  }
  let updateResult = await auth.db
    .from('gigs')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .single()
  // Self-heal if cover_image_url column doesn't exist yet. PostgREST
  // can surface this as "Could not find the 'cover_image_url' column
  // ... in the schema cache" rather than the standard SQL message.
  if (updateResult.error && /cover_image_url/i.test(updateResult.error.message || '')) {
    const { cover_image_url: _drop, ...rest } = updatePayload
    updateResult = await auth.db.from('gigs').update(rest).eq('id', id).select('*').single()
  }
  if (updateResult.error || !updateResult.data) return fail(updateResult.error?.message || 'Could not save gallery image.', 500)
  return ok({ image, gig: updateResult.data }, { status: 201 })
}
