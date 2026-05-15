// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { C, Btn, Badge, Card, Input, SearchInput } from '../design/shared'
import { CATEGORIES, getPopularCategories } from '@/lib/categories'

const heroStyle: CSSProperties = {
  background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDark} 100%)`,
  color: '#fff',
  padding: '60px 40px',
  borderRadius: '20px',
  marginBottom: '32px',
}

const heroTitle: CSSProperties = {
  fontFamily: C.serif,
  fontSize: '48px',
  fontWeight: 600,
  margin: '0 0 16px',
  lineHeight: 1.2,
  letterSpacing: '-0.02em',
}

const heroSubtitle: CSSProperties = {
  fontSize: '18px',
  margin: '0 0 32px',
  opacity: 0.9,
  lineHeight: 1.6,
}

const searchContainer: CSSProperties = {
  maxWidth: '640px',
  margin: '0 auto',
}

const categoryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '16px',
  marginBottom: '40px',
}

const categoryCard: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  padding: '20px',
  textAlign: 'center',
  cursor: 'pointer',
  transition: 'all 200ms ease',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
}

const categoryIcon: CSSProperties = {
  fontSize: '40px',
  lineHeight: 1,
}

const categoryName: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: C.text,
  margin: 0,
}

const categoryCount: CSSProperties = {
  fontSize: '12px',
  color: C.textMuted,
  margin: 0,
}

const sectionHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: '14px',
  paddingBottom: '8px',
  borderBottom: `1px solid ${C.border}`,
}

const sectionTitle: CSSProperties = {
  fontFamily: C.serif,
  fontSize: '22px',
  fontWeight: 600,
  margin: 0,
  color: C.text,
  letterSpacing: '-.012em',
}

const sectionLink: CSSProperties = {
  color: C.cyan,
  fontSize: '12px',
  fontWeight: 700,
  textDecoration: 'none',
  letterSpacing: '.02em',
}

// ── Gig card tokens (cleaned up — tighter, less clutter) ───────────────────
const gigGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
  gap: '14px',
}

const gigCard: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  overflow: 'hidden',
  transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
}

const gigImage: CSSProperties = {
  width: '100%',
  height: '140px',
  objectFit: 'cover',
  background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
}

const gigContent: CSSProperties = {
  padding: '12px 14px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  flex: 1,
}

const gigProviderLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 11,
  color: C.textMuted,
  fontWeight: 600,
  letterSpacing: '.02em',
  cursor: 'pointer',
}

const gigTitle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  margin: 0,
  color: C.text,
  lineHeight: 1.35,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const gigMeta: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  marginTop: 'auto',
  paddingTop: 6,
  gap: 6,
}

const gigPrice: CSSProperties = {
  fontSize: '15px',
  fontWeight: 800,
  color: C.text,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}

const gigRating: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  fontSize: '12px',
  color: C.textMuted,
}

// Legacy exports kept so any other importer doesn't break
const gigProvider: CSSProperties = gigProviderLine
const providerAvatar: CSSProperties = {
  width: '20px', height: '20px', borderRadius: '50%',
  background: `${C.cyan}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '9px', fontWeight: 700, color: C.cyan, flexShrink: 0,
}
const providerNameStyle: CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: C.textMuted,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

const trustSection: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '20px',
  marginTop: '48px',
  padding: '32px',
  background: `${C.cyan}08`,
  borderRadius: '16px',
}

const trustItem: CSSProperties = {
  textAlign: 'center',
}

const trustIcon: CSSProperties = {
  fontSize: '32px',
  marginBottom: '12px',
}

const trustLabel: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: C.text,
  margin: '0 0 4px',
}

const trustDescription: CSSProperties = {
  fontSize: '12px',
  color: C.textMuted,
  margin: 0,
}

interface MarketplaceHeroProps {
  onSearch?: (query: string) => void
}

export function MarketplaceHero({ onSearch }: MarketplaceHeroProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    onSearch?.(value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      window.location.href = `/marketplace?q=${encodeURIComponent(searchQuery.trim())}`
    }
  }

  return (
    <div style={heroStyle}>
      <h1 style={heroTitle}>Find the Right Expert for Your Journey</h1>
      <p style={heroSubtitle}>
        Connect with verified attorneys, consultants, and professionals for immigration,
        education, career, and settlement support.
      </p>
      <form onSubmit={handleSubmit} style={searchContainer}>
        <SearchInput
          value={searchQuery}
          onChange={handleSearch}
          placeholder="Search for services, categories, or providers..."
          style={{
            padding: '16px 20px',
            fontSize: '16px',
            borderRadius: '12px',
            border: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          }}
        />
      </form>
    </div>
  )
}

interface CategoryCardProps {
  category: { id: string; name: string; icon: string; subcategories: any[] }
  onClick?: (categoryId: string) => void
}

export function CategoryCard({ category, onClick }: CategoryCardProps) {
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      style={{
        ...categoryCard,
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.12)' : 'none',
        borderColor: hovered ? C.cyan : C.border,
      }}
      onClick={() => onClick?.(category.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={categoryIcon}>{category.icon}</span>
      <h3 style={categoryName}>{category.name}</h3>
      <p style={categoryCount}>{category.subcategories.length} services</p>
    </div>
  )
}

