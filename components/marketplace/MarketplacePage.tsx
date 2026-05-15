// @ts-nocheck
'use client'
import React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { C, Btn, Card } from '../design/shared'
import { LoadingState, ErrorState, EmptyState } from '../design/fiverr-workbench'
import {
  MarketplaceHero,
  CategoryGrid,
  GigGrid,
  TrustSignals,
} from './MarketplaceHero'
import { GigDiscoveryPage } from './GigDiscoveryPage'

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
}

const titleStyle = {
  fontFamily: C.serif,
  fontSize: '36px',
  fontWeight: 500,
  letterSpacing: '-0.012em',
  margin: 0,
  color: C.text,
}

const subStyle = {
  margin: '8px 0 0',
  color: C.textMuted,
  fontSize: '15px',
  lineHeight: 1.6,
}

const sectionStyle = {
  marginBottom: '48px',
}

const sectionTitle = {
  fontFamily: C.serif,
  fontSize: '28px',
  fontWeight: 500,
  margin: '0 0 24px',
  color: C.text,
}

const sectionLink = {
  color: C.cyan,
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
}

const localRail = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '16px',
}

const actionCard = {
  padding: '20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minHeight: '150px',
}

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
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

export function MarketplacePage() {
  const searchParams = useSearchParams()
  const hasFilters = searchParams.has('q') || searchParams.has('category') || searchParams.has('sort')

  const [gigs, setGigs] = React.useState([])
  const [featuredGigs, setFeaturedGigs] = React.useState([])
  const [trendingGigs, setTrendingGigs] = React.useState([])
  const [savedGigs, setSavedGigs] = React.useState([])
  const [recentGigs, setRecentGigs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [gigData, featuredData, trendingData] = await Promise.all([
        requestJson('/api/marketplace/gigs?limit=12').catch(() => ({ gigs: [] })),
        requestJson('/api/marketplace/gigs?sort=featured&limit=6').catch(() => ({ gigs: [] })),
        requestJson('/api/marketplace/gigs?sort=trending&limit=6').catch(() => ({ gigs: [] })),
      ])

      setGigs(gigData.gigs || [])
      setFeaturedGigs(featuredData.gigs || [])
      setTrendingGigs(trendingData.gigs || [])

      // Track impressions for analytics
      for (const gig of [...(gigData.gigs || []), ...(featuredData.gigs || []), ...(trendingData.gigs || [])]) {
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
  }, [])

  React.useEffect(() => {
    if (hasFilters) return
    load()
  }, [hasFilters, load])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setSavedGigs(JSON.parse(window.localStorage.getItem('ys_marketplace_saved_gigs') || '[]').slice(0, 4))
      setRecentGigs(JSON.parse(window.localStorage.getItem('ys_marketplace_recent_gigs') || '[]').slice(0, 4))
    } catch {
      setSavedGigs([])
      setRecentGigs([])
    }
  }, [])

  // If there are filters, show the discovery page instead.
  if (hasFilters) {
    return <GigDiscoveryPage />
  }

  const handleSearch = (query: string) => {
    if (query.trim()) {
      window.location.href = `/marketplace?q=${encodeURIComponent(query.trim())}`
    }
  }

  const handleCategoryClick = (categoryId: string) => {
    window.location.href = `/marketplace/categories/${categoryId}`
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <main style={inner}>
          <LoadingState label="Loading marketplace..." />
        </main>
      </div>
    )
  }

  if (error && !gigs.length) {
    return (
      <div style={pageShell}>
        <main style={inner}>
          <ErrorState message={error} onRetry={load} />
        </main>
      </div>
    )
  }

  return (
    <div style={pageShell}>
      <main style={inner}>
        <div style={toolbar}>
          <div>
            <h1 style={titleStyle}>Marketplace</h1>
            <p style={subStyle}>
              Find verified attorneys, consultants, and professionals for your journey
            </p>
          </div>
          <Link href="/dashboard" style={{ color: C.textMuted, fontWeight: 800, textDecoration: 'none', fontSize: '13px' }}>
            Dashboard
          </Link>
        </div>

        <MarketplaceHero onSearch={handleSearch} />

        <section style={sectionStyle}>
          <div style={localRail}>
            <Card style={actionCard}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: C.text }}>
                  Saved services
                </h2>
                <p style={{ ...subStyle, margin: 0 }}>
                  Shortlist providers and come back when you are ready to order.
                </p>
              </div>
              <Link href="/marketplace?sort=best_rated" style={{ marginTop: 'auto' }}>
                <Btn variant="secondary">Browse top rated</Btn>
              </Link>
            </Card>
            <Card style={actionCard}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: C.text }}>
                  Need guided help?
                </h2>
                <p style={{ ...subStyle, margin: 0 }}>
                  Start from dashboard context and match with attorneys or consultants.
                </p>
              </div>
              <Link href="/dashboard" style={{ marginTop: 'auto' }}>
                <Btn variant="primary">Open dashboard</Btn>
              </Link>
            </Card>
            <Card style={actionCard}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px', color: C.text }}>
                  Provider tools
                </h2>
                <p style={{ ...subStyle, margin: 0 }}>
                  Attorneys and consultants can package services into clear tiers.
                </p>
              </div>
              <Link href="/dashboard/gigs" style={{ marginTop: 'auto' }}>
                <Btn variant="secondary">Manage gigs</Btn>
              </Link>
            </Card>
          </div>
        </section>

        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={sectionTitle}>Browse by Category</h2>
            <Link href="/marketplace/categories" style={sectionLink}>
              View all categories →
            </Link>
          </div>
          <CategoryGrid onCategoryClick={handleCategoryClick} />
        </section>

        <section style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={sectionTitle}>Top Providers</h2>
            <Link href="/marketplace/providers" style={sectionLink}>
              Browse all providers →
            </Link>
          </div>
          <Card style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ color: C.textMuted, marginBottom: '16px' }}>
              Explore our verified attorneys and consultants
            </p>
            <Link href="/marketplace/providers">
              <Btn variant="primary">Find a Provider</Btn>
            </Link>
          </Card>
        </section>

        {featuredGigs.length > 0 && (
          <section style={sectionStyle}>
            <GigGrid gigs={featuredGigs} title="Featured Services" viewAllLink="/marketplace?sort=featured" />
          </section>
        )}

        {trendingGigs.length > 0 && (
          <section style={sectionStyle}>
            <GigGrid gigs={trendingGigs} title="Trending Services" viewAllLink="/marketplace?sort=trending" />
          </section>
        )}

        {savedGigs.length > 0 && (
          <section style={sectionStyle}>
            <GigGrid gigs={savedGigs} title="Saved Services" viewAllLink="/marketplace?sort=best_rated" />
          </section>
        )}

        {recentGigs.length > 0 && (
          <section style={sectionStyle}>
            <GigGrid gigs={recentGigs} title="Recently Viewed" viewAllLink="/marketplace?sort=newest" />
          </section>
        )}

        {gigs.length > 0 && (
          <section style={sectionStyle}>
            <GigGrid gigs={gigs} title="All Services" viewAllLink="/marketplace?sort=newest" />
          </section>
        )}

        {gigs.length === 0 && featuredGigs.length === 0 && trendingGigs.length === 0 && (
          <EmptyState
            title="No services available yet"
            body="Check back soon as providers add their services to the marketplace."
          />
        )}

        <TrustSignals />
      </main>
    </div>
  )
}
