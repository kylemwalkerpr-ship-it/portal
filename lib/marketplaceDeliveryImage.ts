/**
 * Same-origin delivery for Supabase public marketplace images.
 *
 * Supabase Storage transforms are disabled on this project (render/image → 403).
 * Cloudflare Image Resizing IS enabled on the market zone for same-origin
 * assets (`/cdn-cgi/image/.../logo.png` returns cf-resized), but absolute
 * Supabase URLs are rejected (`cf-not-resized` 403).
 *
 * Strategy: rewrite allowlisted public object URLs to
 *   /api/mm/<bucket>/...
 * then wrap with `/cdn-cgi/image/w=…,q=…,f=auto…` in production
 * so cards/avatars download display-sized bytes instead of 80–180 KB originals.
 */

export const MARKETPLACE_MEDIA_PROXY_PREFIX = '/api/mm/'

/** Public buckets the marketplace is allowed to reverse-proxy. */
export const MARKETPLACE_MEDIA_BUCKETS = [
  'gig-gallery',
  'attorney-headshots',
  'consultant-avatars',
] as const

const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/'

export type MarketplaceMediaBucket = (typeof MARKETPLACE_MEDIA_BUCKETS)[number]

export interface DeliveryImageOptions {
  /** Target CSS display width in px (2x DPR is applied by the caller when needed). */
  width: number
  /** Cloudflare quality 1–100. Default 70 for cards; use ~60 for tiny avatars. */
  quality?: number
}

function isAllowedBucket(bucket: string): bucket is MarketplaceMediaBucket {
  return (MARKETPLACE_MEDIA_BUCKETS as readonly string[]).includes(bucket)
}

/**
 * Extract `<bucket>/<object…>` from a Supabase public object URL, or null when
 * the URL is not a proxyable marketplace public object.
 */
export function supabasePublicObjectPath(url: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (!parsed.hostname.endsWith('.supabase.co')) return null
    if (!parsed.pathname.startsWith(PUBLIC_OBJECT_PREFIX)) return null
    const objectPath = decodeURIComponent(parsed.pathname.slice(PUBLIC_OBJECT_PREFIX.length))
    if (!objectPath || objectPath.includes('..') || objectPath.includes('\\')) return null
    const bucket = objectPath.split('/')[0] || ''
    if (!isAllowedBucket(bucket)) return null
    // Require at least bucket + one path segment (no bucket-root listing).
    if (!objectPath.includes('/')) return null
    return objectPath
  } catch {
    return null
  }
}

/** Same-origin proxy path for a Supabase public object URL, or null. */
export function marketplaceMediaProxyPath(url: string): string | null {
  const objectPath = supabasePublicObjectPath(url)
  if (!objectPath) return null
  // Encode each segment so spaces / @ stay valid in a URL path.
  const encoded = objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${MARKETPLACE_MEDIA_PROXY_PREFIX}${encoded}`
}

/**
 * Whether to wrap the proxy path with Cloudflare Image Resizing.
 * Off in tests and when NEXT_PUBLIC_CF_IMAGE_RESIZE=0 (local wrangler without
 * the zone). On for production builds that ship to the market/portal zones.
 */
export function shouldUseCloudflareImageResize(): boolean {
  const flag = (process.env.NEXT_PUBLIC_CF_IMAGE_RESIZE || '').trim()
  if (flag === '0' || flag.toLowerCase() === 'false') return false
  if (flag === '1' || flag.toLowerCase() === 'true') return true
  if (process.env.NODE_ENV === 'test') return false
  return process.env.NODE_ENV === 'production'
}

function clampWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 420
  return Math.max(16, Math.min(2400, Math.round(width)))
}

function clampQuality(quality: number | undefined): number {
  if (quality == null || !Number.isFinite(quality)) return 70
  return Math.max(30, Math.min(90, Math.round(quality)))
}

/**
 * Display URL for a marketplace image. Supabase public objects become
 * same-origin proxied (+ CF-resized in production). Every other URL is
 * returned unchanged for the caller to handle (Payhip/Pexels/etc.).
 */
export function deliveryImageUrl(
  url: string | null | undefined,
  options: DeliveryImageOptions,
): string | null {
  if (!url) return null
  const proxy = marketplaceMediaProxyPath(url)
  if (!proxy) return url
  if (!shouldUseCloudflareImageResize()) return proxy
  const width = clampWidth(options.width)
  const quality = clampQuality(options.quality)
  return `/cdn-cgi/image/w=${width},q=${quality},f=auto${proxy}`
}

/** True when an error is PostgREST's out-of-range page response. */
export function isPostgrestRangeNotSatisfiable(error: {
  message?: string
  code?: string
  details?: string
} | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code || '')
  if (code === 'PGRST103') return true
  const haystack = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  return haystack.includes('range not satisfiable') || haystack.includes('requested range not satisfiable')
}
