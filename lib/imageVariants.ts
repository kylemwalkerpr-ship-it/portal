/**
 * Display-size image variants for CDNs that resize on the fly.
 *
 * Sanitization P9 (image compression): Market cards render at <=420 CSS px but
 * were pulling full-size Payhip (~100 KB each) and Pexels (w=1200) originals.
 * Payhip / Pexels / Unsplash keep their native resize APIs. Supabase public
 * objects go through lib/marketplaceDeliveryImage.ts (same-origin proxy +
 * Cloudflare Image Resizing) because Supabase transforms are disabled and
 * absolute Supabase URLs 403 on `/cdn-cgi/image`.
 */

import { deliveryImageUrl } from '@/lib/marketplaceDeliveryImage'

const PAYHIP_RESIZE = /^https:\/\/payhip\.com\/cdn-cgi\/image\/([^/]+)\/(https:\/\/.+)$/

export function sizedImageUrl(url: string | null | undefined, width: number): string | null {
  if (!url) return null
  const payhip = PAYHIP_RESIZE.exec(url)
  if (payhip) {
    const opts = payhip[1]
      .split(',')
      .filter((o) => o && !/^(width|w|quality|q)=/.test(o))
    if (!opts.some((o) => o.startsWith('format='))) opts.unshift('format=auto')
    opts.push(`width=${width}`, 'quality=80')
    return `https://payhip.com/cdn-cgi/image/${opts.join(',')}/${payhip[2]}`
  }
  try {
    const u = new URL(url)
    if (u.hostname === 'images.pexels.com' || u.hostname === 'images.unsplash.com') {
      u.searchParams.set('w', String(width))
      if (u.hostname === 'images.unsplash.com') {
        u.searchParams.set('auto', 'format')
        u.searchParams.set('q', '75')
      } else {
        u.searchParams.set('auto', 'compress')
      }
      return u.toString()
    }
  } catch {
    // not an absolute URL; leave untouched below
  }
  return deliveryImageUrl(url, { width }) ?? url
}
