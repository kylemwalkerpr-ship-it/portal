// Shared display helpers for the marketplace landing surfaces.
//
// Extracted from app/marketplace/PublicMarketplaceLanding.tsx so the
// server-rendered landing and the client FeaturedBriefsGrid render cards
// identically from one source of truth (headshots, glyphs, prices, pager
// chips). Pure functions only — no fetching, no hooks.

import type { CSSProperties } from 'react'
import { T, F } from '@/components/marketplace/tokens'

export type Country = 'all' | 'us' | 'uk' | 'ca' | 'au'
export type JxCode = Exclude<Country, 'all'>

export interface LandingGig {
  id: string
  slug: string | null
  title: string
  category: string | null
  provider_type: 'attorney' | 'consultant' | null
  avg_rating: number
  review_count: number
  rank_score: number
  order_count: number
  starting_price: number | null
  delivery_days: number | null
  providerName: string
  providerCountry: string | null
  // Resolved headshot from the seller-specific table (attorneys.headshot_url
  // or consultants.headshot_url). profiles.avatar_url is rarely populated
  // for verified sellers, so the cards previously fell through to initials
  // even when the seller had uploaded a real photo on their profile.
  providerHeadshot: string | null
  jx: JxCode | null
  tiers: Array<{ price: number; delivery_days: number | null }>
  cover_image_url: string | null
  gallery_images: Array<{ url: string }>
}

export const COUNTRY_CODE_MAP: Record<string, JxCode> = {
  US: 'us', USA: 'us', 'UNITED STATES': 'us',
  UK: 'uk', GB: 'uk', GBR: 'uk', 'UNITED KINGDOM': 'uk',
  CA: 'ca', CAN: 'ca', CANADA: 'ca',
  AU: 'au', AUS: 'au', AUSTRALIA: 'au',
}

export const COUNTRY_META: Record<JxCode, { name: string; currency: string }> = {
  us: { name: 'United States', currency: 'USD' },
  uk: { name: 'United Kingdom', currency: 'GBP' },
  ca: { name: 'Canada', currency: 'CAD' },
  au: { name: 'Australia', currency: 'AUD' },
}

export function resolveJurisdiction(country?: string | null): JxCode | null {
  if (!country) return null
  return COUNTRY_CODE_MAP[country.toUpperCase().trim()] || null
}

export function formatPrice(cents: number | null, currency = 'USD'): string {
  if (cents == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || 'YS'
}

export function glyphFor(gig: { title: string; category: string | null }): string {
  const cat = (gig.category ?? '').toLowerCase()
  const title = gig.title.toLowerCase()
  if (/i-?130|i130/.test(title)) return 'I-130'
  if (/i-?485|i485|green card/.test(title)) return 'I-485'
  if (/i-?765|i765|opt/.test(title)) return 'OPT'
  if (/i-?20|f-?1|f1\b/.test(title)) return 'F-1'
  if (/h-?1b|h1b/.test(title)) return 'H-1B'
  if (/ilr\b|spouse/.test(title)) return 'ILR'
  if (/section 21|s21|§21|renters? rights/.test(title)) return '§21'
  if (/express entry|crs/.test(title)) return 'CRS'
  if (/pgwp/.test(title)) return 'PGWP'
  if (/1040|tax|treaty/.test(title)) return '1040'
  if (/lmia/.test(title)) return 'LMIA'
  if (cat.includes('study')) return 'F-1'
  if (cat.includes('work')) return 'OPT'
  if (cat.includes('pr') || cat.includes('residency')) return 'PR'
  if (cat.includes('family')) return '§'
  if (cat.includes('document')) return 'Doc'
  if (cat.includes('tax')) return '1040'
  if (cat.includes('housing') || cat.includes('tenancy') || cat.includes('settlement')) return '§21'
  const firstWord = gig.title.split(' ')[0]
  return firstWord ? firstWord.slice(0, 4) : 'YS'
}

export function deliveryLabel(days: number | null): string {
  if (!days || days < 1) return 'Flexible delivery'
  if (days === 1) return 'Same-day'
  if (days === 2) return '48-hour delivery'
  return `${days}-day delivery`
}

export function avatarBgFor(provider_type: 'attorney' | 'consultant' | null): string {
  return provider_type === 'attorney' ? T.indigo : T.moss
}

export function withCountry(href: string, country: Country): string {
  if (country === 'all') return href
  const sep = href.includes('?') ? '&' : '?'
  return `${href}${sep}country=${country}`
}

// Fiverr-style pagination chip: filled for the active page, outlined for
// links. Inline styles match the rest of the landing's token-driven look.
export function pagerChipStyle(isActive: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
    height: 34,
    padding: '0 10px',
    borderRadius: 999,
    fontFamily: F.mono,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textDecoration: 'none',
    border: `1px solid ${isActive ? T.ink : 'rgba(0,0,0,0.18)'}`,
    background: isActive ? T.ink : 'transparent',
    color: isActive ? '#fff' : T.ink,
  }
}

// Featured-grid page size, shared by the server landing (initial clamp) and
// the client FeaturedBriefsGrid (Load-more increments).
export const FEATURED_PAGE_SIZE = 48

/* ── Pure paging math (unit-tested in tests/marketplace-featured-grid.test.ts) ── */

// Total pages for a ranked slice of `totalItems` gigs.
export function totalPagesFor(totalItems: number): number {
  return Math.max(1, Math.ceil(totalItems / FEATURED_PAGE_SIZE))
}

// Clamp a URL page to the valid range [1, totalPages]. Non-finite input
// (garbage query params that slipped past upstream parsing) → page 1.
export function clampPage(page: number, totalItems: number): number {
  if (!Number.isFinite(page)) return 1
  return Math.min(Math.max(1, Math.trunc(page)), totalPagesFor(totalItems))
}

// Zero-based index of the first card of `page` — the scroll target for
// deep links and pager jumps.
export function pageStartIndex(page: number, totalItems: number): number {
  return (clampPage(page, totalItems) - 1) * FEATURED_PAGE_SIZE
}

// Cumulative SSR visibility for a deep-linked ?page=N: pages 1..N render
// server-side (SSR always matches the URL for crawlers), so page 3 shows
// cards 1–144 on first paint. The client grid then takes over.
export function deepLinkVisibleCount(page: number, totalItems: number): number {
  return Math.min(clampPage(page, totalItems) * FEATURED_PAGE_SIZE, totalItems)
}
