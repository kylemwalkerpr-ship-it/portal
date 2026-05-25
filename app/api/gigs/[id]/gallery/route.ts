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
  if (gallery.length >= 5) return fail('Maximum 5 gallery images.', 409)

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
  const { data: updated, error } = await auth.db
    .from('gigs')
    .update({ gallery_images: [...gallery, image], updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !updated) return fail(error?.message || 'Could not save gallery image.', 500)
  return ok({ image, gig: updated }, { status: 201 })
}
