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

    const script = document.createElement('script')
    script.src = '/assistant.js?v=ysa-launcher-pin-1'
    script.async = true
    script.defer = true
    script.dataset.yousafeAssistant = '1'
    document.body.appendChild(script)
  }, [])

  return null
}
