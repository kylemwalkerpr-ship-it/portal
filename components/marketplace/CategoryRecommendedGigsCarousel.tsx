'use client'

import React from 'react'
import { getCategoryFilterTerms } from '@/lib/categories'
import { GigCard } from './MarketplaceHero'
import styles from './CategoryRecommendedGigsCarousel.module.css'

type RecommendedGig = {
  id: string
  slug: string
  title: string
  pitch?: string
  category?: string | null
  subcategory?: string | null
  starting_price?: number
  avg_rating?: number
  review_count?: number
  order_count?: number
  provider?: {
    id?: string
    full_name?: string
    email?: string
    username?: string
  }
  provider_id?: string
  provider_type?: string
  provider_headshot_url?: string | null
  gallery_images?: Array<{ url: string }>
  cover_image_url?: string | null
  delivery_days?: number | null
  min_delivery_days?: number | null
  is_saved?: boolean
}

type CategoryRecommendedGigsCarouselProps = {
  categoryId: string
  fallbackCategoryId?: string
  displayName: string
}

const AUTO_ADVANCE_MS = 5200
const MANUAL_PAUSE_MS = 8000
const TARGET_GIGS = 10

function normalizeTaxonomyValue(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function isRelatedGig(gig: RecommendedGig, categoryId: string): boolean {
  const accepted = new Set(getCategoryFilterTerms(categoryId).map(normalizeTaxonomyValue))
  const category = normalizeTaxonomyValue(gig.category)
  const subcategory = normalizeTaxonomyValue(gig.subcategory)
  return Boolean((category && accepted.has(category)) || (subcategory && accepted.has(subcategory)))
}

async function requestGigs(
  categoryId: string,
  sort: 'trending' | 'best_rated' | 'most_orders',
  signal: AbortSignal,
): Promise<RecommendedGig[]> {
  const params = new URLSearchParams({
    category: categoryId,
    sort,
    limit: '12',
    page: '1',
  })
  const response = await fetch(`/api/marketplace/gigs?${params.toString()}`, {
    credentials: 'same-origin',
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Unable to load recommendations')
  const data = payload?.data ?? payload
  const gigs: RecommendedGig[] = Array.isArray(data?.gigs) ? data.gigs : []

  // The general discovery API intentionally includes uncategorized inventory so
  // sellers are not hidden while taxonomy backfills run. A recommendation rail
  // is a different contract: do not present an unclassified gig as related to a
  // category just because the listing API kept it visible.
  return gigs.filter((gig) => isRelatedGig(gig, categoryId))
}

function mergeUnique(existing: RecommendedGig[], incoming: RecommendedGig[]): RecommendedGig[] {
  const seen = new Set(existing.map((gig) => gig.id))
  const merged = [...existing]
  for (const gig of incoming) {
    if (!gig?.id || seen.has(gig.id)) continue
    seen.add(gig.id)
    merged.push(gig)
  }
  return merged
}

export function CategoryRecommendedGigsCarousel({
  categoryId,
  fallbackCategoryId,
  displayName,
}: CategoryRecommendedGigsCarouselProps) {
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const pausedRef = React.useRef(false)
  const resumeTimerRef = React.useRef<number | null>(null)
  const [gigs, setGigs] = React.useState<RecommendedGig[]>([])
  const [loading, setLoading] = React.useState(true)
  const [hasOverflow, setHasOverflow] = React.useState(false)

  const measure = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setHasOverflow(viewport.scrollWidth > viewport.clientWidth + 8)
  }, [])

  const scrollByCard = React.useCallback((direction: 1 | -1) => {
    const viewport = viewportRef.current
    if (!viewport) return
    const firstCard = viewport.querySelector<HTMLElement>('.ys-category-reco-slide')
    const gap = 18
    const step = (firstCard?.offsetWidth || Math.min(320, viewport.clientWidth * 0.82)) + gap
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    let next = viewport.scrollLeft + step * direction
    if (direction > 0 && next >= max - 4) next = 0
    if (direction < 0 && next <= 4) next = max
    viewport.scrollTo({ left: next, behavior: 'smooth' })
  }, [])

  const pauseTemporarily = React.useCallback(() => {
    pausedRef.current = true
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      pausedRef.current = false
      resumeTimerRef.current = null
    }, MANUAL_PAUSE_MS)
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setGigs([])

    ;(async () => {
      try {
        // Prefer genuinely top-performing gigs in the exact category. When a
        // narrow subcategory has thin inventory, backfill from its parent with
        // well-reviewed and most-ordered gigs rather than showing duplicate
        // taxonomy cards or unrelated Marketplace inventory.
        let ranked = await requestGigs(categoryId, 'trending', controller.signal)
        const fallback = fallbackCategoryId || categoryId

        if (ranked.length < 8) {
          ranked = mergeUnique(ranked, await requestGigs(fallback, 'best_rated', controller.signal))
        }
        if (ranked.length < 6) {
          ranked = mergeUnique(ranked, await requestGigs(fallback, 'most_orders', controller.signal))
        }

        if (!controller.signal.aborted) setGigs(ranked.slice(0, TARGET_GIGS))
      } catch {
        if (!controller.signal.aborted) setGigs([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [categoryId, fallbackCategoryId])

  React.useEffect(() => {
    measure()
    const viewport = viewportRef.current
    if (!viewport) return
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [gigs, loading, measure])

  React.useEffect(() => {
    if (!hasOverflow || gigs.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const interval = window.setInterval(() => {
      if (!pausedRef.current) scrollByCard(1)
    }, AUTO_ADVANCE_MS)

    return () => window.clearInterval(interval)
  }, [gigs.length, hasOverflow, scrollByCard])

  React.useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
  }, [])

  if (!loading && gigs.length === 0) return null

  return (
    <section className={styles.section} aria-labelledby="ys-category-recommended-gigs-title">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Recommended for you</p>
          <h2 id="ys-category-recommended-gigs-title" className={styles.title}>
            Recommended {displayName} gigs
          </h2>
          <p className={styles.subtitle}>
            Popular and well-reviewed services matched to this category.
          </p>
        </div>

        {hasOverflow ? (
          <div className={styles.controls} aria-label="Recommendation slideshow controls">
            <button
              type="button"
              className={styles.control}
              aria-label="Show previous recommended gig"
              onClick={() => {
                pauseTemporarily()
                scrollByCard(-1)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button
              type="button"
              className={styles.control}
              aria-label="Show next recommended gig"
              onClick={() => {
                pauseTemporarily()
                scrollByCard(1)
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
        ) : null}
      </div>

      <div
        ref={viewportRef}
        className={`${styles.viewport} ${!loading && gigs.length <= 4 ? styles.centerFew : ''}`}
        aria-label={`${displayName} recommended gigs`}
        onMouseEnter={() => { pausedRef.current = true }}
        onMouseLeave={() => { pausedRef.current = false }}
        onFocusCapture={() => { pausedRef.current = true }}
        onBlurCapture={() => { pausedRef.current = false }}
        onTouchStart={() => { pausedRef.current = true }}
        onTouchEnd={pauseTemporarily}
      >
        {loading
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className={`${styles.slide} ${styles.skeleton}`} aria-hidden="true">
                <div className={styles.skeletonMedia} />
                <div className={styles.skeletonLineShort} />
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLineMedium} />
              </div>
            ))
          : gigs.map((gig) => (
              <div key={gig.id} className={`${styles.slide} ys-category-reco-slide`}>
                <GigCard gig={gig} />
              </div>
            ))}
      </div>
    </section>
  )
}
