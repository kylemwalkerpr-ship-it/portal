// @ts-nocheck
import React from 'react'
import Link from 'next/link'
import { Card, LoadingState, ErrorState, EmptyState, Btn, Input } from '../design/shared'
import { Avatar } from '../design/shared'
import type { SellerProfile } from './SellerProfileComponents'
import { T, F } from './tokens'

export function SellerDirectoryPage() {
  const [sellers, setSellers] = React.useState<SellerProfile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterRole, setFilterRole] = React.useState<'all' | 'attorney' | 'consultant'>('all')
  const [sortBy, setSortBy] = React.useState<'rating' | 'orders' | 'newest'>('rating')

  React.useEffect(() => {
    async function loadSellers() {
      setLoading(true)
      setError('')

      try {
        const res = await fetch('/api/sellers', { credentials: 'same-origin' })
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          throw new Error(err?.error || 'Failed to load sellers')
        }
        const data = await res.json()
        setSellers(data.sellers || [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load sellers')
      } finally {
        setLoading(false)
      }
    }

    loadSellers()
  }, [])

  // Filter and sort sellers
  const filteredSellers = React.useMemo(() => {
    let result = [...sellers]

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(seller =>
        seller.full_name.toLowerCase().includes(query) ||
        seller.tagline?.toLowerCase().includes(query) ||
        seller.specialties?.some(s => s.toLowerCase().includes(query))
      )
    }

    // Filter by role
    if (filterRole !== 'all') {
      result = result.filter(seller => seller.role === filterRole)
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'rating') {
        return (b.rating_avg || 0) - (a.rating_avg || 0)
      } else if (sortBy === 'orders') {
        return (b.total_orders || 0) - (a.total_orders || 0)
      } else if (sortBy === 'newest') {
        return new Date(b.member_since || 0).getTime() - new Date(a.member_since || 0).getTime()
      }
      return 0
    })

    return result
  }, [sellers, searchQuery, filterRole, sortBy])

  if (loading) {
    return (
      <div style={pageShell}>
        <LoadingState message="Loading sellers..." />
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageShell}>
        <ErrorState message={error} />
      </div>
    )
  }

  return (
    <div style={pageShell}>
      {/* Header */}
      <div style={headerSection}>
        <h1 style={pageTitle}>Find Expert Service Providers</h1>
        <p style={pageSub}>
          Browse our verified attorneys and consultants. Find the perfect match for your needs.
        </p>
      </div>

      {/* Filters */}
      <Card style={filtersCard}>
        <div style={filtersRow}>
          <div style={filterGroup}>
            <label style={filterLabel}>Search</label>
            <Input
              type="text"
              placeholder="Search by name, specialty..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={searchInput}
            />
          </div>

          <div style={filterGroup}>
            <label style={filterLabel}>Provider Type</label>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as any)}
              style={selectInput}
            >
              <option value="all">All Providers</option>
              <option value="attorney">Attorneys</option>
              <option value="consultant">Consultants</option>
            </select>
          </div>

          <div style={filterGroup}>
            <label style={filterLabel}>Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={selectInput}
            >
              <option value="rating">Highest Rated</option>
              <option value="orders">Most Orders</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Results */}
      <div style={resultsHeader}>
        <span style={resultsCount}>{filteredSellers.length} provider{filteredSellers.length !== 1 ? 's' : ''} found</span>
      </div>

      {filteredSellers.length === 0 ? (
        <EmptyState
          message="No providers found"
          submessage="Try adjusting your search or filters"
        />
      ) : (
        <div style={sellersGrid}>
          {filteredSellers.map((seller) => (
            <SellerCard key={seller.id} seller={seller} />
          ))}
        </div>
      )}
    </div>
  )
}

