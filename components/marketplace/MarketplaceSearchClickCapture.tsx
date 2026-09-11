'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
    const style = window.getComputedStyle(span)
    // The service-intent pills have a unique 999px radius + 12.5px type
    // combination inside the About card. Keeping detection here avoids
    // changing the first-paint-sensitive GigDetailPage DOM introduced in #171.
    return style.borderRadius === '999px' && style.fontSize === '12.5px'
  })
}

/**
 * Attribute Marketplace tag searches without polluting public URLs with
 * analytics parameters. The component also progressively enhances the
 * existing gig intent pills into keyboard-accessible link controls. This keeps
 * the first-paint GigDetailPage DOM stable while preserving canonical `q=`
 * search navigation on desktop and mobile.
 */
export function MarketplaceSearchClickCapture() {
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    if (!isGigDetailPath(pathname)) return

    const enhanceTags = () => {
      for (const span of findIntentTagPills()) {
        span.setAttribute(ENHANCED_TAG, 'true')
        span.setAttribute('role', 'link')
        span.tabIndex = 0
        span.style.cursor = 'pointer'
        const tag = span.textContent?.trim()
        if (tag) {
          span.setAttribute('title', `Search for ${tag}`)
          span.setAttribute('aria-label', `Search Marketplace for ${tag}`)
        }
      }
    }

    enhanceTags()
    const observer = new MutationObserver(enhanceTags)
    const card = document.querySelector('.ys-gig-about-card')
    if (card) observer.observe(card, { childList: true, subtree: true })

    const runEnhancedTagSearch = (span: HTMLElement) => {
      const query = span.textContent?.trim()
      if (!query) return
      const base = scopedSearchBase()
      queueMarketplaceSearchExecution({
        query,
        source: 'tag_click',
        suggestionType: 'tag',
        categoryId: base.categoryId,
      })
      router.push(`${base.href}?q=${encodeURIComponent(query)}`)
    }

    const onClick = (event: MouseEvent) => {
      if (!isGigDetailPath(window.location.pathname)) return

      const target = event.target
      if (!(target instanceof Element)) return

      // Canonical anchor path: retained for any server-rendered or future tag
      // links. Analytics are queued separately from the URL itself.
      const anchor = target.closest('a[href]') as HTMLAnchorElement | null
      if (anchor) {
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
        queueMarketplaceSearchExecution({ query, source: 'tag_click', suggestionType: 'tag' })
        return
      }

      const span = target.closest(`[${ENHANCED_TAG}="true"]`) as HTMLElement | null
      if (!span) return
      event.preventDefault()
      runEnhancedTagSearch(span)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const target = event.target
      if (!(target instanceof Element)) return
      const span = target.closest(`[${ENHANCED_TAG}="true"]`) as HTMLElement | null
      if (!span) return
      event.preventDefault()
      runEnhancedTagSearch(span)
    }

    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      observer.disconnect()
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [pathname, router])

  return null
}
