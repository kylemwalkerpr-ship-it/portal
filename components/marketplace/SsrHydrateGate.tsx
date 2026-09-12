'use client'

import type { ReactNode } from 'react'

/**
 * Legacy compatibility wrapper for the old crawler-only SSR duplicate.
 *
 * GigDetailPage and SellerProfilePage are now server-seeded client components,
 * so Next renders their real user-facing UI into the initial HTML. Rendering a
 * second SEO-only article before hydration created a visible two-stage page:
 * crawler copy first, then the actual Marketplace UI after an effect fired.
 *
 * Keep the component temporarily so the route files do not need a risky broad
 * refactor, but render no duplicate content. The seeded Marketplace islands are
 * now the single source of truth for both first paint and crawlable HTML.
 */
export function SsrHydrateGate(_props: {
  children: ReactNode
  readyEvent?: string
  fallbackMs?: number
}) {
  return null
}

/**
 * Compatibility signal retained for seeded client islands. Existing callers
 * can keep dispatching the event while the remaining legacy references are
 * cleaned up; it no longer controls visible content.
 */
export function signalSsrReady(eventName = 'yousafe:ssr-ready') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(eventName))
}
