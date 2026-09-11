'use client'

import React from 'react'
import { usePathname } from 'next/navigation'
import { queueMarketplaceSearchExecution } from '@/lib/marketplaceSearchIntelligence'

const ENHANCED_TAG = 'data-marketplace-intent-tag'

function isGigDetailPath(pathname: string) {
  return pathname.includes('/gigs/')
}

function scopedSearchBase(): { href: string; categoryId?: string } {
  const breadcrumb = document.querySelector('.ys-gig-breadcrumb-toolbar nav[aria-label="Breadcrumb"]')
  const categoryLinks = breadcrumb
    ? Array.from(breadcrumb.querySelectorAll<HTMLAnchorElement>('a[href*="/categories/"]'))
    : []
  const lastCategory = categoryLinks[categoryLinks.length - 1]
  if (!lastCategory) return { href: '/marketplace' }

  try {
    const url = new URL(lastCategory.href, window.location.href)
    const categoryId = url.pathname.split('/').filter(Boolean).pop()
    return { href: url.pathname, categoryId }
  } catch {
    return { href: '/marketplace' }
  }
}

function findIntentTagPills(): HTMLSpanElement[] {
  const card = document.querySelector('.ys-gig-about-card')
  if (!card) return []

  return Array.from(card.querySelectorAll<HTMLSpanElement>('span')).filter((span) => {
    if (!span.textContent?.trim()) return false
    if (span.closest(`a[${ENHANCED_TAG}="true"]`)) return false
    const style = window.getComputedStyle(span)
    // The service-intent pills have a unique 999px radius + 12.5px type
    // combination inside the About card. Keeping detection here avoids
    // changing the first-paint-sensitive GigDetailPage DOM introduced in #171.
    return style.borderRadius === '999px' && style.fontSize === '12.5px'
  })
}

/**
 * Attribute Marketplace tag searches without polluting public URLs with
 * analytics parameters. The server/hydration-sensitive gig detail keeps its
 * existing stable markup; after hydration each intent pill is wrapped in a
 * real same-origin anchor with a canonical `q=` URL. That preserves native
 * link semantics while avoiding a server/client first-paint mismatch.
 */
export function MarketplaceSearchClickCapture() {
  const pathname = usePathname()

  React.useEffect(() => {
    if (!isGigDetailPath(pathname)) return

    const enhanceTags = () => {
      const base = scopedSearchBase()
      for (const span of findIntentTagPills()) {
        const tag = span.textContent?.trim()
        if (!tag || !span.parentNode) continue

        const anchor = document.createElement('a')
        anchor.setAttribute(ENHANCED_TAG, 'true')
        anchor.href = `${base.href}?q=${encodeURIComponent(tag)}`
        anchor.title = `Search for ${tag}`
        anchor.setAttribute('aria-label', `Search Marketplace for ${tag}`)
        anchor.style.display = 'inline-flex'
        anchor.style.textDecoration = 'none'
        anchor.style.color = 'inherit'
        anchor.style.borderRadius = '999px'

        span.parentNode.replaceChild(anchor, span)
        anchor.appendChild(span)
      }
    }

    enhanceTags()
    const observer = new MutationObserver(enhanceTags)
    const card = document.querySelector('.ys-gig-about-card')
    if (card) observer.observe(card, { childList: true, subtree: true })

    const onClick = (event: MouseEvent) => {
      if (!isGigDetailPath(window.location.pathname)) return

      const target = event.target
      if (!(target instanceof Element)) return
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return

      let destination: URL
      try {
        destination = new URL(anchor.href, window.location.href)
      } catch {
        return
      }
      if (destination.origin !== window.location.origin) return

      const isSearchSurface =
        destination.pathname === '/marketplace'
        || destination.pathname === '/marketplace/'
        || destination.pathname.startsWith('/categories/')
        || destination.pathname.startsWith('/marketplace/categories/')
      if (!isSearchSurface) return

      const query = destination.searchParams.get('q')?.trim()
      if (!query) return

      const categoryId = destination.pathname.startsWith('/categories/')
        ? destination.pathname.split('/').filter(Boolean).pop()
        : undefined
      queueMarketplaceSearchExecution({
        query,
        source: 'tag_click',
        suggestionType: anchor.getAttribute(ENHANCED_TAG) === 'true' ? 'tag' : undefined,
        categoryId,
      })
    }

    document.addEventListener('click', onClick, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
    }
  }, [pathname])

  return null
}
