'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent } from 'react'
import {
  avatarBgFor,
  clampPage,
  COUNTRY_META,
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
import { T } from '@/components/marketplace/tokens'
import { LandingDiscoveryControls } from '@/components/marketplace/LandingDiscoveryControls'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

interface Props {
  gigs: LandingGig[]
  initialVisible: number
  country: Country
  currency: string
}

export function FeaturedBriefsGrid({ gigs, initialVisible, country, currency }: Props) {
  const total = gigs.length
  const totalPages = totalPagesFor(total)
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(Math.max(FEATURED_PAGE_SIZE, initialVisible), total || FEATURED_PAGE_SIZE),
  )
  const [scrollToIdx, setScrollToIdx] = useState<number | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)

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
    setScrollToIdx(target === 1 ? 0 : pageStartIndex(target, total))
  }

  const shown = gigs.slice(0, visibleCount)
  const hasMore = visibleCount < total

  return (
    <>
      <style jsx global>{`
        /* The server landing still emits its crawlable category-chip row.
           The richer client discovery controls replace it visually while
           preserving those links in markup for resilience/SEO. */
        .cw-market .featured .wrap > .filters {
          display: none !important;
        }
        .cw-market .featured {
          padding: 54px 0 64px;
        }
        .cw-market .featured .section-head {
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .cw-market .featured .section-head h2 {
          max-width: none;
          font-family: ${DISCOVERY_FONT};
          font-size: clamp(28px, 2.35vw, 36px);
          line-height: 1.18;
          letter-spacing: -0.025em;
          font-weight: 720;
        }
        .cw-market .featured .section-head h2 em {
          font-style: normal;
          color: inherit;
          font-weight: inherit;
        }
        .cw-market .featured .section-head .meta {
          padding-top: 3px;
          gap: 8px;
          font-family: ${DISCOVERY_FONT};
          font-size: 12px;
          line-height: 1.4;
          letter-spacing: .07em;
        }
        .cw-market .featured .gig-grid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 34px 24px;
          align-items: start;
        }
        .cw-market .featured .gig-link {
          display: block !important;
          min-width: 0;
        }
        .cw-market .featured .gig {
          display: block;
          min-width: 0;
          color: ${T.ink};
          background: transparent;
          border: 0;
          border-radius: 0;
          overflow: visible;
          box-shadow: none;
          transition: transform .18s ease;
        }
        .cw-market .featured .gig:hover {
          transform: translateY(-2px);
          box-shadow: none;
        }
        .cw-market .featured .gig .plate {
          position: relative;
          overflow: hidden;
          border: 0;
          border-radius: 12px;
          background: ${T.paper2};
          box-shadow: inset 0 0 0 1px ${T.ruleSoft};
        }
        .cw-market .featured .gig .plate::after { display: none; }
        .cw-market .featured .gig .plate-img {
          width: 100%;
          height: auto;
          aspect-ratio: 16 / 10;
          object-fit: cover;
          object-position: center;
          border-radius: 12px;
          transition: transform .32s cubic-bezier(.2,.7,.2,1);
        }
        .cw-market .featured .gig:hover .plate-img { transform: scale(1.025); }
        .cw-market .featured .gig .plate-tag {
          left: 10px;
          bottom: 10px;
          padding: 5px 9px;
          border-radius: 7px;
          background: rgba(15,23,42,.82) !important;
          color: #fff;
          box-shadow: 0 2px 8px rgba(15,23,42,.16);
          font-family: ${DISCOVERY_FONT};
          font-size: 10px;
          font-weight: 720;
          letter-spacing: .035em;
        }
        .cw-market .featured .gig .body {
          padding: 11px 2px 2px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          flex: none;
          min-width: 0;
          font-family: ${DISCOVERY_FONT};
        }
        .cw-market .featured .gig .seller {
          min-height: 28px;
          gap: 8px;
        }
        .cw-market .featured .gig .seller .av {
          width: 26px;
          height: 26px;
          flex: 0 0 26px;
          font-family: ${DISCOVERY_FONT};
          font-size: 10px;
        }
        .cw-market .featured .gig .seller .info {
          min-width: 0;
          line-height: 1.15;
        }
        .cw-market .featured .gig .seller .info b {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family: ${DISCOVERY_FONT};
          font-size: 13px;
          font-weight: 680;
          letter-spacing: -.006em;
        }
        .cw-market .featured .gig .seller .info span {
          margin-top: 2px;
          font-family: ${DISCOVERY_FONT};
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0;
        }
        .cw-market .featured .gig .seller .pro {
          padding: 3px 7px;
          border-radius: 7px;
          background: ${T.paper2};
          border: 1px solid ${T.rule};
          color: ${T.inkMid};
          font-family: ${DISCOVERY_FONT};
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .035em;
        }
        .cw-market .featured .gig h4 {
          min-height: 2.84em;
          margin: 0;
          font-family: ${DISCOVERY_FONT};
          font-size: 15px;
          font-weight: 450;
          line-height: 1.42;
          letter-spacing: -.006em;
          color: ${T.inkMid};
          -webkit-line-clamp: 2;
        }
        .cw-market .featured .gig .stars {
          min-height: 20px;
          display: flex;
          align-items: center;
          gap: 5px;
          font-family: ${DISCOVERY_FONT};
          font-size: 13px;
          font-weight: 700;
          color: ${T.ink};
        }
        .cw-market .featured .gig .stars svg { width: 14px; height: 14px; color: ${T.ink}; }
        .cw-market .featured .gig .stars .rev { color: ${T.inkSoft}; font-weight: 500; }
        .cw-market .featured .gig .gig-foot {
          margin-top: 1px;
          padding-top: 0;
          border-top: 0;
          min-height: 27px;
        }
        .cw-market .featured .gig .delivery {
          font-family: ${DISCOVERY_FONT};
          font-size: 12px;
          font-weight: 520;
          letter-spacing: 0;
          color: ${T.inkSoft};
        }
        .cw-market .featured .gig .price {
          display: inline-flex;
          align-items: baseline;
          gap: 4px;
          font-family: ${DISCOVERY_FONT};
          white-space: nowrap;
        }
        .cw-market .featured .gig .price .from {
          font-family: ${DISCOVERY_FONT};
          font-size: 15px;
          font-weight: 600;
          letter-spacing: 0;
          text-transform: none;
          color: ${T.ink};
        }
        .cw-market .featured .gig .price b {
          display: inline;
          margin: 0;
          font-family: ${DISCOVERY_FONT};
          font-size: 16px;
          font-weight: 760;
          color: ${T.ink};
          line-height: 1.1;
        }
        @media (max-width: 1180px) {
          .cw-market .featured .gig-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
          .cw-market .featured .gig-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 18px; }
        }
        @media (max-width: 700px) {
          .cw-market .featured { padding: 38px 0 48px; }
          .cw-market .featured .section-head { margin-bottom: 18px; }
          .cw-market .featured .section-head h2 { font-size: 27px; }
          .cw-market .featured .gig-grid { grid-template-columns: 1fr; gap: 30px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cw-market .featured .gig,
          .cw-market .featured .gig .plate-img { transition: none !important; transform: none !important; }
        }
      `}</style>

      <LandingDiscoveryControls gigs={gigs} country={country} />

      <div className="gig-grid" id="featured-grid" ref={gridRef}>
        {shown.map((g, idx) => {
          const tag = `${(g.jx ?? (country === 'all' ? (g.jx ?? 'us') : country)).toUpperCase()} · ${(g.category ?? 'Brief').replace(/Services?$/i, '').trim()}`
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
              style={{ display: 'block', textDecoration: 'none', color: 'inherit', scrollMarginTop: '84px' }}
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="av" src={g.providerHeadshot} alt={g.providerName} loading="lazy" style={{ objectFit: 'cover' }} />
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
                  {g.review_count > 0 ? (
                    <div className="stars">
                      <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9" /></svg>
                      {g.avg_rating.toFixed(1)} <span className="rev">({g.review_count})</span>
                    </div>
                  ) : (
                    <div className="stars"><span className="rev">New service</span></div>
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
            <div style={{ display: 'flex', justifyContent: 'center', padding: '30px 0 4px' }}>
              <button type="button" onClick={() => setVisibleCount((c) => Math.min(c + FEATURED_PAGE_SIZE, total))} style={loadMoreStyle}>
                Load more briefs
                <span style={{ opacity: 0.65, fontWeight: 500 }}>
                  &nbsp;· {Math.min(FEATURED_PAGE_SIZE, total - visibleCount)} more of {total.toLocaleString('en-US')}
                </span>
              </button>
            </div>
          )}

          <nav className="pager" aria-label="Featured briefs pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', padding: '18px 0 8px' }}>
            <span className="pg-range" style={{ fontFamily: DISCOVERY_FONT, fontSize: 12, color: T.inkSoft, marginRight: 12 }}>
              Showing {shown.length.toLocaleString('en-US')} of {total.toLocaleString('en-US')} · page {deepestPage}/{totalPages}
            </span>
            {deepestPage > 1 && (
              <a href={withCountry(`/marketplace?page=${deepestPage - 1}`, country)} aria-label="Previous page" style={pagerChipStyle(true)} onClick={jumpToPage(deepestPage - 1)}>← Prev</a>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a key={p} href={withCountry(`/marketplace?page=${p}`, country)} aria-current={p === deepestPage ? 'page' : undefined} style={pagerChipStyle(p === deepestPage)} onClick={jumpToPage(p)}>{p}</a>
            ))}
            {deepestPage < totalPages && (
              <a href={withCountry(`/marketplace?page=${deepestPage + 1}`, country)} aria-label="Next page" style={pagerChipStyle(true)} onClick={jumpToPage(deepestPage + 1)}>Next →</a>
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
  padding: '12px 24px',
  borderRadius: 10,
  fontFamily: DISCOVERY_FONT,
  fontSize: 14,
  fontWeight: 650,
  cursor: 'pointer',
  border: `1px solid ${T.ink}`,
  background: T.vellum,
  color: T.ink,
}
