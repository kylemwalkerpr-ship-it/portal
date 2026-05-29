'use client'

import React from 'react'
import Link from 'next/link'
import { getCategoriesForRole, type Role } from '@/lib/categories'

const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

interface GalleryImage { url?: string }
interface MarketplaceGig {
  id: string
  slug: string
  title: string
  pitch: string | null
  category: string | null
  jurisdiction: string | null
  provider_type: 'attorney' | 'consultant' | null
  provider_id: string
  avg_rating: number | null
  review_count: number | null
  order_count: number | null
  starting_price?: number | null
  delivery_days?: number | null
  gallery_images?: Array<GalleryImage | string>
  cover_image_url?: string | null
  status: string
  tiers?: Array<{ price?: number; delivery_days?: number; is_active?: boolean }>
  provider?: { full_name?: string; email?: string; username?: string | null }
}



const SORTS = [
  { id: 'rank_score', label: 'Trending' },
  { id: 'best_rated', label: 'Best rated' },
  { id: 'most_orders', label: 'Most orders' },
  { id: 'newest', label: 'Newest' },
] as const
type SortKey = (typeof SORTS)[number]['id']

async function requestJson(url: string) {
  const res = await fetch(url, { credentials: 'same-origin' })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = payload?.error?.message || payload?.error || `Request failed (${res.status})`
    throw new Error(typeof msg === 'string' ? msg : 'Request failed')
  }
  return payload?.data ?? payload
}

function coverFor(gig: MarketplaceGig): string | null {
  if (gig.cover_image_url) return gig.cover_image_url
  const first = gig.gallery_images?.[0]
  if (!first) return null
  if (typeof first === 'string') return first
  return first.url ?? null
}

function startingPriceFor(gig: MarketplaceGig): { cents: number; days: number } | null {
  if (typeof gig.starting_price === 'number' && gig.starting_price > 0) {
    return { cents: gig.starting_price, days: gig.delivery_days ?? 0 }
  }
  const tiers = gig.tiers ?? []
  const active = tiers.filter((t) => t.is_active !== false && Number(t.price ?? 0) > 0)
  if (!active.length) return null
  const cheapest = active.reduce((min, t) => (Number(t.price) < Number(min.price) ? t : min), active[0])
  return { cents: Number(cheapest.price), days: Number(cheapest.delivery_days ?? 0) }
}

function fmtPrice(cents: number): string {
  const dollars = cents / 100
  return dollars >= 1000 ? `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}k` : `$${dollars % 1 === 0 ? dollars : dollars.toFixed(2)}`
}

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·'
}

interface SellerMarketplaceViewProps {
  viewerProfileId: string
  viewerRole: 'attorney' | 'consultant' | 'admin'
}

