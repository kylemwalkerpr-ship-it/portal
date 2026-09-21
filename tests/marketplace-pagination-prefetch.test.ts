/**
 * MARKETPLACE-PAGINATION-PREFETCH — bounded adjacent window warm-up.
 *
 * Page-window pagination stays exactly as it is (one JSON window request per
 * navigation, canonical `/?page=N`, Back/Forward, retryable failures). This
 * suite pins the ADDITIVE contract that makes a forward pager click instant
 * without changing any of it:
 *
 *  1. adjacency      — the warm-up is `page + 1` and nothing else; the final
 *                      page plans nothing, so an out-of-range request can never
 *                      be produced by pagination;
 *  2. constrained    — Save-Data, `slow-2g` / `2g`, offline and background tabs
 *                      skip the warm-up entirely;
 *  3. stability      — a window is only warmed once the current one is stable
 *                      (never while a navigation is in flight);
 *  4. dedupe         — a pager click on a page that is prefetching reuses the
 *                      SAME single-flight promise (one HTTP request);
 *  5. cache + silence — a prefetched window lands in the existing client window
 *                      Map, while a failed/aborted warm-up stays silent: no
 *                      error state, no pending state, no URL write, no cache
 *                      entry, so explicit navigation/retry still owns its own
 *                      request;
 *  6. cancellable    — the idle task or in-flight request is abortable and is
 *                      superseded when the window moves on;
 *  7. no side-loads  — JSON only: no image preloading, and the public listing
 *                      route keeps its DB pagination + response headers.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PREFETCH_BLOCKED_EFFECTIVE_TYPES,
  PREFETCH_IDLE_TIMEOUT_MS,
  connectionAllowsPrefetch,
  createSingleFlightWindows,
  prefetchTargetPage,
  scheduleIdlePrefetch,
  shouldPrefetchAdjacentWindow,
} from '@/lib/marketplacePrefetchPlan'
import {
  applyLandingWindow,
  mergeNewLandingCards,
  parseLandingCardsPage,
} from '@/lib/marketplaceLandingPaging'
import { landingPageStatus, type LandingCardGig } from '@/lib/marketplaceDisplay'

const GRID_SRC = readFileSync(
  join(__dirname, '../components/marketplace/FeaturedBriefsGrid.tsx'),
  'utf8',
)
const ROUTE_SRC = readFileSync(
  join(__dirname, '../app/api/marketplace/gigs/route.ts'),
  'utf8',
)

/** The prefetch block only — assertions here must never see navigation state. */
const prefetchBlock = (() => {
  const start = GRID_SRC.indexOf('const scheduleAdjacentPrefetch = useCallback(')
  const end = GRID_SRC.indexOf('* Move to `requested` and render ONLY that window.')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return GRID_SRC.slice(start, end)
})()

/** The click path (`goToPage`). */
const goToPageBlock = (() => {
  const start = GRID_SRC.indexOf('const goToPage = useCallback(')
  const end = GRID_SRC.indexOf('Deep links: the document is static')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return GRID_SRC.slice(start, end)
})()

describe('adjacency: at most the next page, never a page that does not exist', () => {
  it('targets page + 1 while that page exists', () => {
    expect(prefetchTargetPage(1, 217)).toBe(2)
    expect(prefetchTargetPage(2, 217)).toBe(3)
    expect(prefetchTargetPage(4, 217)).toBe(5)
  })

  it('plans nothing on the final page or a one-page slice', () => {
    expect(prefetchTargetPage(5, 217)).toBeNull()
    expect(prefetchTargetPage(1, 48)).toBeNull()
    expect(prefetchTargetPage(1, 0)).toBeNull()
  })

  it('clamps a stale / garbage pointer before looking one page ahead', () => {
    // A stale document that still believes in page 9 must not warm page 10.
    expect(prefetchTargetPage(9, 217)).toBeNull()
    expect(prefetchTargetPage(Number.NaN, 217)).toBe(2)
    expect(prefetchTargetPage(-3, 96)).toBe(2)
  })

  it('never warms more than one page ahead', () => {
    const targets = [1, 2, 3, 4, 5].map((page) => prefetchTargetPage(page, 217))
    expect(targets).toEqual([2, 3, 4, 5, null])
    expect(targets.filter((target): target is number => target != null)).toHaveLength(4)
  })
})

