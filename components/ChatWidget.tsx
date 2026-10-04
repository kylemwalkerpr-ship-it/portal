'use client'

import { useEffect } from 'react'

/**
 * Portal mount for the same system-wide assistant used by every YouSafe site.
 * The actual UI, page-context capture, SuperGrok call, and live-support handoff
 * live in /assistant.js + /api/chat so there is only one assistant stack.
 */
export default function ChatWidget() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if ((window as any).__youSafeAssistantMounted) return
    if (document.querySelector('script[data-yousafe-assistant="1"]')) return

    ;(window as any).YOUSAFE_ASSISTANT_CONFIG = {
      ...((window as any).YOUSAFE_ASSISTANT_CONFIG || {}),
      apiUrl: '/api/chat',
      surface: 'portal',
    }

    // Deferred so the assistant (about 0.5-1 s of main-thread work on mobile)
    // never competes with first paint: load on the first interaction, or once
    // the browser is idle after a short delay, whichever comes first.
    let loaded = false
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    const load = () => {
      if (loaded) return
      loaded = true
      events.forEach((name) => window.removeEventListener(name, load))
      window.clearTimeout(timer)
      if (document.querySelector('script[data-yousafe-assistant="1"]')) return
      const script = document.createElement('script')
      script.src = '/assistant.js?v=ysa-premium-1'
      script.async = true
      script.defer = true
      script.dataset.yousafeAssistant = '1'
      document.body.appendChild(script)
    }
    events.forEach((name) => window.addEventListener(name, load, { once: true, passive: true }))
    const timer = window.setTimeout(() => {
      const w = window as any
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(load, { timeout: 2000 })
      else load()
    }, 6000)
    return () => {
      events.forEach((name) => window.removeEventListener(name, load))
      window.clearTimeout(timer)
    }
  }, [])

  return null
}
