'use client'

import Link from 'next/link'
import React from 'react'
import { CATEGORIES, getCategoryById, getCategoryBySubcategoryId, getCategoryFilterTerms } from '@/lib/categories'
import { providerDisplayName } from '@/lib/providerDisplayName'
import { responsiveImageProps } from '@/lib/responsiveImage'
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

function isRelatedToAny(gig: RecommendedGig, categoryIds: string[]): boolean {
  return categoryIds.some((categoryId) => isRelatedGig(gig, categoryId))
}

async function requestGigs(
  categoryIds: string[],
  sort: 'trending' | 'best_rated' | 'most_orders',
  signal: AbortSignal,
): Promise<RecommendedGig[]> {
  const params = new URLSearchParams({ sort, limit: '18', page: '1' })
  categoryIds.forEach((categoryId) => params.append('category', categoryId))
  const response = await fetch(`/api/marketplace/gigs?${params.toString()}`, {
    credentials: 'same-origin',
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || 'Unable to load recommendations')
  const data = payload?.data ?? payload
  const gigs: RecommendedGig[] = Array.isArray(data?.gigs) ? data.gigs : []

  return gigs.filter((gig) => isRelatedToAny(gig, categoryIds))
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

const CATEGORY_AFFINITIES: Record<string, string[]> = {
  immigration: ['education', 'legal', 'settlement', 'credentials'],
  education: ['academic-writing', 'immigration', 'credentials', 'mentorship'],
  'academic-writing': ['education', 'career', 'mentorship'],
  legal: ['immigration', 'business', 'settlement'],
  settlement: ['immigration', 'career', 'business'],
  career: ['mentorship', 'credentials', 'education', 'academic-writing'],
  business: ['legal', 'career', 'mentorship'],
  credentials: ['education', 'career', 'immigration'],
  mentorship: ['career', 'education', 'business'],
}

function getRelatedCategoryIds(categoryId: string, fallbackCategoryId?: string): string[] {
  const parent = fallbackCategoryId
    ? getCategoryById(fallbackCategoryId)
    : getCategoryBySubcategoryId(categoryId) || getCategoryById(categoryId)
  const parentId = parent?.id || fallbackCategoryId || categoryId
  const siblings = parent
    ? [...parent.subcategories]
        .filter((subcategory) => subcategory.id !== categoryId)
        .sort((a, b) => Number(b.popular) - Number(a.popular) || a.order - b.order)
        .map((subcategory) => subcategory.id)
    : []
  const sameVertical = parent
    ? CATEGORIES.filter((category) => category.id !== parentId && category.vertical === parent.vertical)
        .sort((a, b) => Number(b.popular) - Number(a.popular) || a.order - b.order)
        .map((category) => category.id)
    : []
  const affinities = CATEGORY_AFFINITIES[parentId] || []

  return Array.from(new Set([...siblings, ...sameVertical, ...affinities]))
    .filter((candidate) => candidate && candidate !== categoryId && candidate !== parentId)
}

function CompactGigCard({ gig }: { gig: RecommendedGig }) {
  const imageUrl = gig.gallery_images?.[0]?.url || gig.cover_image_url
  const providerName = providerDisplayName(gig.provider, 'YouSafe Provider')
  const price = gig.starting_price ? Math.round(gig.starting_price / 100) : null
  const rating = gig.avg_rating && gig.review_count ? `${gig.avg_rating.toFixed(1)} (${gig.review_count})` : null
  const isAttorney = gig.provider_type === 'attorney'

  return (
    <Link href={`/gigs/${gig.slug}`} className={styles.gigCard} aria-label={`View ${gig.title}`}>
      {imageUrl ? (
        <img className={styles.gigImage} loading="lazy" {...responsiveImageProps(imageUrl, gig.title)} />
      ) : (
        <div className={styles.gigFallback} aria-hidden="true">{gig.title.slice(0, 2).toUpperCase()}</div>
      )}
      <div className={styles.gigShade} aria-hidden="true" />
      <div className={styles.gigBadge}>{isAttorney ? 'Licensed attorney' : 'Vetted consultant'}</div>
      <div className={styles.gigMeta}>
        <p className={styles.gigProvider}>{providerName}</p>
        <h3>{gig.title}</h3>
        <div className={styles.gigFooter}>
          <span>{rating ? `★ ${rating}` : 'New service'}</span>
          {price !== null ? <strong>From ${price}</strong> : null}
        </div>
      </div>
    </Link>
  )
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
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2
      const signedDistance = (slideCenter - viewportCenter) / Math.max(slide.offsetWidth + 16, 1)
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

      const scale = 1.055 - bounded * 0.075
      const translateY = bounded * 7
      const rotateY = Math.max(-6, Math.min(6, -signedDistance * 4.8))
      const opacity = 1 - bounded * 0.09
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
        const exact = await requestGigs([categoryId], 'trending', controller.signal)
        let ranked = exact.slice(0, 4)
        const relatedCategoryIds = getRelatedCategoryIds(categoryId, fallbackCategoryId)

        // Always reserve room for genuine alternatives. This keeps a narrow
        // category such as University Admissions from becoming a two-card echo
        // chamber when strong Graduate School, Scholarship, Essay/SOP or Test
        // Prep services are available nearby in the taxonomy.
        if (relatedCategoryIds.length > 0) {
          ranked = mergeUnique(ranked, await requestGigs(relatedCategoryIds.slice(0, 8), 'trending', controller.signal))
        }
        if (ranked.length < 8 && relatedCategoryIds.length > 0) {
          ranked = mergeUnique(ranked, await requestGigs(relatedCategoryIds.slice(0, 8), 'best_rated', controller.signal))
        }
        if (ranked.length < TARGET_GIGS && relatedCategoryIds.length > 0) {
          ranked = mergeUnique(ranked, await requestGigs(relatedCategoryIds.slice(0, 8), 'most_orders', controller.signal))
        }

        ranked = mergeUnique(ranked, exact.slice(4))
        const parentId = fallbackCategoryId || getCategoryBySubcategoryId(categoryId)?.id
        if (ranked.length < TARGET_GIGS && parentId && parentId !== categoryId) {
          ranked = mergeUnique(ranked, await requestGigs([parentId], 'most_orders', controller.signal))
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
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Matched to your search</p>
        <h2 id="ys-category-recommended-gigs-title" className={styles.title}>
          Recommended for you
        </h2>
        <p className={styles.subtitle}>
          Top {displayName} picks plus closely related services worth comparing.
        </p>

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

      <div className={styles.carouselArea}>
        <div
          ref={viewportRef}
          className={styles.viewport}
          role="region"
          aria-roledescription="carousel"
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
                </div>
              ))
            : gigs.map((gig, index) => (
                <div
                  key={gig.id}
                  className={`${styles.slide} ys-category-reco-slide`}
                  data-active={index === activeIndex ? 'true' : 'false'}
                >
                  <CompactGigCard gig={gig} />
                </div>
              ))}
        </div>
      </div>
    </section>
  )
}
