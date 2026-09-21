/**
 * Bounded adjacent prefetch for the marketplace landing pager.
 *
 * MARKETPLACE-PAGINATION-PREFETCH: a page click used to be a cold request — the
 * grid only ever fetched the window the visitor asked for. Warming exactly the
 * NEXT window's JSON (never more than one page ahead, never the whole
 * inventory) makes a forward pager click render from the existing client-side
 * window cache without a request, while leaving the navigation contract
 * untouched.
 *
 * Everything here is pure so the adjacency limit and the skip rules are
 * unit-tested instead of being re-derived inline in the client component:
 *
 *  · adjacency      — `page + 1`, and only while that page exists;
 *  · Save-Data      — `navigator.connection.saveData` skips the prefetch;
 *  · slow links     — `effectiveType` of `slow-2g` / `2g` skips the prefetch;
 *  · stability      — an in-flight navigation, an offline document or a hidden
 *                     tab all skip the prefetch, so it can never race the
 *                     window the visitor is actually waiting for.
 *
 * No prefetch may ever fetch images: only the JSON window path is warmed.
 */

import { clampPage, totalPagesFor } from '@/lib/marketplaceDisplay'

/** Idle deadline: warm the next window shortly after the current one settles. */
export const PREFETCH_IDLE_TIMEOUT_MS = 1800

/** Connection classes that are too constrained to spend a request on spec. */
export const PREFETCH_BLOCKED_EFFECTIVE_TYPES = ['slow-2g', '2g']

/** The slice of `navigator.connection` (Network Information) we act on. */
export interface PrefetchConnectionInfo {
  saveData?: boolean
  effectiveType?: string | null
}

export interface AdjacentPrefetchInput {
  /** Page currently rendered. */
  page: number
  /** Honest ranked size of the slice the window belongs to. */
  total: number
  /** A window navigation is already fetching — the current page is not stable. */
  pending: boolean
  /** `document.visibilityState === 'visible'` — a background tab must not prefetch. */
  visible: boolean
  /** `navigator.onLine`; only an explicit `false` skips. */
  online?: boolean
  /** `navigator.connection`, when the browser exposes it (Chrome/Android). */
  connection?: PrefetchConnectionInfo | null
}

/**
 * The one page worth warming: the next page, when it exists.
 *
 * Returns `null` at the final page (and for a one-page slice), so pagination
 * boundaries can never produce an out-of-range request.
 */
export function prefetchTargetPage(page: number, totalItems: number): number | null {
  const totalPages = totalPagesFor(totalItems)
  const current = clampPage(page, totalItems)
  const next = current + 1
  return next <= totalPages ? next : null
}

/** Whether the visitor's connection can afford one speculative JSON request. */
export function connectionAllowsPrefetch(connection?: PrefetchConnectionInfo | null): boolean {
  if (!connection) return true
  if (connection.saveData === true) return false
  const effectiveType =
    typeof connection.effectiveType === 'string' ? connection.effectiveType.trim().toLowerCase() : ''
  if (!effectiveType) return true
  return !PREFETCH_BLOCKED_EFFECTIVE_TYPES.includes(effectiveType)
}

/**
 * Whether the adjacent window may be warmed right now. `false` is always a
 * silent skip — the pager keeps working exactly as it did without a prefetch.
 */
export function shouldPrefetchAdjacentWindow(input: AdjacentPrefetchInput): boolean {
  if (input.pending) return false
  if (input.visible !== true) return false
  if (input.online === false) return false
  if (!connectionAllowsPrefetch(input.connection)) return false
  return prefetchTargetPage(input.page, input.total) != null
}

/** Host surface for the idle scheduler (a `Window`, or a test double). */
export interface PrefetchIdleHost {
  requestIdleCallback?: (task: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
  setTimeout?: (task: () => void, ms: number) => number
  clearTimeout?: (handle: number) => void
}

/**
 * Run `task` on an idle callback when the browser has one, otherwise on a
 * macrotask. Returns its own canceller so the caller can drop the task when the
 * window it was planned for is superseded.
 */
export function scheduleIdlePrefetch(
  host: PrefetchIdleHost | undefined,
  task: () => void,
  timeoutMs: number = PREFETCH_IDLE_TIMEOUT_MS,
): () => void {
  const idle = host && typeof host.requestIdleCallback === 'function' ? host.requestIdleCallback : null
  if (idle) {
    const handle = idle.call(host, task, { timeout: timeoutMs })
    return () => {
      if (host && typeof host.cancelIdleCallback === 'function') host.cancelIdleCallback(handle)
    }
  }
  const timeout = host && typeof host.setTimeout === 'function' ? host.setTimeout : null
  if (!timeout) return () => {}
  const handle = timeout.call(host, task, 0)
  return () => {
    if (host && typeof host.clearTimeout === 'function') host.clearTimeout(handle)
  }
}

/**
 * One request per page window, shared by a warm-up and the click that follows
 * it.
 *
 * The dedupe half of the contract: `start` returns the promise already in
 * flight for that key and never calls `run` a second time, so a pager click on
 * a page that is currently prefetching reuses the same HTTP request instead of
 * issuing a duplicate. Entries are dropped as soon as the request settles (and
 * immediately on `drop`), so a cancelled or failed window is never handed to a
 * later click.
 */
export interface SingleFlightWindows<T> {
  has(key: number): boolean
  get(key: number): Promise<T> | undefined
  /** Runs `run` only when no request for `key` is in flight. */
  start(key: number, run: () => Promise<T>): Promise<T>
  /** Forgets a request (used when it is aborted, so a retry starts fresh). */
  drop(key: number): void
}

export function createSingleFlightWindows<T>(): SingleFlightWindows<T> {
  const inFlight = new Map<number, Promise<T>>()
  return {
    has: (key) => inFlight.has(key),
    get: (key) => inFlight.get(key),
    start(key, run) {
      const existing = inFlight.get(key)
      if (existing) return existing
      const promise = run()
      inFlight.set(key, promise)
      const settle = () => {
        if (inFlight.get(key) === promise) inFlight.delete(key)
      }
      promise.then(settle, settle)
      return promise
    },
    drop: (key) => {
      inFlight.delete(key)
    },
  }
}
