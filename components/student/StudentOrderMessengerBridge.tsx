'use client'

import React from 'react'
import { openOrderInMessenger } from '@/lib/openOrderMessenger'

function normalizedText(node: Element | null): string {
  return String(node?.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function isLegacyActivityButton(button: HTMLButtonElement): boolean {
  const text = normalizedText(button)
  return text === 'activity' || text.startsWith('💬 activity') || /^activity\b/.test(text)
}

/**
 * Student order detail used to own a second, miniature message composer under
 * its Activity tab. Order communication now belongs exclusively to the shared
 * WhatsApp-style Messenger. This bridge retires that legacy entry point while
 * keeping the large order-detail component untouched and routes Open chat into
 * the canonical order conversation.
 */
export default function StudentOrderMessengerBridge() {
  React.useEffect(() => {
    let opening = false

    const retireLegacyActivityControl = () => {
      const root = document.querySelector('.ys-order-detail')
      if (!root) return
      for (const node of root.querySelectorAll('button')) {
        const button = node as HTMLButtonElement
        if (!isLegacyActivityButton(button)) continue
        button.hidden = true
        button.tabIndex = -1
        button.setAttribute('aria-hidden', 'true')
        button.setAttribute('data-yousafe-retired-order-activity', 'true')
      }
    }

    const openFullMessenger = async () => {
      if (opening) return
      const orderId = new URLSearchParams(window.location.search).get('order')
      if (!orderId) {
        window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'messages' } }))
        return
      }

      opening = true
      try {
        await openOrderInMessenger({ orderId })
      } catch (error) {
        console.error('[student-order] Could not resolve order conversation', error)
        // The inbox is still a safer fallback than reviving the retired inline
        // composer; the student can select the conversation from the full app.
        window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'messages' } }))
      } finally {
        opening = false
      }
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null
      if (!(target instanceof HTMLButtonElement) || !target.closest('.ys-order-detail')) return

      const text = normalizedText(target)
      const openChat = text === 'open chat' || text.startsWith('open chat ')
      const legacyActivity = isLegacyActivityButton(target)
      if (!openChat && !legacyActivity) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      void openFullMessenger()
    }

    document.addEventListener('click', onClickCapture, true)
    const observer = new MutationObserver(retireLegacyActivityControl)
    observer.observe(document.body, { childList: true, subtree: true })
    retireLegacyActivityControl()

    return () => {
      document.removeEventListener('click', onClickCapture, true)
      observer.disconnect()
    }
  }, [])

  return null
}
