/**
 * Responsive image utilities for gig marketplace images.
 *
 * IMPORTANT: Supabase Storage image transformations are NOT enabled on this
 * project. The `/storage/v1/render/image/...` endpoint returns 403
 * FeatureNotEnabled, and ordinary object URLs ignore `?width=&resize=&format=`
 * query params — the origin serves the same stored bytes either way.
 *
 * These helpers therefore never fabricate width/format variants. Uploads are
 * optimized client-side before storage instead (lib/marketplaceImageOptimization.ts),
 * and `generateSrcSet` returns an empty string because no real variant sources
 * exist to describe.
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

/**
 * Returns the stored object URL unchanged.
 *
 * Supabase image transformations are disabled on this project (403
 * FeatureNotEnabled), so appending `width`/`resize`/`format` params would
 * request a variant that does not exist. The `width` and `format` arguments
 * are kept for API compatibility but intentionally ignored.
 */
export function responsiveUrl(url: string, _width: number, _format?: 'webp' | 'origin'): string {
  return url
}

/**
 * Returns an empty string: no real image variant sources exist for stored
 * objects, so emitting width descriptors would be a false claim. Callers that
 * spread this onto an <img> still work — an empty srcSet is inert.
 */
export function generateSrcSet(_url: string): string {
  return ''
}

/**
 * Generates a complete set of image props for a gig image.
 * Returns { src, srcSet, sizes, loading, fetchpriority, alt } for direct spread
 * onto an <img>.
 *
 * `src` is the original stored URL, `srcSet` is empty (no fabricated variants),
 * and `sizes` is retained only for API-shape compatibility with existing
 * callers — it has no effect while `srcSet` is empty.
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