function SellerCard({ seller }: { seller: SellerProfile }) {
  const initial = (seller.full_name || '?').trim().charAt(0).toUpperCase()

  return (
    <Link href={`/sellers/${seller.id}`} style={cardLink}>
      <Card style={card}>
        <div style={cardHeader}>
          <div style={cardAvatarContainer}>
            {seller.headshot_url ? (
              <img
                src={seller.headshot_url}
                alt={seller.full_name}
                style={cardAvatar}
              />
            ) : (
              <div style={cardAvatarPlaceholder}>
                {initial}
              </div>
            )}
            {seller.is_online !== false && (
              <div style={cardOnlineIndicator} />
            )}
          </div>

          <div style={cardInfo}>
            <div style={cardNameRow}>
              <h3 style={cardName}>{seller.full_name}</h3>
              {seller.level && <SellerLevelBadge level={seller.level} />}
            </div>

            {seller.tagline && (
              <p style={cardTagline}>{seller.tagline}</p>
            )}

            <div style={cardMeta}>
              {seller.rating_avg && seller.rating_count > 0 ? (
                <span style={cardRating}>
                  <span style={starIcon}>★</span>
                  {seller.rating_avg} ({seller.rating_count})
                </span>
              ) : (
                <span style={cardRating}>New</span>
              )}

              {seller.total_orders !== undefined && (
                <span style={cardOrders}>{seller.total_orders} orders</span>
              )}
            </div>
          </div>
        </div>

        {seller.specialties && seller.specialties.length > 0 && (
          <div style={cardSpecialties}>
            {seller.specialties.slice(0, 3).map((specialty, i) => (
              <span key={i} style={specialtyTag}>{specialty}</span>
            ))}
            {seller.specialties.length > 3 && (
              <span style={specialtyTag}>+{seller.specialties.length - 3}</span>
            )}
          </div>
        )}

        <div style={cardFooter}>
          <span style={cardRole}>{seller.role === 'attorney' ? 'Attorney' : 'Consultant'}</span>
          {seller.starting_price && (
            <span style={cardPrice}>
              From {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(seller.starting_price / 100))}
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}

function SellerLevelBadge({ level }: { level: string }) {
  const colors = {
    new: { bg: '#e5e7eb', text: '#6b7280' },
    level_1: { bg: '#dbeafe', text: '#2563eb' },
    level_2: { bg: '#d1fae5', text: '#059669' },
    top_rated: { bg: '#fef3c7', text: '#d97706' },
  }

  const labels = {
    new: 'New',
    level_1: 'L1',
    level_2: 'L2',
    top_rated: 'Top',
  }

  const color = colors[level as keyof typeof colors] || colors.new
  const label = labels[level as keyof typeof labels] || 'New'

  return (
    <span style={{
      background: color.bg,
      color: color.text,
      fontSize: '10px',
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: '4px',
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageShell = {
  minHeight: '100vh',
  /* transparent — shell owns the paper + pattern */
  color: T.onPaper,
  padding: '24px 32px',
  maxWidth: '1200px',
  margin: '0 auto',
}

const headerSection = {
  marginBottom: '24px',
}

const pageTitle = {
  fontFamily: F.display,
  fontSize: '32px',
  fontWeight: 600,
  color: '#FFFFFF',
  margin: '0 0 8px',
  letterSpacing: '-0.02em',
}

const pageSub = {
  color: 'rgba(255,255,255,0.7)',
  fontSize: '15px',
  lineHeight: 1.5,
  margin: 0,
}

const filtersCard = {
  marginBottom: '24px',
}

const filtersRow = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '16px',
}

const filterGroup = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
}

const filterLabel = {
  fontSize: '12px',
  fontWeight: 600,
  color: T.inkMid,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const searchInput = {
  padding: '10px 12px',
  borderRadius: '8px',
  border: `1px solid ${T.rule}`,
  fontSize: '14px',
  background: T.vellum,
  color: T.ink,
}

const selectInput = {
  padding: '10px 12px',
  borderRadius: '8px',
  border: `1px solid ${T.rule}`,
  fontSize: '14px',
  background: T.vellum,
  color: T.ink,
  cursor: 'pointer',
}

const resultsHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '16px',
}

const resultsCount = {
  fontSize: '14px',
  color: T.inkMid,
}

const sellersGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
  gap: '16px',
}

const cardLink = {
  textDecoration: 'none',
  display: 'block',
}

const card = {
  padding: '0',
  overflow: 'hidden',
  transition: 'transform 200ms, box-shadow 200ms',
  cursor: 'pointer',
}

const cardHeader = {
  padding: '16px',
  display: 'flex',
  gap: '12px',
  alignItems: 'flex-start',
}

const cardAvatarContainer = {
  position: 'relative',
  flexShrink: 0,
}

const cardAvatar = {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  objectFit: 'cover',
}

const cardAvatarPlaceholder = {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  background: T.indigo,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: F.display,
  fontSize: '24px',
  color: '#fff',
  fontWeight: 600,
}

const cardOnlineIndicator = {
  position: 'absolute',
  bottom: '2px',
  right: '2px',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  background: T.moss,
  border: '2px solid #fff',
}

const cardInfo = {
  flex: 1,
  minWidth: 0,
}

const cardNameRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  marginBottom: '4px',
}

const cardName = {
  fontSize: '15px',
  fontWeight: 600,
  color: T.ink,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cardTagline = {
  fontSize: '13px',
  color: T.inkMid,
  margin: '0 0 8px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cardMeta = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const cardRating = {
  fontSize: '13px',
  color: T.ink,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}

const cardOrders = {
  fontSize: '12px',
  color: T.inkMid,
}

const starIcon = {
  color: T.star,
  fontSize: '14px',
}

const cardSpecialties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
  padding: '0 16px 12px',
}

const specialtyTag = {
  background: T.paper2,
  border: `1px solid ${T.rule}`,
  borderRadius: '999px',
  padding: '4px 10px',
  fontSize: '11px',
  color: T.inkMid,
}

const cardFooter = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderTop: `1px solid ${T.rule}`,
  background: T.paper2,
}

const cardRole = {
  fontSize: '12px',
  fontWeight: 600,
  color: T.inkMid,
  textTransform: 'uppercase',
}

const cardPrice = {
  fontSize: '14px',
  fontWeight: 700,
  color: T.ink,
}
