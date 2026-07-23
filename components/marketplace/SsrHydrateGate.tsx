'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Renders SSR SEO body in the initial HTML (crawlers + no-JS), then hides it
 * once the client island signals it has loaded real content — avoids duplicate
 * description/FAQ blocks for signed-in users after hydrate.
 *
 * `readyEvent` defaults to yousafe:ssr-ready; gig/provider pages can pass a
 * specific event name. A timeout fallback still collapses the SSR block if the
 * client island fails to signal (prevents permanent double UI).
 */
export function SsrHydrateGate({
  children,
  readyEvent = 'yousafe:ssr-ready',
  fallbackMs = 4000,
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
