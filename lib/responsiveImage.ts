/**
 * Responsive image utilities for gig marketplace images.
 *
 * Generates optimized image URLs with width hints for responsive rendering.
 * Supports Supabase storage URL transformations for resizing and WebP format.
 *
 * Usage in components:
 *   <img
 *     src={responsiveUrl(image.url, 600)}
 *     srcSet={generateSrcSet(image.url)}
 *     sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
 *     loading="lazy"
 *     alt={title}
 *   />
 */

const SUPABASE_STORAGE_PATTERN = /storage\.supabase\.co\/.*\/object\/(public|authenticated)\//

/**
 * Applies width and format transformations to a Supabase storage URL.
 * Non-Supabase URLs are returned as-is.
 *
 * Supabase Storage supports on-the-fly image transformation via query params:
 *   ?width=300&height=200&resize=cover&format=webp
 */
export function responsiveUrl(url: string, width: number, format?: 'webp' | 'origin'): string {
  if (!url) return url

  // Only transform Supabase storage URLs
  if (!SUPABASE_STORAGE_PATTERN.test(url)) return url

  try {
    const parsed = new URL(url)
    // Use Supabase image transformation query params
    parsed.searchParams.set('width', String(width))
    parsed.searchParams.delete('height') // let the width dictate the size; maintain aspect ratio
    parsed.searchParams.set('resize', 'cover')

    if (format === 'webp') {
      parsed.searchParams.set('format', 'webp')
    }

    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Generates a srcSet string for responsive images.
 * Produces URLs at 480w, 768w, 1024w, and 1280w widths.
 */
export function generateSrcSet(url: string): string {
  if (!url || !SUPABASE_STORAGE_PATTERN.test(url)) return ''

  const widths = [480, 768, 1024, 1280]
  return widths
    .map((w) => `${responsiveUrl(url, w, 'webp')} ${w}w`)
    .join(', ')
}

/**
 * Generates a complete set of responsive image props for a gig image.
 * Returns { src, srcSet, sizes, loading } for direct spread onto an <img>.
 *
 * Priority-flagged images use 'eager' loading for LCP optimization.
 */
export function responsiveImageProps(url: string, title?: string, priority?: boolean) {
  return {
    src: responsiveUrl(url, 600),
    srcSet: generateSrcSet(url),
    sizes: '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw',
    loading: priority ? ('eager' as const) : ('lazy' as const),
    fetchpriority: priority ? ('high' as const) : undefined,
    alt: title || '',
  }
}
