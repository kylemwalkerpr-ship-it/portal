'use client'
// @ts-nocheck
import React from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { C, Card, LoadingState, ErrorState, EmptyState, Btn } from '../design/shared'
import { FilterSidebar } from './FilterSidebar'
import { FilterDrawer, SortDropdown, ViewToggle, ActiveFilters, ResultsCount } from './FilterControls'
import { GigCard } from './MarketplaceHero'
import { CATEGORIES, getCategoryById } from '@/lib/categories'

const pageShell = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  fontFamily: C.sans,
}

const inner = {
  width: 'min(1280px, calc(100vw - 32px))',
  margin: '0 auto',
  padding: '32px 0 64px',
}

const toolbar = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  marginBottom: '24px',
  flexWrap: 'wrap',
}

const titleStyle = {
  fontFamily: C.serif,
  fontSize: '36px',
  fontWeight: 500,
  letterSpacing: '-0.012em',
  margin: 0,
  color: C.text,
}

const contentLayout = {
  display: 'grid',
  gridTemplateColumns: '280px 1fr',
  gap: '32px',
}

const gigGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '20px',
}

const gigList = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gigListItem = {
  display: 'grid',
  gridTemplateColumns: '200px 1fr',
  gap: '20px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  overflow: 'hidden',
  padding: '16px',
  textDecoration: 'none',
  color: 'inherit',
}

const gigListImage = {
  width: '100%',
  height: '140px',
  objectFit: 'cover',
  borderRadius: '12px',
  background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
}

const pagination = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '8px',
  marginTop: '32px',
}

