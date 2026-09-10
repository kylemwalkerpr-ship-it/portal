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
  const interactionPausedRef = React.useRef(false)
  const manualPausedRef = React.useRef(false)
  const resumeTimerRef = React.useRef<number | null>(null)
  const scrollRafRef = React.useRef<number | null>(null)
  const activeIndexRef = React.useRef(0)
  const autoDirectionRef = React.useRef<1 | -1>(1)
  const [gigs, setGigs] = React.useState<RecommendedGig[]>([])
  const [loading, setLoading] = React.useState(true)
  const [hasOverflow, setHasOverflow] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)

  const setCenteredIndex = React.useCallback((index: number) => {
    activeIndexRef.current = index
    setActiveIndex((current) => (current === index ? current : index))
  }, [])

  const syncBeltState = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const slides = Array.from(viewport.querySelectorAll<HTMLElement>('.ys-category-reco-slide'))
    if (slides.length === 0) return

    const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let closestIndex = 0
    let closestDistance = Number.POSITIVE_INFINITY

    slides.forEach((slide, index) => {
      // Use untransformed layout geometry rather than getBoundingClientRect().
      // The card's own scale must not feed back into the distance calculation
      // and cause the centre focus to wobble while the belt settles.
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
      const signedDistance = (slideCenter - viewportCenter) / Math.max(slide.offsetWidth + 18, 1)
      const distance = Math.abs(signedDistance)
      const bounded = Math.min(distance, 1.6)
      const pixelDistance = Math.abs(slideCenter - viewportCenter)

      if (pixelDistance < closestDistance) {
        closestDistance = pixelDistance
        closestIndex = index
      }

      if (reduceMotion) {
        slide.style.setProperty('--ys-belt-scale', '1')
        slide.style.setProperty('--ys-belt-y', '0px')
        slide.style.setProperty('--ys-belt-rotate', '0deg')
        slide.style.setProperty('--ys-belt-opacity', '1')
        return
      }

      // The visual hierarchy follows the physical distance from the viewport
      // centre, so dragging feels like a belt/wheel rather than a row of cards
      // with a single class suddenly toggling at the snap point.
      const scale = 1.045 - bounded * 0.064
      const translateY = bounded * 7
      const rotateY = Math.max(-5, Math.min(5, -signedDistance * 4))
      const opacity = 1 - bounded * 0.055
      slide.style.setProperty('--ys-belt-scale', scale.toFixed(3))
      slide.style.setProperty('--ys-belt-y', `${translateY.toFixed(1)}px`)
      slide.style.setProperty('--ys-belt-rotate', `${rotateY.toFixed(2)}deg`)
      slide.style.setProperty('--ys-belt-opacity', opacity.toFixed(3))
    })

    slides.forEach((slide, index) => {
      slide.dataset.active = index === closestIndex ? 'true' : 'false'
    })
    setCenteredIndex(closestIndex)
  }, [setCenteredIndex])

  const scheduleBeltSync = React.useCallback(() => {
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      syncBeltState()
    })
  }, [syncBeltState])

  const measure = React.useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    setHasOverflow(viewport.scrollWidth > viewport.clientWidth + 8)
    scheduleBeltSync()
  }, [scheduleBeltSync])

  const scrollToIndex = React.useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const viewport = viewportRef.current
    if (!viewport) return
    const slides = Array.from(viewport.querySelectorAll<HTMLElement>('.ys-category-reco-slide'))
    if (slides.length === 0) return

    const boundedIndex = Math.max(0, Math.min(slides.length - 1, index))
    const target = slides[boundedIndex]
    const centeredLeft = target.offsetLeft - (viewport.clientWidth - target.offsetWidth) / 2
    viewport.scrollTo({ left: Math.max(0, centeredLeft), behavior })
    setCenteredIndex(boundedIndex)
    scheduleBeltSync()
  }, [scheduleBeltSync, setCenteredIndex])

  const scrollByCard = React.useCallback((direction: 1 | -1) => {
    if (gigs.length < 2) return
    const next = Math.max(0, Math.min(gigs.length - 1, activeIndexRef.current + direction))
    if (next !== activeIndexRef.current) scrollToIndex(next)
  }, [gigs.length, scrollToIndex])

  const pauseTemporarily = React.useCallback(() => {
    manualPausedRef.current = true
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      manualPausedRef.current = false
      resumeTimerRef.current = null
    }, MANUAL_PAUSE_MS)
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setGigs([])
    setCenteredIndex(0)
    autoDirectionRef.current = 1

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
  }, [categoryId, fallbackCategoryId, setCenteredIndex])

  React.useEffect(() => {
    if (loading || gigs.length === 0) return
    const frame = window.requestAnimationFrame(() => {
      measure()
      // Start one card in when possible so the first paint already communicates
      // the centred belt treatment, with neighbouring recommendations visible.
      scrollToIndex(gigs.length >= 3 ? 1 : 0, 'auto')
      syncBeltState()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [gigs.length, loading, measure, scrollToIndex, syncBeltState])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const onResize = () => {
      window.requestAnimationFrame(() => {
        measure()
        scrollToIndex(activeIndexRef.current, 'auto')
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure, scrollToIndex])

  React.useEffect(() => {
    if (!hasOverflow || gigs.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const interval = window.setInterval(() => {
      if (interactionPausedRef.current || manualPausedRef.current) return

      let direction = autoDirectionRef.current
      const current = activeIndexRef.current
      if (current >= gigs.length - 1) direction = -1
      if (current <= 0) direction = 1
      autoDirectionRef.current = direction
      scrollByCard(direction)
    }, AUTO_ADVANCE_MS)

    return () => window.clearInterval(interval)
  }, [gigs.length, hasOverflow, scrollByCard])

  React.useEffect(() => () => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
    if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current)
  }, [])

  if (!loading && gigs.length === 0) return null

  return (
    <section className={styles.section} aria-labelledby="ys-category-recommended-gigs-title">
      <div className={styles.headingRow}>
        <div className={styles.headingCopy}>
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
              disabled={activeIndex <= 0}
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
              disabled={activeIndex >= gigs.length - 1}
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
        className={styles.viewport}
        aria-label={`${displayName} recommended gigs`}
        onScroll={scheduleBeltSync}
        onMouseEnter={() => { interactionPausedRef.current = true }}
        onMouseLeave={() => { interactionPausedRef.current = false }}
        onFocusCapture={() => { interactionPausedRef.current = true }}
        onBlurCapture={() => { interactionPausedRef.current = false }}
        onTouchStart={() => { interactionPausedRef.current = true }}
        onTouchEnd={() => {
          interactionPausedRef.current = false
          pauseTemporarily()
          scheduleBeltSync()
        }}
      >
        {loading
          ? Array.from({ length: 3 }, (_, index) => (
              <div key={index} className={`${styles.slide} ${styles.skeleton}`} aria-hidden="true">
                <div className={styles.skeletonMedia} />
                <div className={styles.skeletonLineShort} />
                <div className={styles.skeletonLine} />
                <div className={styles.skeletonLineMedium} />
              </div>
            ))
          : gigs.map((gig, index) => (
              <div
                key={gig.id}
                className={`${styles.slide} ys-category-reco-slide`}
                data-active={index === activeIndex ? 'true' : 'false'}
              >
                <GigCard gig={gig} />
              </div>
            ))}
      </div>
    </section>
  )
}