describe('connection + stability gates', () => {
  const base = { page: 2, total: 217, pending: false, visible: true }

  it('prefetches on an ordinary connection', () => {
    expect(shouldPrefetchAdjacentWindow(base)).toBe(true)
    expect(shouldPrefetchAdjacentWindow({ ...base, online: true, connection: { effectiveType: '4g' } })).toBe(true)
  })

  it('skips Save-Data', () => {
    expect(connectionAllowsPrefetch({ saveData: true })).toBe(false)
    expect(connectionAllowsPrefetch({ saveData: true, effectiveType: '4g' })).toBe(false)
    expect(connectionAllowsPrefetch({ saveData: false })).toBe(true)
    expect(shouldPrefetchAdjacentWindow({ ...base, connection: { saveData: true } })).toBe(false)
  })

  it('skips slow 2g-class connections only', () => {
    expect(PREFETCH_BLOCKED_EFFECTIVE_TYPES).toEqual(['slow-2g', '2g'])
    expect(connectionAllowsPrefetch({ effectiveType: 'slow-2g' })).toBe(false)
    expect(connectionAllowsPrefetch({ effectiveType: '2g' })).toBe(false)
    expect(connectionAllowsPrefetch({ effectiveType: ' SLOW-2G ' })).toBe(false)
    expect(connectionAllowsPrefetch({ effectiveType: '3g' })).toBe(true)
    expect(connectionAllowsPrefetch({ effectiveType: '4g' })).toBe(true)
    // Safari/Firefox expose no Network Information at all: not a reason to skip.
    expect(connectionAllowsPrefetch(null)).toBe(true)
    expect(connectionAllowsPrefetch(undefined)).toBe(true)
    expect(connectionAllowsPrefetch({})).toBe(true)
  })

  it('waits for a stable, visible, online window', () => {
    expect(shouldPrefetchAdjacentWindow({ ...base, pending: true })).toBe(false)
    expect(shouldPrefetchAdjacentWindow({ ...base, visible: false })).toBe(false)
    expect(shouldPrefetchAdjacentWindow({ ...base, online: false })).toBe(false)
    expect(shouldPrefetchAdjacentWindow({ ...base, page: 5, total: 217 })).toBe(false)
  })
})

