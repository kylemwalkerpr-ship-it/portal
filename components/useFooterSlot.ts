'use client'

import { useEffect, useState } from 'react'

/**
 * Small screens: the persistent "Cookie settings" control must never float
 * over page content (Sanitization P7 follow-up). Below 640px the control is
 * rendered as a plain link inside the page's last <footer> (or at the end of
 * <body> if a page has no footer); at 640px and up it stays a floating pill.
 *
 * Returns:
 *   undefined  – not measured yet (render nothing to avoid a flash)
 *   null       – wide screen: render the floating control
 *   HTMLElement – narrow screen: portal the control into this footer slot
 */
export function useFooterSlot(): HTMLElement | null | undefined {
  const [slot, setSlot] = useState<HTMLElement | null | undefined>(undefined)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    let el: HTMLDivElement | null = null
    let observer: MutationObserver | null = null

    const mount = () => {
      const footers = document.querySelectorAll('footer')
      const host = footers.length ? footers[footers.length - 1] : document.body
      if (el && el.isConnected && el.parentElement === host) return
      if (!el) {
        el = document.createElement('div')
        el.setAttribute('data-cookie-settings-slot', '')
        el.style.cssText = 'text-align:center;padding:10px 16px 18px;font-size:13px'
      }
      host.appendChild(el)
      setSlot(el)
    }

    const sync = () => {
      if (mq.matches) {
        mount()
        if (!observer) {
          // Client-side navigation can replace the footer element; re-attach.
          observer = new MutationObserver(() => {
            if (el && !el.isConnected) mount()
          })
          observer.observe(document.body, { childList: true, subtree: true })
        }
      } else {
        observer?.disconnect()
        observer = null
        el?.remove()
        el = null
        setSlot(null)
      }
    }

    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      observer?.disconnect()
      el?.remove()
    }
  }, [])

  return slot
}

export const footerLinkStyle = {
  background: 'none',
  border: 0,
  padding: '8px 6px',
  minHeight: 32,
  color: 'inherit',
  font: 'inherit',
  fontSize: 13,
  textDecoration: 'underline',
  textUnderlineOffset: 3,
  cursor: 'pointer',
} as const
