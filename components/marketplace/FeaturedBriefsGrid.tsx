'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  landingPageStatus,
  pageWindowFor,
  pagerChipStyle,
  totalPagesFor,
  withCountry,
  type Country,
  type JxCode,
  type LandingCardGig,
} from '@/lib/marketplaceDisplay'
import { LEGACY_CATEGORY_MAP, normalizeCategory } from '@/lib/categories'
import {
  isLandingBrowsingQuery,
  landingPageHref,
  parseLandingPage,
} from '@/lib/marketplaceLandingUrl'
import {
  applyLandingWindow,
  landingCardsPath,
  mergeNewLandingCards,
  parseLandingCardsPage,
  type LandingWindowState,
} from '@/lib/marketplaceLandingPaging'
import { T } from '@/components/marketplace/tokens'
import { LandingDiscoveryControls } from '@/components/marketplace/LandingDiscoveryControls'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

/**
 * How a page change lands in the browser history:
 *  · push    — an explicit pager click (new entry, Back returns to the old page);
 *  · replace — a normalization (deep-link clamp, page 1 canonical, base drift);
 *  · none    — the URL is already correct (Back/Forward, first paint).
 */
type NavMode = 'push' | 'replace' | 'none'

interface Props {
  /**
   * First ranked page of the slice — the only window the build-static document
   * carries. Later pages are fetched one window at a time on the client.
   */
  cards: LandingCardGig[]
  /** Ranked size of the whole slice as of the build snapshot (a real count). */
  total: number
  /** Server facet counts for the discovery chips (whole slice, not page 1). */
  categoryCounts: Record<string, number>
  country: Country
  currency: string
}

