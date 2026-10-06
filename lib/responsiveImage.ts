/**
 * Responsive image utilities for gig marketplace images.
 *
 * Supabase Storage transforms are NOT enabled (render/image → 403). Delivery
 * instead goes through lib/marketplaceDeliveryImage.ts: a same-origin media
 * proxy plus Cloudflare Image Resizing (`/cdn-cgi/image/…`) on the market zone,
 * which rejects absolute Supabase URLs but resizes same-origin paths.
 *
 * Usage:
 *   <img {...responsiveImageProps(image.url, title)} />
 */

import { deliveryImageUrl, marketplaceMediaProxyPath } from '@/lib/marketplaceDeliveryImage'

const SRCSET_WIDTHS = [320, 480, 720, 960] as const

/**
 * Display URL at the requested width. Supabase public objects are rewritten to
 * the marketplace media proxy (+ CF resize in production). Other URLs pass
 * through unchanged.
 */
export function responsiveUrl(url: string, width: number, _format?: 'webp' | 'origin'): string {
  if (!url) return url
  return deliveryImageUrl(url, { width }) ?? url
}

/**
 * Real width descriptors when the URL is a proxyable Supabase public object.
 * Empty for every other host (no fabricated variants).
 */
export function generateSrcSet(url: string): string {
  if (!url || !marketplaceMediaProxyPath(url)) return ''
  return SRCSET_WIDTHS.map((w) => `${deliveryImageUrl(url, { width: w })} ${w}w`).join(', ')
}

/**
 * Complete <img> props for a gig image.
 * Priority-flagged images use eager loading for LCP.
 */
export function responsiveImageProps(url: string, title?: string, priority?: boolean) {
  return {
    src: responsiveUrl(url, priority ? 720 : 480),
    srcSet: generateSrcSet(url),
    sizes: '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw',
    loading: priority ? ('eager' as const) : ('lazy' as const),
    decoding: 'async' as const,
    fetchpriority: priority ? ('high' as const) : undefined,
    alt: title || '',
  }
}
