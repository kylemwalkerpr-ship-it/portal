// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Card, Btn, Badge, SearchInput } from '../design/shared'
import { SmartSearchBox, rememberSearch } from './SmartSearchBox'
import { ContinueBrowsingRail } from './ContinueBrowsingRail'
import { LoadingState, ErrorState, EmptyState } from '../design/fiverr-workbench'
import { FilterSidebar } from './FilterSidebar'
import { FilterDrawer, SortDropdown, ViewToggle, ActiveFilters, ResultsCount } from './FilterControls'
import { GigCard } from './MarketplaceHero'
import { CATEGORIES, getCategoryById } from '@/lib/categories'
import { responsiveImageProps } from '@/lib/responsiveImage'
import { T, F } from './tokens'

const pageShell: CSSProperties = {
  minHeight: '100vh',
  background: T.paper,
  color: T.cream,
  fontFamily: F.ui,
}

const inner: CSSProperties = {
  width: 'min(1280px, calc(100vw - 32px))',
  margin: '0 auto',
  padding: '32px 0 64px',
}

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '24px',
  flexWrap: 'wrap',
}

const searchBar: CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  width: 'min(560px, 100%)',
  margin: '18px 0 0',
}

const titleStyle: CSSProperties = {
  fontFamily: F.display,
  fontSize: '36px',
  fontWeight: 500,
  letterSpacing: '-0.012em',
  margin: 0,
  color: '#fff',
}

const contentLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px 1fr',
  gap: '32px',
}

const gigGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '20px',
}

const gigList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gigListItem: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '200px 1fr',
  gap: '20px',
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: '16px',
  overflow: 'hidden',
  padding: '16px',
  textDecoration: 'none',
  color: 'inherit',
}

const gigListImage: CSSProperties = {
  width: '100%',
  height: '140px',
  objectFit: 'cover',
  borderRadius: '12px',
  background: T.paper2,
}

const pagination: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '8px',
  marginTop: '32px',
}

const pageButton: CSSProperties = {
  minWidth: '40px',
  height: '40px',
  borderRadius: '10px',
  border: `1px solid ${T.rule}`,
  background: T.vellum,
  color: T.ink,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const activePageButton: CSSProperties = {
  ...pageButton,
  background: T.indigo,
  color: '#fff',
  borderColor: T.indigo,
}

const mobileFilterButton: CSSProperties = {
  display: 'none',
  padding: '12px 20px',
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: '10px',
  color: T.ink,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  alignItems: 'center',
  gap: '8px',
}

const sortOptions = [
  { value: 'relevance', label: 'Recommended' },
  { value: 'best_rated', label: 'Best rated' },
  { value: 'most_orders', label: 'Most orders' },
  { value: 'price_asc', label: 'Price low to high' },
  { value: 'price_desc', label: 'Price high to low' },
  { value: 'newest', label: 'Newest' },
]

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

// Cheap order-sensitive array equality used by the URL → state
// hydration effect so we only call setState when something actually
// changed (otherwise React still re-renders on identical-but-new-ref
// arrays, and we'd burn a render every searchParams tick).
function arraysEqual(a: readonly string[], b: readonly string[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers:
      options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
        : options.headers,
  })
  const payload = await res.json().catch(() => ({}))
  const message = payload?.error?.message || payload?.error || `Request failed (${res.status})`
  if (!res.ok) {
    const error = new Error(message) as any
    error.fields = payload?.error?.fields || {}
    throw error
  }
  return payload?.data ?? payload
}

interface GigDiscoveryPageProps {
  categoryId?: string
  categoryName?: string
}


// ── Phase-1 UX primitives ───────────────────────────────────────────
function GigCardSkeleton() {
  return (
    <div style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 12, overflow: 'hidden' }}>
      <div className="ys-shimmer" style={{ height: 140, background: T.paper2 }} />
      <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div className="ys-shimmer" style={{ width: 22, height: 22, borderRadius: '50%', background: T.paper2 }} />
          <div className="ys-shimmer" style={{ height: 10, width: '46%', borderRadius: 4, background: T.paper2 }} />
        </div>
        <div className="ys-shimmer" style={{ height: 13, width: '92%', borderRadius: 4, background: T.paper2 }} />
        <div className="ys-shimmer" style={{ height: 13, width: '64%', borderRadius: 4, background: T.paper2 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <div className="ys-shimmer" style={{ height: 16, width: 90, borderRadius: 999, background: T.paper }} />
          <div className="ys-shimmer" style={{ height: 18, width: 48, borderRadius: 4, background: T.paper2 }} />
        </div>
      </div>
    </div>
  )
}