interface CategoryGridProps {
  onCategoryClick?: (categoryId: string) => void
}

export function CategoryGrid({ onCategoryClick }: CategoryGridProps) {
  const categories = getPopularCategories()

  return (
    <div style={categoryGrid}>
      {categories.map(category => (
        <CategoryCard
          key={category.id}
          category={category}
          onClick={onCategoryClick}
        />
      ))}
    </div>
  )
}

interface GigCardProps {
  gig: {
    id: string
    slug: string
    title: string
    pitch?: string
    starting_price?: number
    avg_rating?: number
    review_count?: number
    provider?: {
      full_name?: string
      email?: string
      id?: string
    }
    provider_id?: string
    provider_type?: string
    gallery_images?: Array<{ url: string }>
  }
}

export function GigCard({ gig }: GigCardProps) {
  const [hovered, setHovered] = React.useState(false)

  const imageUrl = gig.gallery_images?.[0]?.url
  const price = gig.starting_price ? (gig.starting_price / 100).toFixed(0) : null
  const rating = gig.avg_rating?.toFixed(1) || '0'
  const reviewCount = gig.review_count || 0
  const providerName = gig.provider?.full_name || gig.provider?.email || 'YouSafe Provider'
  const providerId = gig.provider?.id || gig.provider_id

  const handleProviderClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (providerId) {
      window.location.href = `/sellers/${providerId}`
    }
  }

  const initials = providerName.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0] || '').join('').toUpperCase()
  const showRating = (gig.avg_rating ?? 0) > 0 && (gig.review_count ?? 0) > 0

  return (
    <Link
      href={`/marketplace/gigs/${gig.slug}`}
      style={{
        ...gigCard,
        transform: hovered ? 'translateY(-2px)' : 'none',
        boxShadow: hovered ? '0 6px 18px rgba(27,45,79,0.10)' : '0 1px 2px rgba(27,45,79,0.04)',
        borderColor: hovered ? '#C8C2B6' : C.border,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={gig.title} style={gigImage} />
      ) : (
        <div style={{ ...gigImage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: C.textDim, fontWeight: 700, letterSpacing: '.04em' }}>
          {gig.title.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={gigContent}>
        {/* Provider line — replaces the bottom strip; saves vertical space */}
        <div
          style={{ ...gigProviderLine, cursor: providerId ? 'pointer' : 'default' }}
          onClick={handleProviderClick}
        >
          <span style={providerAvatar}>{initials}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{providerName}</span>
          {gig.provider_type && (
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: gig.provider_type === 'attorney' ? 'rgba(26,107,69,0.12)' : 'rgba(61,43,107,0.12)', color: gig.provider_type === 'attorney' ? '#1A6B45' : '#3D2B6B' }}>
              {gig.provider_type === 'attorney' ? 'Attorney' : 'Consultant'}
            </span>
          )}
        </div>

        <h3 style={gigTitle}>{gig.title}</h3>

        <div style={gigMeta}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {price && (
              <>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, letterSpacing: '.06em', textTransform: 'uppercase' }}>From</span>
                <span style={gigPrice}>${price}</span>
              </>
            )}
          </div>
          {showRating && (
            <div style={gigRating}>
              <span style={{ color: '#C4A45A' }}>★</span>
              <span style={{ fontWeight: 700, color: C.text }}>{rating}</span>
              <span style={{ color: C.textDim, fontSize: 11 }}>({reviewCount})</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

interface GigGridProps {
  gigs: GigCardProps['gig'][]
  title?: string
  viewAllLink?: string
}

export function GigGrid({ gigs, title, viewAllLink }: GigGridProps) {
  if (gigs.length === 0) return null

  return (
    <div>
      {title && (
        <div style={sectionHeader}>
          <h2 style={sectionTitle}>{title}</h2>
          {viewAllLink && (
            <Link href={viewAllLink} style={sectionLink}>
              View all →
            </Link>
          )}
        </div>
      )}
      <div style={gigGrid}>
        {gigs.map(gig => (
          <GigCard key={gig.id} gig={gig} />
        ))}
      </div>
    </div>
  )
}

interface TrustSignalsProps {
  showTitle?: boolean
}

export function TrustSignals({ showTitle = true }: TrustSignalsProps) {
  const signals = [
    {
      icon: '✓',
      label: 'Verified Providers',
      description: 'All providers are vetted and verified',
    },
    {
      icon: '🔒',
      label: 'Secure Payments',
      description: 'Escrow-protected transactions',
    },
    {
      icon: '⭐',
      label: 'Quality Guaranteed',
      description: 'Review-based quality system',
    },
    {
      icon: '💬',
      label: '24/7 Support',
      description: 'Dedicated customer support',
    },
  ]

  return (
    <div style={trustSection}>
      {signals.map(signal => (
        <div key={signal.label} style={trustItem}>
          <div style={trustIcon}>{signal.icon}</div>
          <h4 style={trustLabel}>{signal.label}</h4>
          <p style={trustDescription}>{signal.description}</p>
        </div>
      ))}
    </div>
  )
}
