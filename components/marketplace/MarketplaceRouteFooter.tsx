'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { MarketplaceFooter } from './MarketplaceFooter'

/**
 * The marketplace landing and file shop already own their footer. Detail and
 * taxonomy routes did not, which left category, gig, and provider pages ending
 * abruptly on blank paper. Because the market subdomain rewrites public paths
 * (`/gigs/...`) to internal `/marketplace/gigs/...` routes, accept both path
 * shapes here.
 *
 * This component also owns the shared footer-clearance contract for floating
 * chat surfaces. As the footer enters the visible viewport it publishes the
 * overlap as a CSS variable, allowing both launchers (and desktop popovers) to
 * rise with the footer instead of covering it.
 */
export function MarketplaceRouteFooter() {
  const pathname = usePathname() || ''
  const publicPath = pathname.replace(/^\/marketplace(?=\/|$)/, '') || '/'
  const needsSharedFooter = /^\/(?:categories|gigs|providers)(?:\/|$)/.test(publicPath)

  useEffect(() => {
    const root = document.documentElement

    if (!needsSharedFooter) {
      root.style.removeProperty('--ys-footer-inset')
      return
    }

    let frame = 0
    let footer = document.querySelector<HTMLElement>('[data-chat-footer-boundary]')
    let resizeObserver: ResizeObserver | null = null

    const updateFooterInset = () => {
      frame = 0
      footer ||= document.querySelector<HTMLElement>('[data-chat-footer-boundary]')

      if (!footer) {
        root.style.setProperty('--ys-footer-inset', '0px')
        return
      }

      const viewport = window.visualViewport
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight
      const footerTop = footer.getBoundingClientRect().top
      const overlap = Math.max(0, visibleBottom - footerTop)

      root.style.setProperty('--ys-footer-inset', `${Math.round(overlap)}px`)
    }

    const scheduleFooterInset = () => {
      if (frame) return
      frame = window.requestAnimationFrame(updateFooterInset)
    }

    scheduleFooterInset()
    window.addEventListener('scroll', scheduleFooterInset, { passive: true })
    window.addEventListener('resize', scheduleFooterInset)
    window.visualViewport?.addEventListener('scroll', scheduleFooterInset)
    window.visualViewport?.addEventListener('resize', scheduleFooterInset)

    if (footer && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleFooterInset)
      resizeObserver.observe(footer)
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      window.removeEventListener('scroll', scheduleFooterInset)
      window.removeEventListener('resize', scheduleFooterInset)
      window.visualViewport?.removeEventListener('scroll', scheduleFooterInset)
      window.visualViewport?.removeEventListener('resize', scheduleFooterInset)
      root.style.removeProperty('--ys-footer-inset')
    }
  }, [needsSharedFooter])

  if (!needsSharedFooter) return null

  return (
    <>
      <style>{`
        /* Shared footer collision gate. Keep each surface's normal breathing
           room, then add only the amount of footer currently inside the
           visible viewport. Specificity + !important intentionally beats the
           assistant embed's mobile fixed-position fallback. */
        html body .ys-floating-message-launcher {
          bottom: calc(max(22px, env(safe-area-inset-bottom)) + var(--ys-footer-inset, 0px)) !important;
        }
        html body .ysa-launcher {
          bottom: calc(max(20px, env(safe-area-inset-bottom)) + var(--ys-footer-inset, 0px)) !important;
        }
        @media (min-width: 701px) {
          html body .ys-gig-message-popover {
            bottom: calc(max(22px, env(safe-area-inset-bottom)) + var(--ys-footer-inset, 0px)) !important;
          }
        }
        @media (min-width: 769px) {
          html body .ysa-panel {
            bottom: calc(max(90px, calc(70px + env(safe-area-inset-bottom))) + var(--ys-footer-inset, 0px)) !important;
          }
        }
        @media (max-width: 700px) {
          html body .ys-floating-message-launcher {
            bottom: calc(max(82px, calc(70px + env(safe-area-inset-bottom))) + var(--ys-footer-inset, 0px)) !important;
          }
        }
        @media (max-width: 768px) {
          html body .ysa-launcher {
            bottom: calc(max(16px, calc(12px + env(safe-area-inset-bottom))) + var(--ys-footer-inset, 0px)) !important;
          }
        }
      `}</style>
      <MarketplaceFooter />
    </>
  )
}
