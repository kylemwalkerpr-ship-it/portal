'use client'
// @ts-nocheck
import React from 'react'
import Link from 'next/link'
import { C, Btn, Badge, Card, Input, SearchInput } from '../shared'
import { CATEGORIES, getPopularCategories } from '@/lib/categories'

const heroStyle = {
  background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDark} 100%)`,
  color: '#fff',
  padding: '60px 40px',
  borderRadius: '20px',
  marginBottom: '32px',
}

const heroTitle = {
  fontFamily: C.serif,
  fontSize: '48px',
  fontWeight: 600,
  margin: '0 0 16px',
  lineHeight: 1.2,
  letterSpacing: '-0.02em',
}

const heroSubtitle = {
  fontSize: '18px',
  margin: '0 0 32px',
  opacity: 0.9,
  lineHeight: 1.6,
}

const searchContainer = {
  maxWidth: '640px',
  margin: '0 auto',
}

const categoryGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: '16px',
  marginBottom: '40px',
}

const categoryCard = {
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

const categoryIcon = {
  fontSize: '40px',
  lineHeight: 1,
}

const categoryName = {
  fontSize: '14px',
  fontWeight: 700,
  color: C.text,
  margin: 0,
}

const categoryCount = {
  fontSize: '12px',
  color: C.textMuted,
  margin: 0,
}

const sectionHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px',
}

const sectionTitle = {
  fontFamily: C.serif,
  fontSize: '28px',
  fontWeight: 500,
  margin: 0,
  color: C.text,
}

const sectionLink = {
  color: C.cyan,
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
}

const gigGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '20px',
}

const gigCard = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  overflow: 'hidden',
  transition: 'all 200ms ease',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'inherit',
  display: 'block',
}

const gigImage = {
  width: '100%',
  height: '180px',
  objectFit: 'cover',
  background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
}

const gigContent = {
  padding: '16px',
}

const gigTitle = {
  fontSize: '16px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const gigMeta = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '12px',
}

const gigPrice = {
  fontSize: '20px',
  fontWeight: 900,
  color: C.text,
}

const gigRating = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '13px',
  color: C.textMuted,
}

const gigProvider = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginTop: '12px',
  paddingTop: '12px',
  borderTop: `1px solid ${C.border}`,
}

const providerAvatar = {
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  background: `${C.cyan}22`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 700,
  color: C.cyan,
}

const providerName = {
  fontSize: '13px',
  fontWeight: 600,
  color: C.text,
}

const trustSection = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '20px',
  marginTop: '48px',
  padding: '32px',
  background: `${C.cyan}08`,
  borderRadius: '16px',
}

const trustItem = {
  textAlign: 'center',
}

const trustIcon = {
  fontSize: '32px',
  marginBottom: '12px',
}

const trustLabel = {
  fontSize: '14px',
  fontWeight: 700,
  color: C.text,
  margin: '0 0 4px',
}

const trustDescription = {
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

  return (
    <Link
      href={`/marketplace/gigs/${gig.slug}`}
      style={{
        ...gigCard,
        transform: hovered ? 'translateY(-4px)' : 'none',
        boxShadow: hovered ? '0 12px 32px rgba(0,0,0,0.12)' : 'none',
        borderColor: hovered ? C.cyan : C.border,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={gig.title} style={gigImage} />
      ) : (
        <div style={{ ...gigImage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', color: C.textDim }}>
          {gig.title.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={gigContent}>
        <h3 style={gigTitle}>{gig.title}</h3>
        {gig.pitch && (
          <p style={{ fontSize: '13px', color: C.textMuted, margin: '0 0 12px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {gig.pitch}
          </p>
        )}
        <div style={gigMeta}>
          {price && <div style={gigPrice}>${price}</div>}
          <div style={gigRating}>
            <span>★</span>
            <span>{rating}</span>
            {reviewCount > 0 && <span>({reviewCount})</span>}
          </div>
        </div>
        <div style={{ ...gigProvider, cursor: providerId ? 'pointer' : 'default' }} onClick={handleProviderClick}>
          <div style={providerAvatar}>
            {providerName.split(' ').map(n => n[0]).join('').toUpperCase()}
          </div>
          <span style={providerName}>{providerName}</span>
          {gig.provider_type && (
            <Badge color={gig.provider_type === 'attorney' ? 'green' : 'purple'} style={{ marginLeft: 'auto' }}>
              {gig.provider_type}
            </Badge>
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