export default function SellerMarketplaceView({ viewerProfileId, viewerRole }: SellerMarketplaceViewProps) {
  const [gigs, setGigs] = React.useState<MarketplaceGig[]>([])
  const [ownGigs, setOwnGigs] = React.useState<MarketplaceGig[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadingOwn, setLoadingOwn] = React.useState(true)
  const [error, setError] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [debouncedQuery, setDebouncedQuery] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [sort, setSort] = React.useState<SortKey>('rank_score')
  const [country, setCountry] = React.useState<'all' | 'us' | 'uk' | 'ca'>('all')
  const [includeOwn, setIncludeOwn] = React.useState(false)

  const categoryFilters = React.useMemo(() => {
    const all = [{ id: '', label: 'All' }]
    const roleForFilter: Role = viewerRole === 'admin' ? 'attorney' : viewerRole
    const roleCats = getCategoriesForRole(roleForFilter)
    return [...all, ...roleCats.map((cat) => ({ id: cat.id, label: cat.name }))]
  }, [viewerRole])

  // Debounce search input → query so we don't hit the API on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(t)
  }, [query])

  const loadMarketplace = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (category) params.set('category', category)
      if (country !== 'all') params.set('country', country)
      params.set('sort', sort === 'rank_score' ? 'trending' : sort)
      params.set('limit', '36')
      const data = await requestJson(`/api/marketplace/gigs?${params.toString()}`)
      const list = (data?.gigs ?? []) as MarketplaceGig[]
      setGigs(includeOwn ? list : list.filter((g) => g.provider_id !== viewerProfileId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load marketplace.')
    } finally {
      setLoading(false)
    }
  }, [debouncedQuery, category, country, sort, includeOwn, viewerProfileId])

  const loadOwnGigs = React.useCallback(async () => {
    setLoadingOwn(true)
    try {
      const data = await requestJson('/api/gigs') as { gigs?: MarketplaceGig[] }
      // Own services worth showing in the strip: any non-deleted gig.
      // Drafts/paused get rendered alongside live ones so the seller can
      // jump back into editing from the marketplace view.
      const own = (data?.gigs ?? []).filter((g) => g.status !== 'deleted')
      setOwnGigs(own)
    } catch {
      setOwnGigs([])
    } finally {
      setLoadingOwn(false)
    }
  }, [])

  React.useEffect(() => { loadMarketplace() }, [loadMarketplace])
  React.useEffect(() => { loadOwnGigs() }, [loadOwnGigs])

  const activeOwnCount = ownGigs.filter((g) => g.status === 'active').length

  return (
    <div style={{ display: 'grid', gap: '22px', fontFamily: sans }}>

      {/* Your services strip — quick re-entry into the seller's own gigs */}
      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E8E4DC',
          borderRadius: '10px',
          padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' as const }}>
          <div>
            <h2 style={{ fontFamily: serif, fontSize: '18px', fontWeight: 600, color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>
              Your services on the marketplace
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#5C6070' }}>
              {loadingOwn ? 'Loading…' : `${activeOwnCount} live · ${ownGigs.length - activeOwnCount} unpublished`}
            </p>
          </div>
          <Link
            href="/dashboard/gigs"
            style={{ fontSize: '12px', fontWeight: 600, color: '#1F3A6B', textDecoration: 'none' }}
          >
            Manage all →
          </Link>
        </div>

        {loadingOwn ? (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' as const }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ flex: '0 0 220px', height: '84px', background: '#F2EFE9', borderRadius: '8px' }} />
            ))}
          </div>
        ) : ownGigs.length === 0 ? (
          <div style={{ padding: '14px', background: '#FAFAF7', border: '1px dashed #DDD8CE', borderRadius: '8px', textAlign: 'center' as const }}>
            <p style={{ margin: '0 0 8px', fontSize: '13px', color: '#5C6070' }}>
              You don&apos;t have any services yet. Browse the marketplace below to see how others position theirs.
            </p>
            <Link
              href="/dashboard/gigs/new"
              style={{ display: 'inline-block', padding: '6px 14px', borderRadius: '5px', background: '#0F172A', color: '#FFFFFF', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
            >
              + Create first service
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto' as const, paddingBottom: '4px' }}>
            {ownGigs.map((gig) => {
              const cover = coverFor(gig)
              const isLive = gig.status === 'active'
              return (
                <Link
                  key={gig.id}
                  href={`/marketplace/gigs/${gig.slug}`}
                  style={{
                    flex: '0 0 220px',
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px',
                    background: '#FAFAF7',
                    border: `1px solid ${isLive ? 'rgba(26,107,69,0.30)' : '#DDD8CE'}`,
                    borderLeft: `3px solid ${isLive ? '#1A6B45' : '#9A7B3B'}`,
                    borderRadius: '7px',
                    textDecoration: 'none',
                    color: '#0F172A',
                  }}
                >
                  {cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" style={{ width: '52px', height: '52px', borderRadius: '5px', objectFit: 'cover' as const, flexShrink: 0 }} />
                  ) : (
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '5px',
                      background: '#F2EFE9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: serif, fontWeight: 600, color: '#9097A8', fontSize: '16px',
                      flexShrink: 0,
                    }}>
                      {initialsFor(gig.title)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '10px', fontWeight: 700, color: isLive ? '#1A6B45' : '#7A6030',
                      textTransform: 'uppercase' as const, letterSpacing: '0.06em',
                    }}>
                      {isLive ? 'Live' : gig.status}
                    </div>
                    <div style={{
                      fontFamily: serif, fontWeight: 600, fontSize: '13px',
                      lineHeight: 1.2, marginTop: '2px',
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as const,
                    }}>
                      {gig.title}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Browse filters */}
      <section
        style={{
          background: '#FFFFFF',
          border: '1px solid #E8E4DC',
          borderRadius: '10px',
          padding: '16px 18px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.04)',
          display: 'grid', gap: '14px',
        }}
      >
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' as const }}>
          <div style={{ position: 'relative' as const, flex: '1 1 260px', minWidth: 0, maxWidth: '460px' }}>
            <svg
              width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden
              style={{ position: 'absolute' as const, left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9097A8' }}
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search competitor gigs by title, pitch, or keyword…"
              style={{
                width: '100%', padding: '8px 12px 8px 30px', borderRadius: '6px',
                border: '1px solid #DDD8CE', background: '#FFFFFF',
                fontSize: '13px', color: '#0F172A', outline: 'none',
              }}
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value as 'all' | 'us' | 'uk' | 'ca')}
            aria-label="Jurisdiction"
            style={{
              padding: '8px 10px', borderRadius: '6px',
              border: '1px solid #DDD8CE', background: '#FFFFFF',
              fontSize: '13px', color: '#0F172A', cursor: 'pointer',
            }}
          >
            <option value="all">All jurisdictions</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="ca">Canada</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort"
            style={{
              padding: '8px 10px', borderRadius: '6px',
              border: '1px solid #DDD8CE', background: '#FFFFFF',
              fontSize: '13px', color: '#0F172A', cursor: 'pointer',
            }}
          >
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#5C6070', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={includeOwn}
              onChange={(e) => setIncludeOwn(e.target.checked)}
              style={{ accentColor: '#0F172A' }}
            />
            Show my own
          </label>
        </div>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const }}>
          {categoryFilters.map((c) => {
            const isActive = category === c.id
            return (
              <button
                key={c.id || 'all'}
                type="button"
                onClick={() => setCategory(c.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '999px',
                  background: isActive ? '#0F172A' : '#FAFAF7',
                  color: isActive ? '#FFFFFF' : '#5C6070',
                  border: `1px solid ${isActive ? '#0F172A' : '#DDD8CE'}`,
                  fontSize: '12px',
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  fontFamily: sans,
                }}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Results */}
      {error && (
        <div style={{ padding: '14px 18px', background: '#FAEAEA', color: '#8B1A1A', borderRadius: '8px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E8E4DC', borderRadius: '10px', height: '300px' }} />
          ))}
        </div>
      ) : gigs.length === 0 ? (
        <div style={{ padding: '40px 20px', background: '#FFFFFF', border: '1px dashed #DDD8CE', borderRadius: '10px', textAlign: 'center' as const }}>
          <p style={{ fontSize: '14px', color: '#5C6070', margin: 0 }}>
            No services match these filters. {debouncedQuery || category || country !== 'all' ? 'Try widening your search.' : 'The marketplace is still spinning up.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {gigs.map((gig) => <SellerMarketCard key={gig.id} gig={gig} viewerProfileId={viewerProfileId} viewerRole={viewerRole} />)}
        </div>
      )}
    </div>
  )
}

function SellerMarketCard({ gig, viewerProfileId, viewerRole }: { gig: MarketplaceGig; viewerProfileId: string; viewerRole: 'attorney' | 'consultant' | 'admin' }) {
  const cover = coverFor(gig)
  const price = startingPriceFor(gig)
  const isOwn = gig.provider_id === viewerProfileId
  const providerName = gig.provider?.full_name || gig.provider?.email || 'YouSafe provider'
  const reviewCount = gig.review_count ?? 0
  const rating = gig.avg_rating ?? 0

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: `1px solid ${isOwn ? 'rgba(26,107,69,0.30)' : '#E8E4DC'}`,
        borderLeft: `3px solid ${isOwn ? '#1A6B45' : 'transparent'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column' as const,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 14px rgba(15,23,42,0.08)' }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(15,23,42,0.04)' }}
    >
      <Link href={`/marketplace/gigs/${gig.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" style={{ width: '100%', aspectRatio: '16 / 9' as unknown as number, objectFit: 'cover' as const, display: 'block', background: '#F2EFE9' }} />
        ) : (
          <div style={{
            width: '100%', aspectRatio: '16 / 9' as unknown as number,
            background: 'linear-gradient(135deg, #1F3A6B12 0%, #1F3A6B05 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: serif, fontSize: '24px', color: '#1F3A6B', fontWeight: 600,
          }}>
            {initialsFor(gig.title)}
          </div>
        )}
      </Link>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column' as const, gap: '8px', flex: 1 }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' as const, alignItems: 'center' }}>
          {isOwn && (
            <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: '#EAF5EE', color: '#1A6B45', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
              Yours
            </span>
          )}
          {gig.category && (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#F7F5F0', color: '#5C6070', textTransform: 'capitalize' as const }}>
              {gig.category}
            </span>
          )}
          {gig.jurisdiction && (
            <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 7px', borderRadius: '4px', background: '#FFFFFF', color: '#5C6070', border: '1px solid #DDD8CE', textTransform: 'uppercase' as const }}>
              {gig.jurisdiction}
            </span>
          )}
        </div>

        <Link href={`/marketplace/gigs/${gig.slug}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h3 style={{
            fontFamily: serif, fontWeight: 600, fontSize: '15px',
            color: '#0F172A', lineHeight: 1.3, margin: 0,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: 'vertical' as const,
          }}>
            {gig.title}
          </h3>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#5C6070' }}>
          <span style={{
            width: '20px', height: '20px', borderRadius: '50%',
            background: gig.provider_type === 'attorney' ? '#5F6B3A' : '#3C3B6E',
            color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 600, fontSize: '9px',
          }}>{initialsFor(providerName)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const, flex: 1, minWidth: 0 }}>
            {providerName}
          </span>
          {gig.provider_type && (
            <span style={{ fontSize: '9px', fontWeight: 700, color: '#9097A8', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
              {gig.provider_type === 'attorney' ? 'Atty' : 'Cons.'}
            </span>
          )}
        </div>

        {reviewCount > 0 && (
          <div style={{ fontSize: '11px', color: '#5C6070', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#C68B27' }}>★</span>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>{rating.toFixed(1)}</span>
            <span>({reviewCount})</span>
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #F2EFE9' }}>
          {price ? (
            <div>
              <div style={{ fontSize: '9px', color: '#9097A8', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>From</div>
              <div style={{ fontFamily: serif, fontSize: '17px', fontWeight: 600, color: '#0F172A', lineHeight: 1.1 }}>
                {fmtPrice(price.cents)}
                {price.days > 0 && <span style={{ fontSize: '10px', color: '#9097A8', marginLeft: '4px', fontFamily: sans }}>· {price.days}d</span>}
              </div>
            </div>
          ) : <span />}
          <Link
            href={isOwn ? `/dashboard/gigs/${gig.id}/edit` : `/marketplace/gigs/${gig.slug}`}
            style={{
              padding: '6px 12px', borderRadius: '5px',
              background: isOwn ? '#0F172A' : '#FFFFFF',
              color: isOwn ? '#FFFFFF' : '#0F172A',
              border: '1px solid #0F172A',
              fontSize: '12px', fontWeight: 600,
              textDecoration: 'none', letterSpacing: '0.01em',
            }}
          >
            {isOwn ? 'Edit' : 'View'}
          </Link>
        </div>
      </div>
    </div>
  )
}