const pageButton = {
  minWidth: '40px',
  height: '40px',
  borderRadius: '10px',
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const activePageButton = {
  ...pageButton,
  background: C.cyan,
  color: '#fff',
  borderColor: C.cyan,
}

const mobileFilterButton = {
  display: 'none',
  padding: '12px 20px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '10px',
  color: C.text,
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

async function requestJson(url: string, options = {}) {
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

export function GigDiscoveryPage({ categoryId, categoryName }: GigDiscoveryPageProps) {
  const searchParams = useSearchParams()
  const [gigs, setGigs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [view, setView] = React.useState<'grid' | 'list'>('grid')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [filterDrawerOpen, setFilterDrawerOpen] = React.useState(false)

  // Filter state
  const [selectedCategories, setSelectedCategories] = React.useState<string[]>(categoryId ? [categoryId] : [])
  const [selectedProviderTypes, setSelectedProviderTypes] = React.useState<string[]>([])
  const [minPrice, setMinPrice] = React.useState('')
  const [maxPrice, setMaxPrice] = React.useState('')
  const [selectedRating, setSelectedRating] = React.useState('')
  const [selectedDeliveryTimes, setSelectedDeliveryTimes] = React.useState<string[]>([])
  const [sort, setSort] = React.useState(searchParams.get('sort') || 'relevance')
  const [searchQuery, setSearchQuery] = React.useState(searchParams.get('q') || '')

  // Category options
  const categoryOptions = CATEGORIES.map(cat => ({
    id: cat.id,
    label: cat.name,
  }))

  const providerTypeOptions = [
    { id: 'attorney', label: 'Attorneys' },
    { id: 'consultant', label: 'Consultants' },
  ]

  const hasActiveFilters =
    selectedCategories.length > 0 ||
    selectedProviderTypes.length > 0 ||
    minPrice ||
    maxPrice ||
    selectedRating ||
    selectedDeliveryTimes.length > 0

  const loadGigs = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set('q', searchQuery)
      selectedCategories.forEach(cat => params.append('category', cat))
      selectedProviderTypes.forEach(type => params.append('provider_type', type))
      if (minPrice) params.set('min_price', minPrice)
      if (maxPrice) params.set('max_price', maxPrice)
      if (selectedRating) params.set('min_rating', selectedRating)
      selectedDeliveryTimes.forEach(time => params.append('delivery_days', time))
      params.set('sort', sort)
      params.set('page', String(page))
      params.set('limit', '20')

      const data = await requestJson(`/api/marketplace/gigs?${params.toString()}`)
      setGigs(data.gigs || [])
      setTotal(data.total || data.gigs?.length || 0)

      // Track impressions
      for (const gig of data.gigs || []) {
        requestJson('/api/gig-metrics/event', {
          method: 'POST',
          body: JSON.stringify({ gig_id: gig.id, event_type: 'impression' }),
        }).catch(() => {})
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [
    searchQuery,
    selectedCategories,
    selectedProviderTypes,
    minPrice,
    maxPrice,
    selectedRating,
    selectedDeliveryTimes,
    sort,
    page,
  ])

  React.useEffect(() => {
    loadGigs()
  }, [loadGigs])

  const handleApplyFilters = () => {
    setPage(1)
    loadGigs()
    setFilterDrawerOpen(false)
  }

  const handleClearFilters = () => {
    setSelectedCategories([])
    setSelectedProviderTypes([])
    setMinPrice('')
    setMaxPrice('')
    setSelectedRating('')
    setSelectedDeliveryTimes([])
    setPage(1)
    loadGigs()
    setFilterDrawerOpen(false)
  }

  const handleRemoveFilter = (id: string) => {
    if (selectedCategories.includes(id)) {
      setSelectedCategories(selectedCategories.filter(c => c !== id))
    } else if (selectedProviderTypes.includes(id)) {
      setSelectedProviderTypes(selectedProviderTypes.filter(t => t !== id))
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
    ...(selectedRating ? [{ id: 'rating', label: `${selectedRating}+ stars` }] : []),
    ...selectedDeliveryTimes.map(id => ({
      id: `delivery_${id}`,
      label: `${id} day delivery`,
    })),
  ]

  const totalPages = Math.ceil(total / 20)

  return (
    <div style={pageShell}>
      <main style={inner}>
        <div style={toolbar}>
          <div>
            <h1 style={titleStyle}>
              {categoryName || 'All Services'}
            </h1>
            <ResultsCount total={total} showing={gigs.length} />
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

        <div style={contentLayout}>
          <FilterSidebar
            categories={categoryOptions}
            providerTypes={providerTypeOptions}
            selectedCategories={selectedCategories}
            selectedProviderTypes={selectedProviderTypes}
            minPrice={minPrice}
            maxPrice={maxPrice}
            selectedRating={selectedRating}
            selectedDeliveryTimes={selectedDeliveryTimes}
            onCategoriesChange={setSelectedCategories}
            onProviderTypesChange={setSelectedProviderTypes}
            onPriceChange={setMinPrice}
            onRatingChange={setSelectedRating}
            onDeliveryTimesChange={setSelectedDeliveryTimes}
            onClear={handleClearFilters}
            onApply={handleApplyFilters}
            hasActiveFilters={hasActiveFilters}
          />

          <div>
            {loading ? (
              <LoadingState label="Loading services..." />
            ) : error ? (
              <ErrorState message={error} onRetry={loadGigs} />
            ) : gigs.length === 0 ? (
              <EmptyState
                title="No services match your filters"
                body="Try adjusting your filters or search for something else."
                action={
                  <Btn variant="secondary" onClick={handleClearFilters}>
                    Clear filters
                  </Btn>
                }
              />
            ) : (
              <>
                {view === 'grid' ? (
                  <div style={gigGrid}>
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
                      >
                        {gig.gallery_images?.[0]?.url ? (
                          <img
                            src={gig.gallery_images[0].url}
                            alt={gig.title}
                            style={gigListImage}
                          />
                        ) : (
                          <div
                            style={{
                              ...gigListImage,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '32px',
                              color: C.textDim,
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
                              color: C.text,
                            }}
                          >
                            {gig.title}
                          </h3>
                          {gig.pitch && (
                            <p
                              style={{
                                fontSize: '14px',
                                color: C.textMuted,
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
                            <div style={{ fontSize: '20px', fontWeight: 900, color: C.text }}>
                              {gig.starting_price ? money(gig.starting_price) : '—'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: C.textMuted }}>
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
            selectedCategories={selectedCategories}
            selectedProviderTypes={selectedProviderTypes}
            minPrice={minPrice}
            maxPrice={maxPrice}
            selectedRating={selectedRating}
            selectedDeliveryTimes={selectedDeliveryTimes}
            onCategoriesChange={setSelectedCategories}
            onProviderTypesChange={setSelectedProviderTypes}
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
      `}</style>
    </div>
  )
}
