'use client'

// FeaturedBriefsGrid — the landing's "recommended briefs" grid.
//
// Hybrid of the two standard browsing models:
//  - Upwork-style **Load more**: appends the next page of cards in place,
//    no reload — cards accumulate.
//  - Fiverr-style **pager** (← Prev · 1 2 3 … · Next →): jumps the viewport
//    to the start of that page's window and grows/shrinks the grid to match,
//    so "page 3" always looks like Fiverr's page 3.
//
// All data arrives via props (the server already fetched the full ranked
// slice), so paging is pure client state — zero extra fetches. Pager chips
// keep real `href`s (crawlable, middle-clickable) but intercept clicks to
// avoid a full reload, then smooth-scroll to the grid.

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import {
  avatarBgFor,
  clampPage,
  COUNTRY_META,
  deepLinkVisibleCount,
  deliveryLabel,
  FEATURED_PAGE_SIZE,
  formatPrice,
  glyphFor,
  initialsOf,
  pageStartIndex,
  pagerChipStyle,
  totalPagesFor,
  withCountry,
  type Country,
  type JxCode,
  type LandingGig,
} from '@/lib/marketplaceDisplay'
import { LEGACY_CATEGORY_MAP, normalizeCategory } from '@/lib/categories'
import { T, F } from '@/components/marketplace/tokens'

interface Props {
  gigs: LandingGig[]
  /** Cards visible on first paint — server clamps ?page=N so SSR matches the URL. */
  initialVisible: number
  country: Country
  currency: string
}

