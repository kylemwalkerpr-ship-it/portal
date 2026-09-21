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
import {
  createSingleFlightWindows,
  prefetchTargetPage,
  scheduleIdlePrefetch,
  shouldPrefetchAdjacentWindow,
  type PrefetchConnectionInfo,
  type PrefetchIdleHost,
  type SingleFlightWindows,
} from '@/lib/marketplacePrefetchPlan'
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

/** `navigator.connection` — Network Information, absent on some browsers. */
type NetworkInformationLike = PrefetchConnectionInfo & { effectiveType?: string | null }

/** One page window's JSON result — what the grid renders and caches. */
type WindowFetchResult = { cards: LandingCardGig[]; total: number }

/** A window fetch: the JSON request options a caller may add. */
interface WindowFetchOptions {
  signal?: AbortSignal
  /** Speculative warm-ups run at low priority so they never compete with a click. */
  priority?: 'low'
}

/**
 * The single adjacent prefetch this grid may keep alive.
 *
 * `cancel` drops the idle task (or aborts the request once it started) and
 * `target` is looked up in the shared `windowFetches` map, which is what makes
 * a click on a prefetching page reuse one request instead of issuing a
 * duplicate.
 */
interface AdjacentPrefetch {
  target: number
  /** Exact request path the plan warms — a country/filter change supersedes it. */
  path: string
  controller: AbortController
  cancel: () => void
}

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
  // One request per page window, shared by navigation and prefetch. Entries are
  // dropped as soon as a request settles, so this map only ever holds IN-FLIGHT
  // windows — settled payloads live in `pages`.
  const windowFetchesRef = useRef<SingleFlightWindows<WindowFetchResult> | null>(null)
  if (windowFetchesRef.current == null) windowFetchesRef.current = createSingleFlightWindows()
  const windowFetches = windowFetchesRef.current
  // The single adjacent warm-up this grid may keep alive. One plan cancels the
  // previous one, so prefetching can never fan out past one extra request.
  const prefetchRef = useRef<AdjacentPrefetch | null>(null)
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
    async (pageToLoad: number, options?: WindowFetchOptions): Promise<WindowFetchResult> => {
      const response = await fetch(landingCardsPath(country, pageToLoad), {
        credentials: 'same-origin',
        signal: options?.signal,
        priority: options?.priority,
      })
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
   * One request per page window. A prefetch and the click that follows it share
   * the SAME promise (and therefore the same HTTP request), so a pager click on
   * a warming page can never issue a duplicate — the click adopts the warm-up.
   */
  const startWindowFetch = useCallback(
    (target: number, options?: WindowFetchOptions): Promise<WindowFetchResult> =>
      // `start` only runs the request when that window is not already in flight,
      // so an adopted warm-up keeps its own signal/priority and the click cannot
      // turn into a second request.
      windowFetches.start(target, () => fetchWindow(target, options)),
    [fetchWindow, windowFetches],
  )

  /**
   * Drop the planned warm-up (idle task or in-flight request). The shared
   * promise is removed BEFORE the abort so a click arriving in the same tick
   * starts its own request instead of awaiting the cancelled one.
   */
  const cancelPrefetch = useCallback(() => {
    const planned = prefetchRef.current
    if (!planned) return
    prefetchRef.current = null
    windowFetches.drop(planned.target)
    planned.cancel()
    planned.controller.abort()
  }, [windowFetches])

  /** Browser connection hints — absent on Safari/Firefox, hence optional. */
  const connectionInfo = useCallback((): NetworkInformationLike | null => {
    if (typeof navigator === 'undefined') return null
    const nav = navigator as Navigator & { connection?: NetworkInformationLike }
    return nav.connection ?? null
  }, [])

  /**
   * Warm exactly the NEXT page's JSON once the current window is stable.
   *
   * Deliberately narrow (MARKETPLACE-PAGINATION-PREFETCH): one page ahead, on an
   * idle callback, at low priority, cancellable, skipped under Save-Data or a
   * 2g-class connection, and silent on failure — a failed warm-up never sets an
   * error, never writes the window cache and never touches the URL, so the
   * visitor's own navigation still owns its request, its spinner and its retry.
   */
  const scheduleAdjacentPrefetch = useCallback(() => {
    const snapshot = stateRef.current
    const target = prefetchTargetPage(snapshot.page, snapshot.total)
    const path = target == null ? null : landingCardsPath(country, target)
    const allowed =
      path != null &&
      shouldPrefetchAdjacentWindow({
        page: snapshot.page,
        total: snapshot.total,
        // Read from the ref: a navigation that started in this same commit has
        // already set it, so a render-stale `pending` cannot warm a window the
        // visitor is still waiting to replace.
        pending: inFlightRef.current,
        visible: typeof document === 'undefined' || document.visibilityState === 'visible',
        online: typeof navigator === 'undefined' ? undefined : navigator.onLine !== false,
        connection: connectionInfo(),
      })
    // A plan for another window, or one whose gate has since closed, is dropped
    // first: the grid keeps at most one warm-up and it is always the adjacent,
    // currently-allowed one.
    if (prefetchRef.current && (!allowed || prefetchRef.current.path !== path)) cancelPrefetch()
    if (!allowed || target == null || path == null || prefetchRef.current) return
    if (pages.has(target)) return
    // A window that is already being fetched needs no warm-up: the click reuses
    // that very request (see startWindowFetch / goToPage).
    if (windowFetches.has(target)) return
    const controller = new AbortController()
    const entry: AdjacentPrefetch = { target, path, controller, cancel: () => {} }
    prefetchRef.current = entry
    entry.cancel = scheduleIdlePrefetch(
      typeof window === 'undefined' ? undefined : (window as unknown as PrefetchIdleHost),
      () => {
        // Cancelled between scheduling and idling: the plan no longer owns the
        // slot, so this task must not issue a request.
        if (prefetchRef.current !== entry || controller.signal.aborted) return
        void startWindowFetch(target, { signal: controller.signal, priority: 'low' })
          .then((fetched) => {
            // An aborted or empty warm-up is not a window: never cache it, or a
            // later click would render an empty page from the cache.
            if (controller.signal.aborted || fetched.cards.length === 0) return
            pages.set(target, fetched.cards)
          })
          .catch(() => { /* speculative: failures stay silent and retryable */ })
          .finally(() => {
            if (prefetchRef.current === entry) prefetchRef.current = null
          })
      },
    )
  }, [cancelPrefetch, connectionInfo, country, pages, startWindowFetch, windowFetches])

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

      // A planned warm-up for a page the visitor did NOT ask for is dropped so
      // the navigation gets the connection to itself.
      if (prefetchRef.current && prefetchRef.current.target !== target) cancelPrefetch()

      inFlightRef.current = true
      setPendingPage(target)
      setError(null)
      setFailed(null)
      try {
        // A click on a page that is already prefetching reuses that request —
        // the same promise, never a duplicate — and takes ownership of it, so
        // the warm-up can no longer cancel the navigation out from under the
        // visitor (and a warm-up failure still lands in this click's own error
        // path, which keeps the current page and stays retryable).
        const shared = windowFetches.get(target)
        if (shared && prefetchRef.current?.target === target) {
          // Adopted: the navigation owns the request now, so the warm-up must
          // not abort it. Nothing has been dropped — the request continues.
          prefetchRef.current = null
        } else if (!shared && prefetchRef.current?.target === target) {
          // The warm-up was still waiting for idle time, so nothing has been
          // requested yet: the click takes over and the scheduled task is
          // dropped instead of firing a second request mid-navigation.
          cancelPrefetch()
        }
        const fetched = await (shared ?? startWindowFetch(target))
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
    [applyWindow, cancelPrefetch, pages, scrollToGridStart, startWindowFetch, windowFetches],
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

  /**
   * Schedule the next window's warm-up whenever the current one settles: the
   * first paint, a page change, or a deep link that finished loading. While a
   * window is in flight `pending` is true and the plan is skipped, so the
   * prefetch can only ever follow a STABLE window (`isLandingBrowsingQuery` and
   * the pager keep their own contract — nothing here reads or writes the URL).
   */
  useEffect(() => {
    scheduleAdjacentPrefetch()
  }, [country, page, pending, scheduleAdjacentPrefetch, total])

  // A background tab warms nothing; coming back to the foreground re-arms the
  // plan for whatever window is on screen by then.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleAdjacentPrefetch()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [scheduleAdjacentPrefetch])

  // Leaving the page cancels the speculative request; `cancelPrefetch` is
  // stable, so this cleanup only ever runs on unmount.
  useEffect(() => () => cancelPrefetch(), [cancelPrefetch])

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
