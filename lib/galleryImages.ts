/**
 * gallery_images normalization.
 *
 * Earlier versions of the gig builder pushed bare URL strings into the
 * gigs.gallery_images JSONB column instead of structured `{url, ...}`
 * objects. Every marketplace renderer reads `gallery_images[0]?.url`,
 * so for those gigs the cover image silently went missing on cards.
 *
 * This helper coerces every legal shape — string, `{url}`, `{src}`,
 * `{path}`, or arbitrary object — into a uniform `GalleryImage` object,
 * so callers never have to branch on the underlying representation.
 * Use on every API response that returns gigs.
 */

export interface GalleryImage {
  url: string
  id?: string
  path?: string
  name?: string
  size?: number
}

export function normalizeGalleryImage(entry: unknown): GalleryImage | null {
  if (entry == null) return null
  if (typeof entry === 'string') {
    const trimmed = entry.trim()
    return trimmed ? { url: trimmed } : null
  }
  if (typeof entry === 'object') {
    const obj = entry as Record<string, unknown>
    const url = (obj.url ?? obj.src ?? obj.path ?? obj.publicUrl) as unknown
    if (typeof url !== 'string' || !url.trim()) return null
    const out: GalleryImage = { url: url.trim() }
    if (typeof obj.id === 'string')   out.id   = obj.id
    if (typeof obj.path === 'string') out.path = obj.path
    if (typeof obj.name === 'string') out.name = obj.name
    if (typeof obj.size === 'number') out.size = obj.size
    return out
  }
  return null
}

export function normalizeGallery(value: unknown): GalleryImage[] {
  if (!Array.isArray(value)) return []
  const out: GalleryImage[] = []
  for (const entry of value) {
    const norm = normalizeGalleryImage(entry)
    if (norm) out.push(norm)
  }
  return out
}

export function resolveCoverUrl(gig: { gallery_images?: unknown; cover_image_url?: unknown } | null | undefined): string | null {
  if (!gig) return null
  if (typeof gig.cover_image_url === 'string' && gig.cover_image_url.trim()) {
    return gig.cover_image_url.trim()
  }
  const first = normalizeGallery(gig.gallery_images)[0]
  return first?.url || null
}
