/**
 * marketplaceCategoryCounts — cached active-gig count for a category page.
 *
 * app/marketplace/categories/[categoryId]/page.tsx asks for this count twice
 * per request: once in generateMetadata (the "N services" title + empty-shelf
 * noindex decision) and once in the page body (the "N active services" hero
 * badge + empty-shelf copy). Both callers now share one versioned KV entry,
 * keyed per category id, so the second read never repeats the COUNT.
 *
 * The entry lives in the `gigs` namespace — the same one the listing API and
 * the landing use — so every publish/pause/moderate (bumpCacheVersion('gigs'))
 * invalidates it alongside the rest of the marketplace caches. getCached and
 * setCached are fail-open: a KV miss or error simply falls through to a fresh
 * COUNT, and a failed write never breaks the page.
 *
 * A DB/query failure is deliberately NOT cached: callers receive 0 so the page
 * still renders, but the next request retries instead of serving a false
 * "0 active services" (and a noindex title) for the whole TTL.
 */

import { getCached, setCached, generateVersionedCacheKey } from '@/lib/cache'
import { buildCategoryOrFilter } from '@/lib/categories'
import { createSupabaseAdminClient } from '@/lib/supabase'

export const CATEGORY_COUNT_CACHE_TTL_SECONDS = 300
export const CATEGORY_COUNT_CACHE_PATH = '/cache/category-count'

/** A real count is a finite, non-negative number — anything else is a miss. */
export function isCategoryCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Read the cached active count. null = miss, malformed entry, or KV error. */
export async function getCachedCategoryCount(filterId: string): Promise<number | null> {
  const cacheKey = await generateVersionedCacheKey('gigs', CATEGORY_COUNT_CACHE_PATH, filterId)
  const cached = await getCached<number>(cacheKey, CATEGORY_COUNT_CACHE_TTL_SECONDS)
  return isCategoryCount(cached) ? cached : null
}

/** Write a successful COUNT. Failures are never persisted (see module docs). */
export async function setCachedCategoryCount(filterId: string, count: number): Promise<void> {
  const cacheKey = await generateVersionedCacheKey('gigs', CATEGORY_COUNT_CACHE_PATH, filterId)
  await setCached(cacheKey, count, CATEGORY_COUNT_CACHE_TTL_SECONDS)
}

/**
 * Live COUNT of active gigs in a category/subcategory filter id. Mirrors the
 * old inline query exactly: status=active plus the taxonomy OR-filter.
 * Returns null on failure so the caller can distinguish failure from 0.
 */
export async function computeActiveGigsForCategory(filterId: string): Promise<number | null> {
  try {
    const db = createSupabaseAdminClient()
    let query = db
      .from('gigs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
    const categoryOr = buildCategoryOrFilter([filterId])
    if (categoryOr) query = query.or(categoryOr)
    const { count, error } = await query
    if (error) return null
    return typeof count === 'number' ? count : 0
  } catch {
    return null
  }
}

/**
 * Cached active-gig count for a category/subcategory filter id. Metadata and
 * page body both call this and share the same KV entry. Returns 0 on failure
 * (the page renders its empty-shelf copy) without caching the failure.
 */
export async function countActiveGigsForCategory(filterId: string): Promise<number> {
  const cached = await getCachedCategoryCount(filterId)
  if (cached != null) return cached

  const fresh = await computeActiveGigsForCategory(filterId)
  if (fresh == null) return 0

  await setCachedCategoryCount(filterId, fresh)
  return fresh
}