describe('idle scheduling is cancellable on every host', () => {
  it('uses requestIdleCallback when the browser has it', () => {
    const cancelIdleCallback = jest.fn()
    const requestIdleCallback = jest.fn((_task: () => void, _options?: { timeout: number }) => 7)
    const cancel = scheduleIdlePrefetch({ requestIdleCallback, cancelIdleCallback }, () => {}, 1234)
    expect(requestIdleCallback).toHaveBeenCalledTimes(1)
    expect(requestIdleCallback.mock.calls[0][1]).toEqual({ timeout: 1234 })
    cancel()
    expect(cancelIdleCallback).toHaveBeenCalledWith(7)
  })

  it('falls back to a macrotask and cancels it symmetric', () => {
    const clearTimeout = jest.fn()
    const setTimeout = jest.fn((_task: () => void, _ms?: number) => 3)
    const task = jest.fn()
    const cancel = scheduleIdlePrefetch({ setTimeout, clearTimeout }, task)
    expect(setTimeout).toHaveBeenCalledTimes(1)
    expect(setTimeout.mock.calls[0][1]).toBe(0)
    cancel()
    expect(clearTimeout).toHaveBeenCalledWith(3)
    expect(task).not.toHaveBeenCalled()
  })

  it('survives a host with no scheduler at all', () => {
    const cancel = scheduleIdlePrefetch(undefined, () => {})
    expect(() => cancel()).not.toThrow()
    expect(PREFETCH_IDLE_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('single-flight windows: a click never duplicates a warm-up', () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('runs the request once and hands the SAME promise to the second caller', async () => {
    const pool = createSingleFlightWindows<{ cards: string[] }>()
    const first = deferred<{ cards: string[] }>()
    const warmUp = jest.fn(() => first.promise)
    const click = jest.fn(async () => ({ cards: ['duplicate'] }))

    const prefetchPromise = pool.start(3, warmUp)
    const clickPromise = pool.start(3, click)
    expect(prefetchPromise).toBe(clickPromise)
    expect(warmUp).toHaveBeenCalledTimes(1)
    expect(click).not.toHaveBeenCalled()
    // The click path can see the in-flight request it is about to adopt.
    expect(pool.has(3)).toBe(true)
    expect(pool.get(3)).toBe(prefetchPromise)

    first.resolve({ cards: ['page-3'] })
    await expect(clickPromise).resolves.toEqual({ cards: ['page-3'] })
    expect(warmUp).toHaveBeenCalledTimes(1)
  })

  it('forgets a window once it settles, so a later click refetches', async () => {
    const pool = createSingleFlightWindows<{ cards: string[] }>()
    const run = jest.fn(async () => ({ cards: ['page-3'] }))
    await pool.start(3, run)
    expect(pool.has(3)).toBe(false)
    await pool.start(3, run)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('forgets a failed window instead of poisoning a retry', async () => {
    const pool = createSingleFlightWindows<{ cards: string[] }>()
    const failing = jest.fn(async () => {
      throw new Error('listing request failed (HTTP 500)')
    })
    await expect(pool.start(6, failing)).rejects.toThrow('HTTP 500')
    expect(pool.has(6)).toBe(false)
    const retry = jest.fn(async () => ({ cards: ['page-6'] }))
    await expect(pool.start(6, retry)).resolves.toEqual({ cards: ['page-6'] })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('drop() cancels ownership so an aborted warm-up is never adopted', async () => {
    const pool = createSingleFlightWindows<{ cards: string[] }>()
    const aborted = deferred<{ cards: string[] }>()
    const warmUp = jest.fn(() => aborted.promise)
    pool.start(4, warmUp)
    pool.drop(4)
    expect(pool.has(4)).toBe(false)
    const fresh = jest.fn(async () => ({ cards: ['page-4'] }))
    await expect(pool.start(4, fresh)).resolves.toEqual({ cards: ['page-4'] })
    expect(warmUp).toHaveBeenCalledTimes(1)
    expect(fresh).toHaveBeenCalledTimes(1)
  })
})

describe('replayed grid flow: warm-up, then click, then Back', () => {
  const TOTAL = 217
  const row = (page: number, index: number) => {
    const n = (page - 1) * 48 + index
    return {
      id: `gig-${n}`,
      slug: `brief-${n}`,
      title: `Brief ${n}`,
      category: 'immigration',
      provider_type: 'attorney',
      avg_rating: 4.8,
      review_count: 3,
      starting_price: 25000,
      delivery_days: 5,
      provider_name: `Provider ${n}`,
      provider_country: 'US',
      provider_headshot_url: null,
      jx: 'us',
      cover_image_url: null,
    }
  }
  const apiRows = (page: number, size = 48) => ({
    ok: true,
    data: { gigs: Array.from({ length: size }, (_, i) => row(page, i)), total: TOTAL, hasMore: page < 5 },
  })

  it('one warm-up request makes the pager click a local cache hit — page 2 renders cards 49-96 only', async () => {
    const pool = createSingleFlightWindows<{ cards: LandingCardGig[]; total: number }>()
    const pages = new Map<number, LandingCardGig[]>([[1, parseLandingCardsPage(apiRows(1)).cards]])
    // The request the grid's fetchWindow would issue, counted for the test.
    let requests = 0
    const request = (page: number) => async () => {
      requests += 1
      const parsed = parseLandingCardsPage(apiRows(page))
      return { cards: mergeNewLandingCards([], parsed.cards), total: parsed.total }
    }

    // 1. the adjacent warm-up (idle, silent)
    const target = prefetchTargetPage(1, TOTAL)
    expect(target).toBe(2)
    const warmed = await pool.start(target, request(target))
    pages.set(target, warmed.cards)
    expect(requests).toBe(1)

    // The grid's own click order: window cache first, then an in-flight
    // adoption, and only then a request (see `goToPage`).
    const clickPage = async (page: number) => {
      const cachedWindow = pages.get(page)
      if (cachedWindow) return cachedWindow
      const shared = pool.get(page)
      const fetched = await (shared ?? pool.start(page, request(page)))
      pages.set(page, fetched.cards)
      return fetched.cards
    }

    // 2. the click: cache hit, so no second request
    const clicked = await clickPage(target)
    expect(requests).toBe(1)
    expect(clicked).toBe(warmed.cards)
    const cached = pages.get(target)
    expect(cached).toHaveLength(48)

    const state = applyLandingWindow(
      { page: 1, cards: pages.get(1)!, total: TOTAL },
      { page: target, cards: cached!, total: TOTAL },
    )
    expect(state.page).toBe(2)
    expect(state.cards[0].id).toBe('gig-48')
    expect(state.cards.at(-1)?.id).toBe('gig-95')
    expect(landingPageStatus(state.page, state.cards.length, state.total)).toBe('Showing 49-96 of 217 · Page 2 of 5')
    // Still one request: the window was served from the client Map.
    expect(requests).toBe(1)

    // 3. Back to page 1 is the document's own window — also no request.
    const back = applyLandingWindow(state, { page: 1, cards: pages.get(1)!, total: TOTAL })
    expect(back.page).toBe(1)
    expect(back.cards[0].id).toBe('gig-0')
    expect(requests).toBe(1)
  })

  it('the final page plans no warm-up, so pagination can never request page 6', async () => {
    const pool = createSingleFlightWindows<{ cards: LandingCardGig[]; total: number }>()
    const requests: number[] = []
    const tracked = (page: number) => pool.start(page, async () => {
      requests.push(page)
      return { cards: [], total: 0 }
    })
    // Page 5 is the last window of a 217-row slice: nothing to warm.
    expect(prefetchTargetPage(5, TOTAL)).toBeNull()
    await tracked(5)
    expect(requests).toEqual([5])
    expect(requests).not.toContain(6)
  })

  it('a click that lands mid-prefetch adopts the in-flight request', async () => {
    const pool = createSingleFlightWindows<{ cards: LandingCardGig[]; total: number }>()
    const pages = new Map<number, LandingCardGig[]>()
    let requests = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const slowRequest = (page: number) => async () => {
      requests += 1
      await held
      const parsed = parseLandingCardsPage(apiRows(page))
      return { cards: mergeNewLandingCards([], parsed.cards), total: parsed.total }
    }

    // The warm-up is idle-scheduled and already in flight when the visitor
    // clicks the very same page.
    const inFlight = pool.start(prefetchTargetPage(1, TOTAL)!, slowRequest(2))
    const clickPage = async (page: number) => {
      const cachedWindow = pages.get(page)
      if (cachedWindow) return cachedWindow
      const shared = pool.get(page)
      const fetched = await (shared ?? pool.start(page, slowRequest(page)))
      pages.set(page, fetched.cards)
      return fetched.cards
    }
    const clicked = clickPage(2)
    expect(requests).toBe(1)
    release()
    await inFlight
    expect(await clicked).toHaveLength(48)
    expect(requests).toBe(1)
  })
})

describe('grid wiring: bounded, idle, deduped, silent, cancellable', () => {
  it('plans exactly one adjacent window through the shared plan helper', () => {
    expect(GRID_SRC).toContain("from '@/lib/marketplacePrefetchPlan'")
    expect(prefetchBlock).toContain('prefetchTargetPage(snapshot.page, snapshot.total)')
    expect(prefetchBlock).toContain('landingCardsPath(country, target)')
    // One slot only: a new plan replaces the previous one.
    expect(GRID_SRC).toContain('const prefetchRef = useRef<AdjacentPrefetch | null>(null)')
    expect(prefetchBlock).toContain('if (prefetchRef.current && (!allowed || prefetchRef.current.path !== path)) cancelPrefetch()')
    expect(prefetchBlock).toContain('if (!allowed || target == null || path == null || prefetchRef.current) return')
  })

  it('runs the warm-up on an idle callback at low priority', () => {
    expect(prefetchBlock).toContain('entry.cancel = scheduleIdlePrefetch(')
    expect(prefetchBlock).toContain("priority: 'low'")
    expect(GRID_SRC).toContain("signal: options?.signal")
  })

  it('gates on Save-Data / slow connection / visibility / stability', () => {
    expect(prefetchBlock).toContain('shouldPrefetchAdjacentWindow({')
    expect(prefetchBlock).toContain('pending: inFlightRef.current')
    expect(prefetchBlock).toContain("document.visibilityState === 'visible'")
    expect(prefetchBlock).toContain('navigator.onLine !== false')
    expect(prefetchBlock).toContain('connection: connectionInfo()')
    // The window must be stable: scheduling only happens after a settle.
    expect(GRID_SRC).toContain('}, [country, page, pending, scheduleAdjacentPrefetch, total])')
    expect(GRID_SRC).toContain("document.addEventListener('visibilitychange', onVisibility)")
  })

  it('reuses one request when the visitor clicks the prefetching page', () => {
    // Single-flight per window, shared by the warm-up and the click.
    expect(GRID_SRC).toContain('createSingleFlightWindows()')
    expect(GRID_SRC).toContain('windowFetches.start(target, () => fetchWindow(target, options))')
    expect(prefetchBlock).toContain('startWindowFetch(target, { signal: controller.signal')
    // The warm-up never calls the network itself.
    expect(prefetchBlock).not.toContain('fetchWindow(')
    // The click adopts the in-flight promise instead of issuing a duplicate.
    expect(goToPageBlock).toContain('const shared = windowFetches.get(target)')
    expect(goToPageBlock).toContain('await (shared ?? startWindowFetch(target))')
    expect(goToPageBlock).toContain('prefetchRef.current = null')
  })

  it('caches the warmed window in the existing client Map', () => {
    expect(GRID_SRC).toContain('pagesRef.current = new Map([[1, initialCards]])')
    expect(prefetchBlock).toContain('pages.set(target, fetched.cards)')
    // An empty or aborted warm-up is never cached as a renderable window.
    expect(prefetchBlock).toContain('if (controller.signal.aborted || fetched.cards.length === 0) return')
    expect(GRID_SRC).toContain('const cached = pages.get(target)')
  })

  it('keeps a failed warm-up silent and out of the navigation state machine', () => {
    expect(prefetchBlock).toContain('.catch(() => { /* speculative: failures stay silent and retryable */ })')
    expect(prefetchBlock).not.toContain('setError(')
    expect(prefetchBlock).not.toContain('setFailed(')
    expect(prefetchBlock).not.toContain('setPendingPage(')
    expect(prefetchBlock).not.toContain('setWindowState(')
    expect(prefetchBlock).not.toContain('applyWindow(')
    expect(prefetchBlock).not.toContain('writePageUrl(')
    expect(prefetchBlock).not.toContain('history.')
    // Explicit navigation keeps its own error + retry contract untouched.
    expect(goToPageBlock).toContain("setError(err instanceof Error ? err.message : 'Unable to load that page of briefs')")
    expect(goToPageBlock).toContain('setFailed({ page: target, mode })')
  })

  it('cancels the idle task or the in-flight request', () => {
    expect(GRID_SRC).toContain('planned.controller.abort()')
    expect(GRID_SRC).toContain('windowFetches.drop(planned.target)')
    expect(prefetchBlock).toContain('if (prefetchRef.current !== entry || controller.signal.aborted) return')
    expect(GRID_SRC).toContain('() => cancelPrefetch(), [cancelPrefetch])')
    // A click that wants a DIFFERENT page drops the stale warm-up.
    expect(goToPageBlock).toContain('if (prefetchRef.current && prefetchRef.current.target !== target) cancelPrefetch()')
  })

  it('prefetches JSON only — never a future card image', () => {
    expect(GRID_SRC).not.toContain('new Image(')
    expect(GRID_SRC).not.toContain('rel="preload"')
    expect(GRID_SRC).not.toContain('rel="prefetch"')
    expect(GRID_SRC).toContain('loading="lazy"')
    expect(prefetchBlock).not.toContain('.jpg')
    expect(prefetchBlock).not.toContain('.png')
  })

  it('leaves the true page-window contract and the pager untouched', () => {
    expect(GRID_SRC).not.toContain('Load more')
    expect(GRID_SRC).not.toContain('allCards')
    expect(GRID_SRC).toContain('onPageClick(pageWindow.page + 1)')
    expect(GRID_SRC).toContain("void goToPage(target, 'push')")
    expect(GRID_SRC).toContain('landingPageStatus(page, cards.length, total)')
  })
})

describe('public listing route is unchanged by the prefetch', () => {
  it('keeps DB-level page-window pagination for the trending/card path', () => {
    expect(ROUTE_SRC).toContain('await query.range(offset, offset + limit - 1)')
    // No ranking/query rewrite: the only bounded full-set path is relevance search.
    expect(ROUTE_SRC).toContain('const relevanceSearch = Boolean(safeQ && searchCandidateIds && sort === \'relevance\')')
    expect(ROUTE_SRC).toContain('? await query.limit(500)')
  })

  it('gains no public Cache-Control: the route is not provably anonymous-only', () => {
    // The same URL space serves personalised rows (`is_saved`) to signed-in
    // clients, so a shared, replayable cache header is not safe here. The card
    // view rides the existing 60s keyed server cache instead.
    expect(ROUTE_SRC).not.toContain('Cache-Control')
    expect(ROUTE_SRC).not.toContain('s-maxage')
    expect(ROUTE_SRC).toContain('is_saved: savedGigIds.has(gig.id)')
    expect(ROUTE_SRC).toContain('const CACHE_TTL_SECONDS = 60')
  })
})
