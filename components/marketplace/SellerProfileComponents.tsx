// @ts-nocheck
import React from 'react'
import Link from 'next/link'
import { C, Card, Btn, Badge, Avatar, LoadingState, ErrorState, EmptyState } from '../design/shared'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SellerProfile {
  id: string
  full_name: string
  headshot_url?: string | null
  tagline?: string | null
  bio?: string | null
  intro?: string | null
  jurisdictions?: string | null
  practice_areas?: string | null
  specialties?: string[] | null
  languages?: string[] | null
  credential_type?: string | null
  years_experience?: number | null
  starting_price?: number | null
  offers_free_consult?: boolean
  capacity?: string | null
  profile_url?: string | null
  timezone?: string | null
  available?: boolean
  member_since?: string | null
  rating_count?: number
  rating_avg?: number | null
  response_time?: string
  is_online?: boolean
  total_orders?: number
  total_gigs?: number
  verified?: boolean
  level?: 'new' | 'level_1' | 'level_2' | 'top_rated'
}

export interface SellerGig {
  id: string
  slug: string
  title: string
  summary: string
  category: string
  starting_price: number
  avg_rating: number | null
  review_count: number
  order_count: number
  image_url?: string | null
  gallery_images?: Array<{ url: string }>
}

// ── Components ─────────────────────────────────────────────────────────────────