export function FeaturedBriefsGrid({ gigs, initialVisible, country, currency }: Props) {
  const total = gigs.length
  const totalPages = totalPagesFor(total)

  // visibleCount is always a multiple of PAGE_SIZE (clamped to total).
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(Math.max(FEATURED_PAGE_SIZE, initialVisible), total || FEATURED_PAGE_SIZE),
  )
  // First card index (0-based) to scroll to after the next render.
  const [scrollToIdx, setScrollToIdx] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

  // Deep-linked ?page=N: the server SSRs pages 1..N cumulatively, so on
  // first paint the client scrolls straight to the first card of page N
  // (clearing the sticky shell header via scroll-margin-top). In-app page
  // changes scroll via jumpToPage instead — this effect must not re-fire
  // for those, hence the null-once reset in the effect below.
  const didMountRef = useRef(false)
  useEffect(() => {
    if (didMountRef.current) return
    didMountRef.current = true
    const targetIdx = pageStartIndex(Math.round(initialVisible / FEATURED_PAGE_SIZE), total)
    if (targetIdx > 0 && initialVisible > 0) setScrollToIdx(targetIdx)
  }, [initialVisible, total])

  const deepestPage = clampPage(Math.floor((visibleCount - 1) / FEATURED_PAGE_SIZE) + 1, total)

  useEffect(() => {
    if (scrollToIdx == null) return
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-idx="${scrollToIdx}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setScrollToIdx(null)
  }, [scrollToIdx])

  const jumpToPage = (p: number) => (e: MouseEvent) => {
    e.preventDefault()
    const target = clampPage(p, total)
    setVisibleCount(Math.min(target * FEATURED_PAGE_SIZE, total))
    // Page 1 → top of the grid itself; deeper pages → first card of the page.
    setScrollToIdx(target === 1 ? 0 : pageStartIndex(target, total))
  }

  const loadMore = () => {
    setVisibleCount((c) => Math.min(c + FEATURED_PAGE_SIZE, total))
  }

  const shown = gigs.slice(0, visibleCount)
  const hasMore = visibleCount < total

  return (
    <>
      <div className="gig-grid" id="featured-grid" ref={gridRef}>
        {shown.map((g, idx) => {
          const tag = `${(g.jx ?? country === 'all' ? (g.jx ?? 'us') : country).toUpperCase()} · ${(g.category ?? 'Brief').replace(/Services?$/i, '').trim()}`
          const proLabel = g.provider_type === 'attorney' ? 'J.D.' : 'Reg.'
          const cardCountry = g.jx ?? (country !== 'all' ? country : 'us')
          const localCurrency = COUNTRY_META[cardCountry as JxCode]?.currency ?? currency
          const href = g.slug
            ? `/marketplace/gigs/${g.slug}`
            : withCountry(`/marketplace?category=${g.category ? (LEGACY_CATEGORY_MAP[g.category] || normalizeCategory(g.category)) : ''}`, country)
          return (
            <a
              key={g.id}
              href={href}
              data-idx={idx}
              className="gig-link"
              style={{ display: 'flex', textDecoration: 'none', color: 'inherit', scrollMarginTop: '84px' }}
            >
              <article className="gig" data-c={cardCountry}>
                <div className={`plate${g.cover_image_url ? ' has-cover' : ''}`}>
                  {g.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="plate-img" src={g.cover_image_url} alt={`${g.title || 'Service'} — preview`} loading="lazy" />
                  ) : (
                    <span className="plate-glyph">{glyphFor(g)}</span>
                  )}
                  <span className="plate-tag">{tag}</span>
                </div>
                <div className="body">
                  <div className="seller">
                    {g.providerHeadshot ? (
                      // Real headshot. Plain <img> for consistency with the
                      // rest of this surface (see landing notes).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="av"
                        src={g.providerHeadshot}
                        alt={g.providerName}
                        loading="lazy"
                        style={{ objectFit: 'cover' }}
                      />
                    ) : (
                      <span className="av" style={{ background: avatarBgFor(g.provider_type) }}>{initialsOf(g.providerName)}</span>
                    )}
                    <span className="info">
                      <b>{g.providerName}</b>
                      <span>{g.provider_type === 'attorney' ? 'Licensed attorney' : 'Regulated consultant'}</span>
                    </span>
                    <span className="pro">{proLabel}</span>
                  </div>
                  <h4>{g.title}</h4>
                  {g.review_count > 0 && (
                    <div className="stars">
                      <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" /></svg>
                      {g.avg_rating.toFixed(2)} <span className="rev">· ({g.review_count})</span>
                    </div>
                  )}
                  <div className="gig-foot">
                    <span className="delivery">{deliveryLabel(g.delivery_days)}</span>
                    <span className="price">
                      <span className="from">From</span>
                      <b>{formatPrice(g.starting_price, localCurrency)}</b>
                    </span>
                  </div>
                </div>
              </article>
            </a>
          )
        })}
      </div>

      {total > FEATURED_PAGE_SIZE && (
        <>
          {hasMore && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '26px 0 4px' }}>
              <button
                type="button"
                onClick={loadMore}
                style={loadMoreStyle}
              >
                Load more briefs
                <span style={{ opacity: 0.65, fontWeight: 500 }}>
                  &nbsp;· {Math.min(FEATURED_PAGE_SIZE, total - visibleCount)} more of {total.toLocaleString('en-US')}
                </span>
              </button>
            </div>
          )}

          <nav
            className="pager"
            aria-label="Featured briefs pagination"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', padding: '18px 0 8px' }}
          >
            <span
              className="pg-range"
              style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.inkSoft, marginRight: 12 }}
            >
              Showing {shown.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} · page {deepestPage}/{totalPages}
            </span>
            {deepestPage > 1 && (
              <a
                href={withCountry(`/marketplace?page=${deepestPage - 1}`, country)}
                aria-label="Previous page"
                style={pagerChipStyle(true)}
                onClick={jumpToPage(deepestPage - 1)}
              >
                ← Prev
              </a>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={withCountry(`/marketplace?page=${p}`, country)}
                aria-current={p === deepestPage ? 'page' : undefined}
                style={pagerChipStyle(p === deepestPage)}
                onClick={jumpToPage(p)}
              >
                {p}
              </a>
            ))}
            {deepestPage < totalPages && (
              <a
                href={withCountry(`/marketplace?page=${deepestPage + 1}`, country)}
                aria-label="Next page"
                style={pagerChipStyle(true)}
                onClick={jumpToPage(deepestPage + 1)}
              >
                Next →
              </a>
            )}
          </nav>
        </>
      )}
    </>
  )
}

const loadMoreStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '12px 26px',
  borderRadius: 999,
  fontFamily: F.mono,
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: `1px solid ${T.ink}`,
  background: 'transparent',
  color: T.ink,
}
