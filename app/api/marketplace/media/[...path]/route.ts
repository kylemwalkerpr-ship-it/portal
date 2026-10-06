import {
  MARKETPLACE_MEDIA_BUCKETS,
  type MarketplaceMediaBucket,
} from '@/lib/marketplaceDeliveryImage'

export const runtime = 'nodejs'

const UPSTREAM_HOST_SUFFIX = '.supabase.co'
const PUBLIC_PREFIX = '/storage/v1/object/public/'
const MAX_BYTES = 8 * 1024 * 1024
const CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800'

function supabaseOrigin(): string | null {
  const raw = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '')
  if (!raw) return null
  try {
    const host = new URL(raw).hostname
    if (!host.endsWith(UPSTREAM_HOST_SUFFIX)) return null
    return raw
  } catch {
    return null
  }
}

function isAllowedBucket(bucket: string): bucket is MarketplaceMediaBucket {
  return (MARKETPLACE_MEDIA_BUCKETS as readonly string[]).includes(bucket)
}

/**
 * GET /api/marketplace/media/<bucket>/<…object path>
 *
 * Streams an allowlisted Supabase public object through the market/portal
 * origin so Cloudflare Image Resizing can shrink it via
 * `/cdn-cgi/image/…/api/marketplace/media/…` (remote Supabase URLs 403).
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params
  if (!Array.isArray(path) || path.length < 2) {
    return new Response('Not found', { status: 404 })
  }

  const segments = path.map((part) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  })
  if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('\\') || s.includes('\0'))) {
    return new Response('Not found', { status: 404 })
  }

  const bucket = segments[0]
  if (!isAllowedBucket(bucket)) {
    return new Response('Not found', { status: 404 })
  }

  const origin = supabaseOrigin()
  if (!origin) {
    return new Response('Media origin unavailable', { status: 503 })
  }

  const objectPath = segments.map((s) => encodeURIComponent(s)).join('/')
  const upstream = `${origin}${PUBLIC_PREFIX}${objectPath}`

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstream, {
      // Public objects only — never forward cookies/auth.
      headers: { Accept: 'image/*,*/*' },
      redirect: 'follow',
    })
  } catch {
    return new Response('Upstream fetch failed', { status: 502 })
  }

  if (!upstreamRes.ok) {
    return new Response('Not found', { status: upstreamRes.status === 404 ? 404 : 502 })
  }

  const contentType = upstreamRes.headers.get('content-type') || ''
  if (contentType && !contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
    return new Response('Unsupported media type', { status: 415 })
  }

  const contentLength = Number(upstreamRes.headers.get('content-length') || 0)
  if (contentLength > MAX_BYTES) {
    return new Response('Payload too large', { status: 413 })
  }

  const headers = new Headers()
  headers.set('Cache-Control', CACHE_CONTROL)
  headers.set('Content-Type', contentType || 'application/octet-stream')
  if (contentLength > 0) headers.set('Content-Length', String(contentLength))
  headers.set('X-Content-Type-Options', 'nosniff')
  // Allow CF image resizing / cross-subdomain <img> on market + portal.
  headers.set('Access-Control-Allow-Origin', '*')

  return new Response(upstreamRes.body, { status: 200, headers })
}