export function SellerProfileHeader({ seller, isOwnProfile = false, onContact }: { seller: SellerProfile; isOwnProfile?: boolean; onContact?: () => void }) {
  const initial = (seller.full_name || '?').trim().charAt(0).toUpperCase()

  return (
    <div style={headerContainer}>
      <div style={headerContent}>
        {/* Avatar */}
        <div style={avatarContainer}>
          {seller.headshot_url ? (
            <img
              src={seller.headshot_url}
              alt={seller.full_name}
              style={avatarImage}
            />
          ) : (
            <div style={avatarPlaceholder}>
              {initial}
            </div>
          )}
          {seller.is_online !== false && (
            <div style={onlineIndicator} />
          )}
        </div>

        {/* Info */}
        <div style={headerInfo}>
          <div style={headerTopRow}>
            <h1 style={sellerName}>{seller.full_name}</h1>
            {seller.level && <SellerLevelBadge level={seller.level} />}
            {seller.verified && <VerifiedBadge />}
          </div>

          {seller.tagline && <p style={tagline}>{seller.tagline}</p>}

          <div style={headerMeta}>
            {seller.rating_avg && seller.rating_count > 0 ? (
              <div style={ratingDisplay}>
                <span style={starIcon}>★</span>
                <span style={ratingValue}>{seller.rating_avg}</span>
                <span style={ratingCount}>({seller.rating_count})</span>
              </div>
            ) : (
              <span style={noReviews}>No reviews yet</span>
            )}

            {seller.total_orders !== undefined && (
              <span style={metaItem}>{seller.total_orders} Orders in Queue</span>
            )}

            {seller.response_time && (
              <span style={metaItem}>Responds in {seller.response_time}</span>
            )}

            {seller.available !== false ? (
              <span style={availableBadge}>Available for work</span>
            ) : (
              <span style={unavailableBadge}>Currently unavailable</span>
            )}
          </div>

          {seller.member_since && (
            <p style={memberSince}>Member since {new Date(seller.member_since).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          )}
        </div>

        {/* Actions */}
        <div style={headerActions}>
          {isOwnProfile ? (
            // /dashboard/profile routes each role to its real editor
            // (attorney → My Profile tab, consultant → Settings).
            <Link href="/dashboard/profile">
              <Btn variant="primary" size="md">Edit Profile</Btn>
            </Link>
          ) : (
            <>
              <Btn variant="primary" size="md" onClick={onContact}>💬 Chat now</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function SellerStats({ seller }: { seller: SellerProfile }) {
  const stats = [
    { label: 'Rating', value: seller.rating_avg ? `${seller.rating_avg}★` : 'N/A', sub: seller.rating_count ? `${seller.rating_count} reviews` : 'No reviews' },
    { label: 'Orders', value: seller.total_orders?.toLocaleString() || '0', sub: 'Completed' },
    { label: 'Gigs', value: seller.total_gigs?.toLocaleString() || '0', sub: 'Active services' },
    { label: 'Response', value: seller.response_time || 'N/A', sub: 'Avg. response time' },
  ]

  return (
    <div style={statsContainer}>
      {stats.map((stat, i) => (
        <div key={i} style={statItem}>
          <div style={statValue}>{stat.value}</div>
          <div style={statLabel}>{stat.label}</div>
          <div style={statSub}>{stat.sub}</div>
        </div>
      ))}
    </div>
  )
}

export function SellerAbout({ seller }: { seller: SellerProfile }) {
  return (
    <Card>
      <h2 style={sectionTitle}>About Me</h2>

      {seller.intro && (
        <p style={introText}>{seller.intro}</p>
      )}

      {seller.bio && (
        <div style={bioSection}>
          <p style={bioText}>{seller.bio}</p>
        </div>
      )}

      <div style={aboutGrid}>
        {seller.years_experience && (
          <div style={aboutItem}>
            <span style={aboutLabel}>Experience</span>
            <span style={aboutValue}>{seller.years_experience} years</span>
          </div>
        )}

        {seller.credential_type && (
          <div style={aboutItem}>
            <span style={aboutLabel}>Credentials</span>
            <span style={aboutValue}>{seller.credential_type}</span>
          </div>
        )}

        {seller.timezone && (
          <div style={aboutItem}>
            <span style={aboutLabel}>Timezone</span>
            <span style={aboutValue}>{seller.timezone}</span>
          </div>
        )}

        {seller.jurisdictions && (
          <div style={aboutItem}>
            <span style={aboutLabel}>Jurisdictions</span>
            <span style={aboutValue}>{seller.jurisdictions}</span>
          </div>
        )}

        {seller.practice_areas && (
          <div style={aboutItem}>
            <span style={aboutLabel}>Practice Areas</span>
            <span style={aboutValue}>{seller.practice_areas}</span>
          </div>
        )}

        {seller.offers_free_consult && (
          <div style={aboutItem}>
            <span style={aboutLabel}>Free Consult</span>
            <span style={aboutValue}>15 minutes available</span>
          </div>
        )}
      </div>

      {seller.specialties && seller.specialties.length > 0 && (
        <div style={tagsSection}>
          <h3 style={tagsTitle}>Specialties</h3>
          <div style={tagsContainer}>
            {seller.specialties.map((specialty, i) => (
              <span key={i} style={tagBadge}>{specialty}</span>
            ))}
          </div>
        </div>
      )}

      {seller.languages && seller.languages.length > 0 && (
        <div style={tagsSection}>
          <h3 style={tagsTitle}>Languages</h3>
          <div style={tagsContainer}>
            {seller.languages.map((lang, i) => (
              <span key={i} style={tagBadge}>{lang}</span>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

export function SellerGigs({ gigs, loading }: { gigs?: SellerGig[]; loading?: boolean }) {
  if (loading) {
    return (
      <Card>
        <h2 style={sectionTitle}>My Services</h2>
        <LoadingState message="Loading services..." />
      </Card>
    )
  }

  if (!gigs || gigs.length === 0) {
    return (
      <Card>
        <h2 style={sectionTitle}>My Services</h2>
        <EmptyState
          message="No services available yet"
          submessage="Check back soon for new offerings"
        />
      </Card>
    )
  }

  return (
    <div>
      <h2 style={sectionTitle}>My Services ({gigs.length})</h2>
      <div style={gigsGrid}>
        {gigs.map((gig) => (
          <Link key={gig.id} href={`/marketplace/gigs/${gig.slug}`} style={gigCardLink}>
            <Card style={gigCard}>
              {gig.image_url || (gig.gallery_images && gig.gallery_images[0]?.url) ? (
                <img
                  src={gig.image_url || gig.gallery_images![0].url}
                  alt={gig.title}
                  style={gigImage}
                />
              ) : (
                <div style={gigImagePlaceholder}>
                  <span style={gigImagePlaceholderText}>{gig.title.charAt(0)}</span>
                </div>
              )}

              <div style={gigContent}>
                <h3 style={gigTitle}>{gig.title}</h3>
                <p style={gigSummary}>{gig.summary}</p>

                <div style={gigMeta}>
                  {gig.avg_rating && gig.review_count > 0 ? (
                    <span style={gigRating}>
                      <span style={starIcon}>★</span>
                      {gig.avg_rating} ({gig.review_count})
                    </span>
                  ) : (
                    <span style={gigRating}>New</span>
                  )}

                  {gig.order_count > 0 && (
                    <span style={gigOrders}>{gig.order_count} orders</span>
                  )}
                </div>

                <div style={gigPriceRow}>
                  <span style={gigPriceLabel}>Starting at</span>
                  <span style={gigPrice}>${(gig.starting_price / 100).toFixed(0)}</span>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

import { ReviewsSection as NewReviewsSection } from './ReviewComponents'

export function SellerReviews({ reviews }: { reviews?: any[] }) {
  return <NewReviewsSection reviews={reviews || []} />
}

// ── Badges ─────────────────────────────────────────────────────────────────────

function SellerLevelBadge({ level }: { level: string }) {
  const colors = {
    new: { bg: '#e5e7eb', text: '#6b7280' },
    level_1: { bg: '#dbeafe', text: '#2563eb' },
    level_2: { bg: '#d1fae5', text: '#059669' },
    top_rated: { bg: '#fef3c7', text: '#d97706' },
  }

  const labels = {
    new: 'New Seller',
    level_1: 'Level 1',
    level_2: 'Level 2',
    top_rated: 'Top Rated',
  }

  const color = colors[level as keyof typeof colors] || colors.new
  const label = labels[level as keyof typeof labels] || 'New Seller'

  return (
    <Badge style={{ background: color.bg, color: color.text, fontSize: '11px', fontWeight: 600 }}>
      {label}
    </Badge>
  )
}

function VerifiedBadge() {
  return (
    <Badge style={{ background: '#dbeafe', color: '#2563eb', fontSize: '11px', fontWeight: 600 }}>
      ✓ Verified
    </Badge>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const headerContainer = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  padding: '28px 32px',
  marginBottom: '24px',
}

const headerContent = {
  display: 'flex',
  gap: '24px',
  alignItems: 'flex-start',
  flexWrap: 'wrap',
}

const avatarContainer = {
  position: 'relative',
  flexShrink: 0,
}

const avatarImage = {
  width: '120px',
  height: '120px',
  borderRadius: '50%',
  objectFit: 'cover',
  border: `4px solid ${C.surface}`,
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
}

const avatarPlaceholder = {
  width: '120px',
  height: '120px',
  borderRadius: '50%',
  background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDark} 100%)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: C.serif,
  fontSize: '48px',
  color: '#fff',
  fontWeight: 600,
}

const onlineIndicator = {
  position: 'absolute',
  bottom: '8px',
  right: '8px',
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  background: '#22c55e',
  border: '3px solid #fff',
}

const headerInfo = {
  flex: 1,
  minWidth: '280px',
}

const headerTopRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
  marginBottom: '8px',
}

const sellerName = {
  fontFamily: C.serif,
  fontSize: '28px',
  fontWeight: 600,
  color: C.text,
  margin: 0,
  letterSpacing: '-0.02em',
}

const tagline = {
  color: C.textMuted,
  fontSize: '15px',
  lineHeight: 1.5,
  margin: '0 0 12px',
}

const headerMeta = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
  marginBottom: '8px',
}

const ratingDisplay = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}

const starIcon = {
  color: '#f5b400',
  fontSize: '16px',
}

const ratingValue = {
  color: C.text,
  fontSize: '14px',
  fontWeight: 600,
}

const ratingCount = {
  color: C.textMuted,
  fontSize: '13px',
}

const noReviews = {
  color: C.textMuted,
  fontSize: '13px',
}

const metaItem = {
  color: C.textMuted,
  fontSize: '13px',
}

const availableBadge = {
  background: '#d1fae5',
  color: '#059669',
  fontSize: '12px',
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: '999px',
}

const unavailableBadge = {
  background: '#f3f4f6',
  color: '#6b7280',
  fontSize: '12px',
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: '999px',
}

const memberSince = {
  color: C.textDim,
  fontSize: '12px',
  margin: '4px 0 0',
}

const headerActions = {
  display: 'flex',
  gap: '10px',
  flexShrink: 0,
}

const statsContainer = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '16px',
  marginBottom: '24px',
}

const statItem = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  padding: '16px',
  textAlign: 'center',
}

const statValue = {
  fontSize: '24px',
  fontWeight: 700,
  color: C.text,
  marginBottom: '4px',
}

const statLabel = {
  fontSize: '12px',
  fontWeight: 600,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '2px',
}

const statSub = {
  fontSize: '11px',
  color: C.textDim,
}

const sectionTitle = {
  fontFamily: C.serif,
  fontSize: '20px',
  fontWeight: 600,
  color: C.text,
  margin: '0 0 16px',
  letterSpacing: '-0.01em',
}

const introText = {
  color: C.text,
  fontSize: '15px',
  lineHeight: 1.6,
  margin: '0 0 20px',
}

const bioSection = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: '20px',
  marginBottom: '20px',
}

const bioText = {
  color: C.textMuted,
  fontSize: '14px',
  lineHeight: 1.7,
  margin: 0,
}

const aboutGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: '16px',
  marginBottom: '20px',
}

const aboutItem = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const aboutLabel = {
  fontSize: '12px',
  fontWeight: 600,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const aboutValue = {
  fontSize: '14px',
  color: C.text,
}

const tagsSection = {
  borderTop: `1px solid ${C.border}`,
  paddingTop: '16px',
}

const tagsTitle = {
  fontSize: '13px',
  fontWeight: 600,
  color: C.text,
  margin: '0 0 10px',
}

const tagsContainer = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
}

const tagBadge = {
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: '999px',
  padding: '6px 12px',
  fontSize: '12px',
  color: C.text,
}

const gigsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: '16px',
}

const gigCardLink = {
  textDecoration: 'none',
  display: 'block',
}

const gigCard = {
  padding: '0',
  overflow: 'hidden',
  transition: 'transform 200ms, box-shadow 200ms',
  cursor: 'pointer',
}

const gigImage = {
  width: '100%',
  height: '180px',
  objectFit: 'cover',
}

const gigImagePlaceholder = {
  width: '100%',
  height: '180px',
  background: `linear-gradient(135deg, ${C.cyan} 0%, ${C.cyanDark} 100%)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const gigImagePlaceholderText = {
  fontFamily: C.serif,
  fontSize: '48px',
  color: '#fff',
  fontWeight: 600,
}

const gigContent = {
  padding: '16px',
}

const gigTitle = {
  fontSize: '15px',
  fontWeight: 600,
  color: C.text,
  margin: '0 0 8px',
  lineHeight: 1.4,
}

const gigSummary = {
  fontSize: '13px',
  color: C.textMuted,
  margin: '0 0 12px',
  lineHeight: 1.5,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const gigMeta = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '12px',
}

const gigRating = {
  fontSize: '13px',
  color: C.text,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
}

const gigOrders = {
  fontSize: '12px',
  color: C.textMuted,
}

const gigPriceRow = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
}

const gigPriceLabel = {
  fontSize: '12px',
  color: C.textMuted,
}

const gigPrice = {
  fontSize: '18px',
  fontWeight: 700,
  color: C.text,
}

const reviewsList = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const reviewCard = {
  padding: '16px',
}

const reviewHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
}

const reviewAuthor = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const reviewAuthorName = {
  fontSize: '14px',
  fontWeight: 600,
  color: C.text,
}

const reviewDate = {
  fontSize: '12px',
  color: C.textMuted,
}

const reviewRating = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '14px',
  fontWeight: 600,
  color: C.text,
}

const reviewText = {
  fontSize: '14px',
  color: C.textMuted,
  lineHeight: 1.6,
  margin: 0,
}
