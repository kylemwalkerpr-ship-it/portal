import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * POST /api/images/resize
 *
 * Accepts a multipart upload with a single image file and optional metadata.
 * The image is uploaded to the gig-gallery storage bucket as-is.
 * Supabase Storage supports on-the-fly image transformation via URL query
 * params (?width=...&resize=cover&format=webp), so server-side sharp
 * processing is not needed — clients can request different sizes at render
 * time via the responsiveImageProps utility in lib/responsiveImage.ts.
 *
 * Body (multipart/form-data):
 *   - file: File (required) — JPG, PNG, or WEBP, max 10 MB
 *   - preset: string (optional) — 'card' (default), 'gallery', 'square', 'landscape', 'portrait'
 *   - width: number (optional) — original crop width
 *   - height: number (optional) — original crop height
 *   - gig_id: string (optional) — attach to an existing gig's gallery
 *
 * Returns the image URL and original dimensions.
 */
export async function POST(req: Request) {
  const auth = await requirePortalUser()
  if ('error' in auth) return fail(auth.error, auth.status)

  const form = await req.formData().catch(() => null)
  if (!form) return fail('Expected multipart/form-data.', 400)

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return fail('Image file is required.', 422)
  if (file.size > MAX_BYTES) return fail('Image must be 10 MB or less.', 422)
  if (file.type && !ALLOWED.has(file.type)) return fail('Use JPG, PNG, or WEBP.', 422)

  const preset = (form.get('preset') as string || 'card').toLowerCase()
  const originalWidth = form.get('width') ? Number(form.get('width')) : null
  const originalHeight = form.get('height') ? Number(form.get('height')) : null

  // Upload original file to storage
  const safeName = (file.name || 'resized').replace(/[^a-zA-Z0-9._-]+/g, '').slice(0, 60)
  const baseName = safeName.replace(/\.[^.]+$/, '')
  const ext = file.name?.split('.').pop() || 'jpg'
  const dims = originalWidth && originalHeight ? `${originalWidth}x${originalHeight}` : preset
  const path = `${auth.profileId}/resized/${crypto.randomUUID()}-${baseName}-${dims}.${ext}`

  // Self-heal the gig-gallery bucket if needed
  try {
    const { data: existing } = await auth.db.storage.getBucket('gig-gallery')
    if (!existing) {
      await auth.db.storage.createBucket('gig-gallery', { public: true })
    } else if (!existing.public) {
      await auth.db.storage.updateBucket('gig-gallery', { public: true })
    }
  } catch (e) {
    console.warn('[images/resize] bucket self-heal skipped', (e as any)?.message)
  }

  const upload = await auth.db.storage.from('gig-gallery').upload(path, await file.arrayBuffer(), {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  })
  if (upload.error) return fail(upload.error.message, 500)

  const { data: pub } = auth.db.storage.from('gig-gallery').getPublicUrl(path)
  const publicUrl = pub?.publicUrl || path

  // Optionally attach to a gig's gallery
  const gigId = form.get('gig_id') as string | null
  if (gigId) {
    const { data: gig } = await auth.db
      .from('gigs')
      .select('gallery_images, provider_id, cover_image_url')
      .eq('id', gigId)
      .single()
    if (gig) {
      if (gig.provider_id === auth.profileId || (auth as any).role === 'admin') {
        const image = {
          id: crypto.randomUUID(),
          url: publicUrl,
          path,
          name: `${baseName}-${dims}.${ext}`,
          size: file.size,
        }
        const gallery = Array.isArray(gig.gallery_images) ? gig.gallery_images : []
        const nextGallery = [...gallery, image]
        const updatePayload: Record<string, any> = {
          gallery_images: nextGallery,
          updated_at: new Date().toISOString(),
        }
        if (nextGallery.length === 1) {
          updatePayload.cover_image_url = publicUrl
        }
        await auth.db.from('gigs').update(updatePayload).eq('id', gigId)
      }
    }
  }

  return ok({
    url: publicUrl,
    width: originalWidth || 0,
    height: originalHeight || 0,
    format: file.type?.split('/').pop() || 'webp',
    size_bytes: file.size,
    preset: originalWidth && originalHeight ? 'custom' : preset,
  }, { status: 201 })
}

/**
 * GET /api/images/resize
 *
 * Returns supported resize presets and their dimensions.
 * Useful for populating UI dropdowns in the gallery manager.
 */
export async function GET() {
  return ok({
    presets: {
      card: { width: 1200, height: 800, label: 'Marketplace card (3:2)' },
      gallery: { width: 1200, height: 900, label: 'Gallery wide (4:3)' },
      square: { width: 800, height: 800, label: 'Square (1:1)' },
      landscape: { width: 1280, height: 720, label: 'Landscape (16:9)' },
      portrait: { width: 900, height: 1200, label: 'Portrait (3:4)' },
    },
    max_file_size: MAX_BYTES,
    allowed_formats: Array.from(ALLOWED),
  })
}