export function FeaturedBriefsGrid({
  cards: initialCards,
  total: initialTotal,
  categoryCounts,
  country,
  currency,
}: Props) {
  // The window currently on screen — exactly ONE page, replaced on navigation.
  // There is deliberately no cumulative list state left: page 2 renders cards
  // 49-96 and never the first 96.
  const [windowState, setWindowState] = useState<LandingWindowState>(() => ({
    page: 1,
    cards: initialCards,
    total: initialTotal,
  }))
  const [pendingPage, setPendingPage] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failed, setFailed] = useState<{ page: number; mode: NavMode } | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  // Client-side page-window cache. Page 1 is the window the document already
  // carries; every other window is fetched once and then served from here for
  // repeat clicks and Back/Forward without another request.
  const pagesRef = useRef<Map<number, LandingCardGig[]> | null>(null)
  if (pagesRef.current == null) pagesRef.current = new Map([[1, initialCards]])
  const pages = pagesRef.current
  // One inventory fetch at a time: a page change replaces the window, so two
  // overlapping requests could otherwise apply their results out of order.
  const inFlightRef = useRef(false)
  const didMountRef = useRef(false)
  // Mirror of the paging state for the async navigation handler, so a fetch
  // that started before a render still resolves against the newest window.
  const stateRef = useRef<LandingWindowState>(windowState)
  stateRef.current = windowState
  const { page, cards, total } = windowState

  const totalPages = totalPagesFor(total)
  const pending = pendingPage != null
  const pageWindow = pageWindowFor(page, total)

  const scrollToGridStart = useCallback((focus: boolean) => {
    const el = gridRef.current
    if (!el) return
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Restrained: a page change owns exactly one scroll target (the grid start).
    el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    if (focus) el.focus({ preventScroll: true })
  }, [])

  const writePageUrl = useCallback(
    (target: number, mode: NavMode) => {
      if (mode === 'none' || typeof window === 'undefined') return
      const href = landingPageHref(target, country)
      if (mode === 'push') window.history.pushState(null, '', href)
      else window.history.replaceState(null, '', href)
    },
    [country],
  )

  const applyWindow = useCallback(
    (next: { page: number; cards: LandingCardGig[]; total?: number }, mode: NavMode) => {
      // The window REPLACES the rendered cards (see applyLandingWindow) — a page
      // change can never append to, or keep, the page it came from.
      const applied = applyLandingWindow(stateRef.current, next)
      stateRef.current = applied
      setWindowState(applied)
      writePageUrl(applied.page, mode)
      // Every page change scrolls to the grid start; focus only follows an
      // explicit click, so deep links and Back/Forward never steal focus.
      scrollToGridStart(mode === 'push')
    },
    [scrollToGridStart, writePageUrl],
  )

  /**
   * Fetch exactly one page window through the narrow `view=card` contract the
   * build snapshot uses (limit 48, same total order). One navigation therefore
   * means one request, and the full inventory is never requested.
   */
  const fetchWindow = useCallback(
    async (pageToLoad: number): Promise<{ cards: LandingCardGig[]; total: number }> => {
      const response = await fetch(landingCardsPath(country, pageToLoad), { credentials: 'same-origin' })
      if (!response.ok) throw new Error(`listing request failed (HTTP ${response.status})`)
      const parsed = parseLandingCardsPage(await response.json().catch(() => null))
      // De-dup inside the window only (a repeated row can never render twice on
      // one page). Windows are never concatenated with each other any more, so
      // there is no cross-page merge to reconcile.
      return { cards: mergeNewLandingCards([], parsed.cards), total: parsed.total }
    },
    [country],
  )

  /**
   * Move to `requested` and render ONLY that window. A page change replaces the
   * grid contents; while a window is in flight the current page stays on
   * screen (busy + announced) instead of being appended to. Failures keep the
   * current page, leave the URL untouched and stay retryable.
   */
  const goToPage = useCallback(
    async (requested: number, mode: NavMode) => {
      const snapshot = stateRef.current
      const target = clampPage(requested, snapshot.total)
      if (target === snapshot.page) {
        if (mode !== 'none') scrollToGridStart(false)
        return
      }
      if (inFlightRef.current) return

      const cached = pages.get(target)
      if (cached) {
        applyWindow({ page: target, cards: cached, total: snapshot.total }, mode)
        return
      }

      inFlightRef.current = true
      setPendingPage(target)
      setError(null)
      setFailed(null)
      try {
        const fetched = await fetchWindow(target)
        let nextTotal = fetched.total > 0 ? fetched.total : snapshot.total
        // Inventory can shrink between the build snapshot and the click, so the
        // requested window may no longer exist: follow the API's own page count
        // in at most one extra request instead of rendering an empty grid.
        let finalPage = clampPage(target, nextTotal)
        let finalCards = fetched.cards
        if (finalCards.length === 0 && finalPage !== target) {
          const fallbackCached = pages.get(finalPage)
          if (fallbackCached) finalCards = fallbackCached
          else {
            const fallback = await fetchWindow(finalPage)
            finalCards = fallback.cards
            if (fallback.total > 0) nextTotal = fallback.total
          }
        }
        if (finalCards.length === 0) {
          setError(`Page ${target} has no briefs to show`)
          setFailed({ page: target, mode })
          return
        }
        pages.set(finalPage, finalCards)
        // Back/Forward only repairs the URL when the requested pointer had to be
        // clamped; an explicit click keeps its own history entry.
        const appliedMode: NavMode =
          mode === 'none' ? (finalPage === requested ? 'none' : 'replace') : mode
        applyWindow({ page: finalPage, cards: finalCards, total: nextTotal }, appliedMode)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load that page of briefs')
        setFailed({ page: target, mode })
      } finally {
        inFlightRef.current = false
        setPendingPage(null)
      }
    },
    [applyWindow, fetchWindow, pages, scrollToGridStart],
  )

  /**
   * Deep links: the document is static and always ships page 1, so `?page=N` is
   * resolved here after hydration — the window is fetched page-locally and the
   * URL is normalized with replaceState (invalid/out-of-range pointers clamp,
   * page 1 canonicalizes to `/`) without adding a history entry.
   */
  useEffect(() => {
    if (didMountRef.current) return
    didMountRef.current = true
    const search = window.location.search
    const requested = parseLandingPage(search)
    const snapshot = stateRef.current
    const target = clampPage(requested, snapshot.total)
    // Only URLs the landing itself owns are rewritten: a query string carrying
    // another consumer's key (`lang`, a filter, tracking) is left alone.
    if (isLandingBrowsingQuery(search)) {
      const canonical = landingPageHref(target, country)
      if (`${window.location.pathname}${search}` !== canonical) {
        window.history.replaceState(null, '', canonical)
      }
    }
    if (target > 1) void goToPage(target, 'none')
  }, [country, goToPage])

  // Back/Forward: render the page the URL points at from the window cache (or
  // one fetch when that window is not cached yet) without creating an entry.
  useEffect(() => {
    const onPopState = () => {
      void goToPage(parseLandingPage(window.location.search), 'none')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [goToPage])

  const retryFailedPage = useCallback(() => {
    if (!failed || inFlightRef.current) return
    void goToPage(failed.page, failed.mode)
  }, [failed, goToPage])

  const onPageClick = (target: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Modified clicks (new tab/window/download) keep their native behaviour.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    if (inFlightRef.current) return
    void goToPage(target, 'push')
  }
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

      <LandingDiscoveryControls categoryCounts={categoryCounts} country={country} />

      <div
        className="gig-grid"
        id="featured-grid"
        ref={gridRef}
        aria-busy={pending}
        tabIndex={-1}
        style={{ opacity: pending ? 0.55 : 1, transition: 'opacity .15s ease' }}
      >
        {cards.map((g, idx) => {
          const tag = `${(g.jx ?? (country === 'all' ? (g.jx ?? 'us') : country)).toUpperCase()} · ${(g.category ?? 'Brief').replace(/Services?$/i, '').trim()}`
          const proLabel = g.provider_type === 'attorney' ? 'J.D.' : 'Reg.'
          const cardCountry = g.jx ?? (country !== 'all' ? country : 'us')
          const localCurrency = COUNTRY_META[cardCountry as JxCode]?.currency ?? currency
          const href = g.slug
            ? `/gigs/${g.slug}`
            : withCountry(`/?category=${g.category ? (LEGACY_CATEGORY_MAP[g.category] || normalizeCategory(g.category)) : ''}`, country)

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
          {/* True page-by-page browsing: the numbered pager replaces the window
              (page 2 is cards 49-96, never the first 96) with ONE narrow
              /api/marketplace/gigs?view=card request per navigation. While a
              window is loading the current page stays on screen, and a failed
              fetch keeps it — with the URL and the counts left honest. */}
          <p role="status" aria-live="polite" style={pendingNoteStyle}>
            {pending ? `Loading page ${pendingPage} of ${totalPages}…` : ''}
          </p>
          {error && (
            <p role="alert" style={errorNoteStyle}>
              {error} — still showing page {page} of {totalPages}.{' '}
              {failed && (
                <button type="button" onClick={retryFailedPage} disabled={pending} style={retryStyle}>
                  Retry
                </button>
              )}
            </p>
          )}

          <nav className="pager" aria-label="Featured briefs pagination" style={pagerStyle}>
            <span className="pg-range" style={rangeStyle}>
              {landingPageStatus(page, cards.length, total)}
            </span>
            {pageWindow.hasPrev && (
              <a
                href={landingPageHref(pageWindow.page - 1, country)}
                aria-label="Previous page"
                style={pagerChipStyle(false)}
                onClick={onPageClick(pageWindow.page - 1)}
              >
                ← Prev
              </a>
            )}
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={landingPageHref(p, country)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                style={pagerChipStyle(p === page)}
                onClick={onPageClick(p)}
              >
                {p}
              </a>
            ))}
            {pageWindow.hasNext && (
              <a
                href={landingPageHref(pageWindow.page + 1, country)}
                aria-label="Next page"
                style={pagerChipStyle(false)}
                onClick={onPageClick(pageWindow.page + 1)}
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

const pendingNoteStyle: CSSProperties = {
  margin: '10px 0 0',
  minHeight: 16,
  textAlign: 'center',
  fontFamily: DISCOVERY_FONT,
  fontSize: 12,
  color: T.inkSoft,
}

const errorNoteStyle: CSSProperties = {
  margin: '6px 0 0',
  textAlign: 'center',
  fontFamily: DISCOVERY_FONT,
  fontSize: 12,
  color: T.brick,
}

const retryStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 4,
  padding: '3px 10px',
  borderRadius: 999,
  fontFamily: DISCOVERY_FONT,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  border: `1px solid ${T.brick}`,
  background: 'transparent',
  color: T.ink,
}

const rangeStyle: CSSProperties = {
  fontFamily: DISCOVERY_FONT,
  fontSize: 12,
  color: T.inkSoft,
  marginRight: 12,
}

const pagerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  flexWrap: 'wrap',
  padding: '18px 0 8px',
}