function TrustStrip() {
  const item: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12, fontWeight: 600, color: T.inkMid, whiteSpace: 'nowrap',
  }
  return (
    <div style={{
      display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'center',
      padding: '10px 16px', marginBottom: 16, borderRadius: 10,
      background: T.vellum, border: `1px solid ${T.ruleSoft}`,
    }}>
      <span style={item}>🔒 Payment held in escrow until you approve</span>
      <span style={item}>✓ Every seller credential-vetted</span>
      <span style={item}>↩ Refund-backed if no delivery</span>
      <span style={item}>💬 Direct chat before you buy</span>
    </div>
  )
}

export function GigDiscoveryPage({ categoryId, categoryName }: GigDiscoveryPageProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [gigs, setGigs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [view, setView] = React.useState<'grid' | 'list'>('grid')
  const [page, setPage] = React.useState(parseInt(searchParams?.get('page') || '1', 10))
  const [total, setTotal] = React.useState(0)
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false)

  // Filter state — initial values pulled from URL so links like
  // /marketplace?category=legal&country=us land with the right filters
  // pre-applied. Previously these params were silently dropped on mount,
  // which made every category/jurisdiction link on the landing page
  // appear broken.
  const initialCategories = React.useMemo(() => {
    const fromUrl = searchParams?.getAll('category').filter(Boolean) ?? []
    if (categoryId && !fromUrl.includes(categoryId)) fromUrl.push(categoryId)
    return fromUrl
  }, [searchParams, categoryId])

  const [selectedCategories, setSelectedCategories] = React.useState<string[]>(initialCategories)
  const [selectedProviderTypes, setSelectedProviderTypes] = React.useState<string[]>(
    searchParams?.getAll('provider_type').filter(Boolean) ?? [],
  )
  const [selectedJurisdictions, setSelectedJurisdictions] = React.useState<string[]>(() => {
    // Accept both single-value `?country=us` (used by AllGigsDrawer + the
    // landing) and multi-value `?jurisdiction=us&jurisdiction=uk`.
    const single = searchParams?.get('country')
    const multi = searchParams?.getAll('jurisdiction').filter(Boolean) ?? []
    if (single) multi.push(single.toLowerCase())
    return Array.from(new Set(multi.filter((c) => ['us', 'uk', 'ca', 'au'].includes(c))))
  })
  const [minPrice, setMinPrice] = React.useState(searchParams?.get('min_price') || '')
  const [maxPrice, setMaxPrice] = React.useState(searchParams?.get('max_price') || '')
  const [selectedRating, setSelectedRating] = React.useState(searchParams?.get('min_rating') || '')
  const [selectedDeliveryTimes, setSelectedDeliveryTimes] = React.useState<string[]>(
    searchParams?.getAll('delivery_days').filter(Boolean) ?? [],
  )
  const [sort, setSort] = React.useState(searchParams?.get('sort') || 'relevance')
  const [searchQuery, setSearchQuery] = React.useState(searchParams?.get('q') || '')

  // Real facet counts from /api/marketplace/gig-facets. Counts shrink in
  // response to currently-active jurisdiction / provider-type / rating
  // filters so a user picking "United Kingdom" sees the category counts
  // restricted to UK inventory. Previously the sidebar showed
  // getCategorySourceLabels(cat.id).length — the number of taxonomy
  // labels, not real DB inventory — which made every category appear
  // to have the same fabricated count even when zero gigs existed.
  const [facets, setFacets] = React.useState<{
    categoryCounts: Record<string, number>
    jurisdictionCounts: Record<string, number>
    providerTypeCounts: Record<string, number>
    total: number
  } | null>(null)

  React.useEffect(() => {
    const params = new URLSearchParams()
    // Echo the non-category filters so category counts respect them.
    // Don't pass `category` itself — that would zero out non-selected
    // categories and defeat the purpose of the facet sidebar.
    if (selectedJurisdictions.length === 1) params.set('country', selectedJurisdictions[0])
    selectedProviderTypes.forEach((t) => params.append('provider_type', t))
    if (selectedRating) params.set('min_rating', selectedRating)
    const qs = params.toString()
    requestJson(`/api/marketplace/gig-facets${qs ? `?${qs}` : ''}`)
      .then((res: any) => {
        // apiEnvelope shape: { data: {...}, error, meta }
        if (res?.data) setFacets(res.data)
      })
      .catch(() => {
        // Non-fatal — fall back to label-only options without counts.
      })
  }, [selectedJurisdictions, selectedProviderTypes, selectedRating])

  // Category options use real counts when facets are loaded; fall back
  // to undefined (no count badge) before the first fetch resolves.
  const categoryOptions = CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.name,
    count: facets?.categoryCounts?.[cat.id],
  }))

  const providerTypeOptions = [
    { id: 'attorney',   label: 'Attorneys',   count: facets?.providerTypeCounts?.attorney },
    { id: 'consultant', label: 'Consultants', count: facets?.providerTypeCounts?.consultant },
  ]

  const jurisdictionOptions = [
    { id: 'us', label: 'United States',  count: facets?.jurisdictionCounts?.us },
    { id: 'uk', label: 'United Kingdom', count: facets?.jurisdictionCounts?.uk },
    { id: 'ca', label: 'Canada',         count: facets?.jurisdictionCounts?.ca },
    { id: 'au', label: 'Australia',      count: facets?.jurisdictionCounts?.au },
  ]

  const hasActiveFilters = Boolean(
    selectedCategories.length > 0 ||
    selectedProviderTypes.length > 0 ||
    selectedJurisdictions.length > 0 ||
    minPrice ||
    maxPrice ||
    selectedRating ||
    selectedDeliveryTimes.length > 0
  )

  // Build the canonical query string for both the API request AND the
  // browser URL. Doing this once keeps the two perfectly in sync so a
  // refresh restores exactly what the user was looking at.
  const buildQuery = React.useCallback(() => {
    const params = new URLSearchParams()
    if (searchQuery.trim()) params.set('q', searchQuery.trim())
    selectedCategories.forEach(cat => params.append('category', cat))
    selectedProviderTypes.forEach(type => params.append('provider_type', type))
    // API uses a single `country` param (one of us|uk|ca). If the user
    // picks more than one jurisdiction we expose all of them via the
    // multi-value `jurisdiction` param AND emit the first as `country`
    // for backend compatibility — the API filters on whichever it sees.
    if (selectedJurisdictions.length === 1) {
      params.set('country', selectedJurisdictions[0])
    } else if (selectedJurisdictions.length > 1) {
      selectedJurisdictions.forEach((j) => params.append('jurisdiction', j))
    }
    if (minPrice) params.set('min_price', minPrice)
    if (maxPrice) params.set('max_price', maxPrice)
    if (selectedRating) params.set('min_rating', selectedRating)
    selectedDeliveryTimes.forEach(time => params.append('delivery_days', time))
    if (sort && sort !== 'relevance') params.set('sort', sort)
    return params
  }, [
    searchQuery,
    selectedCategories,
    selectedProviderTypes,
    selectedJurisdictions,
    minPrice,
    maxPrice,
    selectedRating,
    selectedDeliveryTimes,
    sort,
  ])

  // Reflect the current filter state in the URL whenever it changes, so
  // refresh / share / browser back-forward preserve filters.
  React.useEffect(() => {
    const qs = buildQuery().toString()
    const target = qs ? `${pathname}?${qs}` : pathname
    router.replace(target, { scroll: false })
  }, [buildQuery, pathname, router])

  // External URL → state hydration.
  //
  // useState(initialCategories) only runs on the first render — so when
  // the header CategoryMegaDropdown navigates to /marketplace?category=X
  // (or any other external URL change: back/forward, paste-link, the
  // jurisdiction picker in the navbar), searchParams updates but the
  // local filter state stays stale: checkboxes don't tick, chips don't
  // appear, the API request still uses yesterday's filters.
  //
  // This effect reads the URL whenever searchParams changes and pushes
  // the values into local state IF they actually differ. The buildQuery
  // → router.replace effect above writes state → URL; this one writes
  // URL → state. They can't loop because each only fires when its
  // source actually changed (and React's setState bail-out short-circuits
  // identical values).
  React.useEffect(() => {
    if (!searchParams) return
    const nextCategories = searchParams.getAll('category').filter(Boolean)
    if (categoryId && !nextCategories.includes(categoryId)) nextCategories.push(categoryId)
    setSelectedCategories(prev => arraysEqual(prev, nextCategories) ? prev : nextCategories)

    const nextProviderTypes = searchParams.getAll('provider_type').filter(Boolean)
    setSelectedProviderTypes(prev => arraysEqual(prev, nextProviderTypes) ? prev : nextProviderTypes)

    const single = searchParams.get('country')
    const multi = searchParams.getAll('jurisdiction').filter(Boolean)
    const merged = Array.from(new Set([
      ...multi,
      ...(single ? [single.toLowerCase()] : []),
    ].filter((c) => ['us', 'uk', 'ca', 'au'].includes(c))))
    setSelectedJurisdictions(prev => arraysEqual(prev, merged) ? prev : merged)

    const nextDelivery = searchParams.getAll('delivery_days').filter(Boolean)
    setSelectedDeliveryTimes(prev => arraysEqual(prev, nextDelivery) ? prev : nextDelivery)

    const nextMin = searchParams.get('min_price') || ''
    setMinPrice(prev => prev === nextMin ? prev : nextMin)
    const nextMax = searchParams.get('max_price') || ''
    setMaxPrice(prev => prev === nextMax ? prev : nextMax)
    const nextRating = searchParams.get('min_rating') || ''
    setSelectedRating(prev => prev === nextRating ? prev : nextRating)
    const nextSort = searchParams.get('sort') || 'relevance'
    setSort(prev => prev === nextSort ? prev : nextSort)
    const nextQ = searchParams.get('q') || ''
    setSearchQuery(prev => prev === nextQ ? prev : nextQ)
  }, [searchParams, categoryId])

  const loadGigs = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = buildQuery()
      params.set('page', String(page))
      params.set('limit', '20')
      // 'relevance' default isn't sent in the URL; pass it to the API
      // explicitly so the backend's default-sort path doesn't shift.
      if (!params.has('sort')) params.set('sort', sort)

      const data = await requestJson(`/api/marketplace/gigs?${params.toString()}`)
      setGigs(data.gigs || [])
      setTotal(data.total || data.gigs?.length || 0)

      // Track impressions — ONE batched request for the whole page, not one
      // per gig (the per-gig loop was 20 Worker invocations per browse).
      const impressionIds = (data.gigs || []).map((g: any) => g.id).filter(Boolean)
      if (impressionIds.length > 0) {
        requestJson('/api/gig-metrics/event', {
          method: 'POST',
          body: JSON.stringify({ gig_ids: impressionIds, event_type: 'impression' }),
        }).catch(() => {})
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [
    buildQuery,
    sort,
    page,
  ])

  React.useEffect(() => {
    loadGigs()
  }, [loadGigs])

  const handleApplyFilters = () => {
    setPage(1)
    setFilterDrawerOpen(false)
  }

  const handleClearFilters = () => {
    setSelectedCategories([])
    setSelectedProviderTypes([])
    setSelectedJurisdictions([])
    setMinPrice('')
    setMaxPrice('')
    setSelectedRating('')
    setSelectedDeliveryTimes([])
    setSearchQuery('')
    setPage(1)
    setFilterDrawerOpen(false)
  }

  const JURISDICTION_LABELS: Record<string, string> = {
    us: 'United States',
    uk: 'United Kingdom',
    ca: 'Canada',
    au: 'Australia',
  }

  const handleRemoveFilter = (id: string) => {
    if (selectedCategories.includes(id)) {
      setSelectedCategories(selectedCategories.filter(c => c !== id))
    } else if (selectedProviderTypes.includes(id)) {
      setSelectedProviderTypes(selectedProviderTypes.filter(t => t !== id))
    } else if (id.startsWith('jurisdiction_')) {
      const code = id.replace('jurisdiction_', '')
      setSelectedJurisdictions(selectedJurisdictions.filter((j) => j !== code))
    } else if (id === 'rating') {
      setSelectedRating('')
    } else if (id.startsWith('delivery_')) {
      setSelectedDeliveryTimes(selectedDeliveryTimes.filter(t => t !== id.replace('delivery_', '')))
    }
    setPage(1)
  }

  const activeFilters = [
    ...selectedCategories.map(id => ({
      id,
      label: getCategoryById(id)?.name || id,
    })),
    ...selectedProviderTypes.map(id => ({
      id,
      label: id === 'attorney' ? 'Attorneys' : 'Consultants',
    })),
    ...selectedJurisdictions.map(code => ({
      id: `jurisdiction_${code}`,
      label: JURISDICTION_LABELS[code] || code.toUpperCase(),
    })),
    ...(selectedRating ? [{ id: 'rating', label: `${selectedRating}+ stars` }] : []),
    ...selectedDeliveryTimes.map(id => ({
      id: `delivery_${id}`,
      label: `${id} day delivery`,
    })),
  ]

  const totalPages = Math.ceil(total / 20)

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setPage(1)
    loadGigs()
  }

  // Title reflects the active filter so the user can see at a glance that
  // their selection took effect. Previously this stayed "All Services" for
  // every URL using ?category= (only the /marketplace/categories/[id]
  // route ever passed a categoryName prop), so toggling categories in the
  // sidebar visibly changed the URL + gig grid but left the page title
  // unchanged — easy to misread as "the page didn't react".
  const titleText = (() => {
    if (categoryName) return categoryName
    if (selectedCategories.length === 1) {
      return getCategoryById(selectedCategories[0])?.name || 'All Services'
    }
    if (selectedCategories.length > 1) return `${selectedCategories.length} categories`
    if (selectedJurisdictions.length === 1) {
      return ({ us: 'United States', uk: 'United Kingdom', ca: 'Canada', au: 'Australia' }[selectedJurisdictions[0]]
        || selectedJurisdictions[0].toUpperCase()) + ' services'
    }
    return 'All services'
  })()

  return (
    <div style={pageShell}>
      <main style={inner}>
        {/* Pick-up-where-you-left-off — hidden during an active search/filter */}
        <ContinueBrowsingRail hidden={!!searchQuery.trim() || hasActiveFilters} />
        <div style={toolbar}>
          <div>
            <h1 style={titleStyle}>{titleText}</h1>
            <ResultsCount total={total} showing={gigs.length} />
            <form onSubmit={(e) => { rememberSearch(searchQuery); handleSearchSubmit(e) }} style={searchBar}>
              <SmartSearchBox
                value={searchQuery}
                onChange={value => {
                  setSearchQuery(value)
                  setPage(1)
                }}
                onSubmit={() => handleSearchSubmit({ preventDefault: () => {} } as React.FormEvent)}
                placeholder="Search visas, legal review, business formation..."
              />
              <Btn variant="primary" type="submit">
                Search
              </Btn>
            </form>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => setFilterDrawerOpen(true)}
              style={{
                ...mobileFilterButton,
                display: 'flex',
              }}
            >
              <span>☰</span>
              <span>Filters</span>
              {hasActiveFilters && <Badge color="cyan">{activeFilters.length}</Badge>}
            </button>
            <SortDropdown value={sort} onChange={setSort} options={sortOptions} />
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>

        <ActiveFilters filters={activeFilters} onRemove={handleRemoveFilter} onClearAll={handleClearFilters} />

        <div style={contentLayout} className="ys-content-layout">
          <div className="ys-filter-sidebar">
            <FilterSidebar
              categories={categoryOptions}
              providerTypes={providerTypeOptions}
              jurisdictions={jurisdictionOptions}
              selectedCategories={selectedCategories}
              selectedProviderTypes={selectedProviderTypes}
              selectedJurisdictions={selectedJurisdictions}
              minPrice={minPrice}
              maxPrice={maxPrice}
              selectedRating={selectedRating}
              selectedDeliveryTimes={selectedDeliveryTimes}
              onCategoriesChange={(v) => { setSelectedCategories(v); setPage(1) }}
              onProviderTypesChange={(v) => { setSelectedProviderTypes(v); setPage(1) }}
              onJurisdictionsChange={(v) => { setSelectedJurisdictions(v); setPage(1) }}
              onPriceChange={(min, max) => {
                setMinPrice(min)
                setMaxPrice(max)
                setPage(1)
              }}
              onRatingChange={value => {
                setSelectedRating(value)
                setPage(1)
              }}
              onDeliveryTimesChange={value => {
                setSelectedDeliveryTimes(value)
                setPage(1)
              }}
              onClear={handleClearFilters}
              onApply={handleApplyFilters}
              hasActiveFilters={hasActiveFilters}
            />
          </div>

          <div>
            {loading ? (
              <>
                <style>{`@keyframes ysShimmer { 0% { opacity: .55 } 50% { opacity: 1 } 100% { opacity: .55 } } .ys-shimmer { animation: ysShimmer 1.4s ease-in-out infinite }`}</style>
                <div style={gigGrid} className="ys-gig-grid">
                  {Array.from({ length: 8 }, (_, i) => <GigCardSkeleton key={i} />)}
                </div>
              </>
            ) : error ? (
              <ErrorState message={error} onRetry={loadGigs} />
            ) : gigs.length === 0 ? (
              <EmptyState
                title="Nothing here yet — let's widen the net"
                body="No services match this exact combination. Clear a filter or two, or tell us what you need and a specialist will respond with an offer."
                action={
                  <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Btn variant="primary" onClick={handleClearFilters}>Clear filters</Btn>
                    <Btn variant="secondary" onClick={() => { window.location.href = '/marketplace?view=inquiries' }}>Describe your case instead</Btn>
                  </div>
                }
              />
            ) : (
              <>
                <TrustStrip />
                {view === 'grid' ? (
                  <div style={gigGrid} className="ys-gig-grid">
                    {gigs.map(gig => (
                      <GigCard key={gig.id} gig={gig} />
                    ))}
                  </div>
                ) : (
                  <div style={gigList}>
                    {gigs.map(gig => (
                      <Link
                        key={gig.id}
                        href={`/marketplace/gigs/${gig.slug}`}
                        style={gigListItem}
                        className="ys-gig-list-item"
                      >
                        {gig.gallery_images?.[0]?.url ? (
                          <img
                            style={gigListImage}
                            {...responsiveImageProps(gig.gallery_images[0].url, gig.title)}
                          />
                        ) : (
                          <div
                            style={{
                              ...gigListImage,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '32px',
                              color: T.inkSoft,
                            }}
                          >
                            {gig.title.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3
                            style={{
                              fontSize: '18px',
                              fontWeight: 700,
                              margin: '0 0 8px',
                              color: T.ink,
                            }}
                          >
                            {gig.title}
                          </h3>
                          {gig.pitch && (
                            <p
                              style={{
                                fontSize: '14px',
                                color: T.inkMid,
                                margin: '0 0 12px',
                                lineHeight: 1.5,
                              }}
                            >
                              {gig.pitch}
                            </p>
                          )}
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ fontSize: '20px', fontWeight: 900, color: T.ink }}>
                              {gig.starting_price ? money(gig.starting_price) : '—'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: T.inkMid }}>
                              <span>★</span>
                              <span>{gig.avg_rating?.toFixed(1) || '0'}</span>
                              <span>({gig.review_count || 0})</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {totalPages > 1 && (
                  <div style={pagination}>
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Btn>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (page <= 3) {
                        pageNum = i + 1
                      } else if (page >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = page - 2 + i
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          style={page === pageNum ? activePageButton : pageButton}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Btn>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <FilterDrawer
          isOpen={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        >
          <FilterSidebar
            categories={categoryOptions}
            providerTypes={providerTypeOptions}
            jurisdictions={jurisdictionOptions}
            selectedCategories={selectedCategories}
            selectedProviderTypes={selectedProviderTypes}
            selectedJurisdictions={selectedJurisdictions}
            minPrice={minPrice}
            maxPrice={maxPrice}
            selectedRating={selectedRating}
            selectedDeliveryTimes={selectedDeliveryTimes}
            onCategoriesChange={setSelectedCategories}
            onProviderTypesChange={setSelectedProviderTypes}
            onJurisdictionsChange={setSelectedJurisdictions}
            onPriceChange={(min, max) => {
              setMinPrice(min)
              setMaxPrice(max)
            }}
            onRatingChange={setSelectedRating}
            onDeliveryTimesChange={setSelectedDeliveryTimes}
            onClear={handleClearFilters}
            onApply={handleApplyFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </FilterDrawer>
      </main>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .ys-content-layout {
            grid-template-columns: 1fr !important;
          }
          .ys-filter-sidebar {
            display: none !important;
          }
        }
        @media (max-width: 700px) {
          /* Tighten the grid to 1 column under 700px. The default
             auto-fill with min(280px) actually already wraps to 1 col
             on narrow screens, but explicit is clearer than implicit. */
          .ys-gig-grid {
            grid-template-columns: 1fr !important;
          }
          /* List view: stack image above content so titles can read. */
          .ys-gig-list-item {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
