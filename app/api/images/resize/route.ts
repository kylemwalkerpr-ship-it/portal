import { ok, fail } from '@/lib/apiEnvelope'
import { requirePortalUser } from '@/lib/portalAuth'
import sharp from 'sharp'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp'])

const SUPPORTED_DIMENSIONS: Record<string, { width: number; height: number; label: string }> = {
  'card': { width: 1200, height: 800, label: 'Marketplace card (3:2)' },
  'gallery': { width: 1200, height: 900, label: 'Gallery wide (4:3)' },
  'square': { width: 800, height: 800, label: 'Square (1:1)' },
  'landscape': { width: 1280, height: 720, label: 'Landscape (16:9)' },
  'portrait': { width: 900, height: 1200, label: 'Portrait (3:4)' },
}

/**
 * POST /api/images/resize
 *
 * Accepts a multipart upload with a single image file and optional `preset`
 * parameter. Resizes the image to the specified dimensions using sharp,
 * converts to WebP format, and uploads to the gig-gallery storage bucket.
 *
 * Body (multipart/form-data):
 *   - file: File (required) — JPG, PNG, or WEBP, max 10 MB
 *   - preset: string (optional) — 'card' (default), 'gallery', 'square', 'landscape', 'portrait'
 *   - width: number (optional) — custom width (overrides preset)
 *   - height: number (optional) — custom height (overrides preset)
 *   - gig_id: string (optional) — attach to an existing gig's gallery
 *
 * Returns the resized image URL and dimensions.
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

  // Resolve target dimensions from preset or custom width/height
  const preset = (form.get('preset') as string || 'card').toLowerCase()
  const customWidth = form.get('width') ? Number(form.get('width')) : null
  const customHeight = form.get('height') ? Number(form.get('height')) : null

  let targetWidth: number
  let targetHeight: number

  if (customWidth && customHeight) {
    targetWidth = Math.min(Math.round(customWidth), 2560)
    targetHeight = Math.min(Math.round(customHeight), 2560)
  } else if (SUPPORTED_DIMENSIONS[preset]) {
    targetWidth = SUPPORTED_DIMENSIONS[preset].width
    targetHeight = SUPPORTED_DIMENSIONS[preset].height
  } else {
    // Default to card dimensions
    targetWidth = 1200
    targetHeight = 800
  }

  // Process image with sharp
  const buffer = Buffer.from(await file.arrayBuffer())
  let processed: Buffer

  try {
    processed = await sharp(buffer)
      .resize(targetWidth, targetHeight, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: false,
      })
      .webp({ quality: 85, effort: 4 })
      .toBuffer()
  } catch (e: any) {
    return fail('Failed to process image: ' + (e.message || 'Unknown error'), 422)
  }

  // Upload to storage
  const safeName = (file.name || 'resized').replace(/[^a-zA-Z0-9._-]+/g, '').slice(0, 60)
  const ext = safeName.lastIndexOf('.') > 0 ? safeName.slice(safeName.lastIndexOf('.')) : '.jpg'
  const baseName = safeName.replace(/\.[^.]+$/, '')
  const path = `${auth.profileId}/resized/${crypto.randomUUID()}-${baseName}-${targetWidth}x${targetHeight}.webp`

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

  const upload = await auth.db.storage.from('gig-gallery').upload(path, processed, {
    contentType: 'image/webp',
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
          name: `${baseName}-${targetWidth}x${targetHeight}.webp`,
          size: processed.length,
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
    width: targetWidth,
    height: targetHeight,
    format: 'webp',
    size_bytes: processed.length,
    preset: customWidth && customHeight ? 'custom' : preset,
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
    presets: SUPPORTED_DIMENSIONS,
    max_file_size: MAX_BYTES,
    allowed_formats: Array.from(ALLOWED),
  })
}
