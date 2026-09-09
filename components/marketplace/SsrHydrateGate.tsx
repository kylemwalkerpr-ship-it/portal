'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Renders the crawlable SSR body in the initial HTML, then removes it as soon
 * as the interactive island is ready. A short hydration fallback protects the
 * human UI even when an enrichment request is slow or its ready event is lost:
 * crawlers/no-JS still receive the full SSR body because effects never run,
 * while browser users never stare at crawler-oriented prose for several
 * seconds and mistake it for a broken page.
 */
export function SsrHydrateGate({
  children,
  readyEvent = 'yousafe:ssr-ready',
  fallbackMs = 350,
}: {
  children: ReactNode
  readyEvent?: string
  fallbackMs?: number
}) {
  const [hide, setHide] = useState(false)

  useEffect(() => {
    const onReady = () => setHide(true)
    window.addEventListener(readyEvent, onReady)
    const t = window.setTimeout(() => setHide(true), fallbackMs)
    return () => {
      window.removeEventListener(readyEvent, onReady)
      window.clearTimeout(t)
    }
  }, [readyEvent, fallbackMs])

  if (hide) return null

  return (
    <div data-ssr-seo="" data-ready-event={readyEvent}>
      {children}
    </div>
  )
}

/** Call from client islands when interactive content is ready. */
export function signalSsrReady(eventName = 'yousafe:ssr-ready') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(eventName))
}
