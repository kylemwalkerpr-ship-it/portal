// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { C, Card, Btn, Badge, Avatar, Input, Textarea } from '../design/shared'

const pageShell: CSSProperties = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  fontFamily: C.sans,
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
}

const titleStyle: CSSProperties = {
  fontFamily: C.serif,
  fontSize: '36px',
  fontWeight: 500,
  letterSpacing: '-0.012em',
  margin: 0,
  color: C.text,
}

const contentLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 380px',
  gap: '32px',
}

const mainContent: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const sidebar: CSSProperties = {
  position: 'sticky',
  top: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gigImage: CSSProperties = {
  width: '100%',
  height: '400px',
  objectFit: 'cover',
  borderRadius: '16px',
  background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
}

const galleryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: '12px',
  marginTop: '16px',
}

const galleryThumbnail: CSSProperties = {
  width: '100%',
  aspectRatio: '1',
  objectFit: 'cover',
  borderRadius: '12px',
  cursor: 'pointer',
  border: `2px solid transparent`,
  transition: 'border-color 200ms',
}

const sectionTitle: CSSProperties = {
  fontFamily: C.serif,
  fontSize: '24px',
  fontWeight: 500,
  margin: '0 0 16px',
  color: C.text,
}

const sectionSubtitle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  margin: '0 0 12px',
}

const tierCard: CSSProperties = {
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
  padding: '20px',
  cursor: 'pointer',
  transition: 'all 200ms',
  background: C.surface,
}

const tierCardSelected: CSSProperties = {
  borderColor: C.cyan,
  background: `${C.cyan}08`,
}

const tierHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '12px',
}

const tierName: CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  margin: 0,
  color: C.text,
}

const tierPrice: CSSProperties = {
  fontSize: '24px',
  fontWeight: 900,
  color: C.text,
}

const tierMeta: CSSProperties = {
  display: 'flex',
  gap: '16px',
  fontSize: '13px',
  color: C.textMuted,
  marginBottom: '12px',
}

const tierFeatures: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
}

const tierFeature: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  color: C.text,
}

const sellerCard: CSSProperties = {
  display: 'flex',
  gap: '16px',
  padding: '20px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '16px',
}

const sellerAvatar: CSSProperties = {
  width: '64px',
  height: '64px',
  borderRadius: '50%',
  background: `${C.cyan}22`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '24px',
  fontWeight: 700,
  color: C.cyan,
  flexShrink: 0,
}

const sellerInfo: CSSProperties = {
  flex: 1,
}

const sellerName: CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  margin: '0 0 4px',
  color: C.text,
}

const sellerRole: CSSProperties = {
  fontSize: '13px',
  color: C.textMuted,
  margin: '0 0 8px',
}

const sellerStats: CSSProperties = {
  display: 'flex',
  gap: '16px',
  fontSize: '13px',
}

const sellerStat: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const sellerStatLabel: CSSProperties = {
  color: C.textMuted,
  fontSize: '11px',
  margin: '0 0 2px',
}

const sellerStatValue: CSSProperties = {
  fontWeight: 700,
  color: C.text,
  margin: 0,
}

const reviewCard: CSSProperties = {
  padding: '16px',
  background: C.surface2,
  borderRadius: '12px',
  marginBottom: '12px',
}

const reviewHeader: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '8px',
}

const reviewAuthor: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  margin: 0,
  color: C.text,
}

const reviewDate: CSSProperties = {
  fontSize: '12px',
  color: C.textMuted,
}

const reviewRating: CSSProperties = {
  display: 'flex',
  gap: '2px',
  fontSize: '14px',
  color: '#FFD700',
  marginBottom: '8px',
}

const reviewBody: CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.6,
  color: C.text,
  margin: 0,
}

const faqItem: CSSProperties = {
  borderBottom: `1px solid ${C.border}`,
  padding: '16px 0',
}

const faqQuestion: CSSProperties = {
  fontSize: '15px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
}

const faqAnswer: CSSProperties = {
  fontSize: '14px',
  lineHeight: 1.6,
  color: C.textMuted,
  margin: 0,
}

const similarGigCard: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: '12px',
  overflow: 'hidden',
  textDecoration: 'none',
  color: 'inherit',
  display: 'block',
}

const similarGigImage: CSSProperties = {
  width: '100%',
  height: '120px',
  objectFit: 'cover',
}

const similarGigContent: CSSProperties = {
  padding: '12px',
}

const similarGigTitle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  margin: '0 0 8px',
  color: C.text,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const similarGigPrice: CSSProperties = {
  fontSize: '16px',
  fontWeight: 900,
  color: C.text,
}

const trustBadge: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  background: `${C.green}10`,
  border: `1px solid ${C.green}33`,
  borderRadius: '8px',
  fontSize: '13px',
  color: C.green,
  fontWeight: 600,
}

const availabilityIndicator: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '13px',
  color: C.textMuted,
}

const availabilityDot: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
}

const availabilityDotOnline: CSSProperties = {
  background: C.green,
}

const availabilityDotOffline: CSSProperties = {
  background: C.textDim,
}

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

function compactDate(value: string) {
  if (!value) return 'No date'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return 'No date'
  }
}

interface SellerProfileCardProps {
  seller: {
    id: string
    full_name?: string
    email?: string
    role?: string
    avg_rating?: number
    review_count?: number
    order_count?: number
    response_time?: string
    is_online?: boolean
  }
  onViewProfile?: () => void
  onMessage?: () => void
}

export function SellerProfileCard({ seller, onViewProfile, onMessage }: SellerProfileCardProps) {
  const name = seller.full_name || seller.email || 'YouSafe Provider'
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div style={sellerCard}>
      <div style={sellerAvatar}>{initials}</div>
      <div style={sellerInfo}>
        <h3 style={sellerName}>{name}</h3>
        <p style={sellerRole}>
          {seller.role === 'attorney' ? 'Attorney' : 'Consultant'}
        </p>
        <div style={sellerStats}>
          <div style={sellerStat}>
            <span style={sellerStatLabel}>Rating</span>
            <span style={sellerStatValue}>
              ★ {seller.avg_rating?.toFixed(1) || '0'}
            </span>
          </div>
          <div style={sellerStat}>
            <span style={sellerStatLabel}>Reviews</span>
            <span style={sellerStatValue}>{seller.review_count || 0}</span>
          </div>
          <div style={sellerStat}>
            <span style={sellerStatLabel}>Orders</span>
            <span style={sellerStatValue}>{seller.order_count || 0}</span>
          </div>
        </div>
        {seller.response_time && (
          <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '8px' }}>
            Avg. response time: {seller.response_time}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <Btn variant="secondary" size="sm" onClick={onViewProfile}>
            View Profile
          </Btn>
          <Btn variant="primary" size="sm" onClick={onMessage}>
            Message
          </Btn>
        </div>
      </div>
    </div>
  )
}

interface PricingTiersProps {
  tiers: Array<{
    id: string
    tier: string
    title: string
    description?: string
    price: number
    delivery_days: number
    revisions: number
    features: string[]
    is_active: boolean
  }>
  selectedTierId: string
  onSelectTier: (tierId: string) => void
}

export function PricingTiers({ tiers, selectedTierId, onSelectTier }: PricingTiersProps) {
  const activeTiers = tiers.filter(t => t.is_active).sort((a, b) => {
    const order = ['basic', 'standard', 'premium']
    return order.indexOf(a.tier) - order.indexOf(b.tier)
  })

  return (
    <div>
      <h3 style={sectionTitle}>Pricing Packages</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {activeTiers.map(tier => (
          <div
            key={tier.id}
            onClick={() => onSelectTier(tier.id)}
            style={{
              ...tierCard,
              ...(selectedTierId === tier.id ? tierCardSelected : {}),
            }}
          >
            <div style={tierHeader}>
              <h4 style={tierName}>{tier.title || tier.tier}</h4>
              <div style={tierPrice}>{money(tier.price)}</div>
            </div>
            <div style={tierMeta}>
              <span>{tier.delivery_days} day delivery</span>
              <span>•</span>
              <span>{tier.revisions >= 999 ? 'Unlimited' : `${tier.revisions} revision${tier.revisions !== 1 ? 's' : ''}`}</span>
            </div>
            {tier.description && (
              <p style={{ fontSize: '13px', color: C.textMuted, marginBottom: '12px', lineHeight: 1.5 }}>
                {tier.description}
              </p>
            )}
            <div style={tierFeatures}>
              {tier.features.slice(0, 4).map((feature, i) => (
                <div key={i} style={tierFeature}>
                  <span>✓</span>
                  <span>{feature}</span>
                </div>
              ))}
              {tier.features.length > 4 && (
                <div style={{ fontSize: '12px', color: C.textMuted }}>
                  +{tier.features.length - 4} more features
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { ReviewsSection as NewReviewsSection } from './ReviewComponents'

interface FAQSectionProps {
  faq: Array<{ question: string; answer: string }>
}

export function FAQSection({ faq }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)

  if (faq.length === 0) return null

  return (
    <div>
      <h3 style={sectionTitle}>Frequently Asked Questions</h3>
      <div>
        {faq.map((item, index) => (
          <div key={index} style={faqItem}>
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontFamily: 'inherit',
              }}
            >
              <h4 style={faqQuestion}>{item.question}</h4>
              <span style={{ fontSize: '18px', color: C.textMuted }}>
                {openIndex === index ? '−' : '+'}
              </span>
            </button>
            {openIndex === index && <p style={faqAnswer}>{item.answer}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

interface SimilarGigsProps {
  gigs: Array<{
    id: string
    slug: string
    title: string
    starting_price?: number
    avg_rating?: number
    gallery_images?: Array<{ url: string }>
  }>
}

export function SimilarGigs({ gigs }: SimilarGigsProps) {
  if (gigs.length === 0) return null

  return (
    <div>
      <h3 style={sectionTitle}>Similar Services</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
        {gigs.map(gig => (
          <Link key={gig.id} href={`/marketplace/gigs/${gig.slug}`} style={similarGigCard}>
            {gig.gallery_images?.[0]?.url ? (
              <img src={gig.gallery_images[0].url} alt={gig.title} style={similarGigImage} />
            ) : (
              <div
                style={{
                  ...similarGigImage,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px',
                  color: C.textDim,
                }}
              >
                {gig.title.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div style={similarGigContent}>
              <h4 style={similarGigTitle}>{gig.title}</h4>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={similarGigPrice}>
                  {gig.starting_price ? money(gig.starting_price) : '—'}
                </span>
                {gig.avg_rating && (
                  <span style={{ fontSize: '12px', color: C.textMuted }}>
                    ★ {gig.avg_rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

interface OrderCTAProps {
  selectedTier: {
    id: string
    tier: string
    title: string
    price: number
    delivery_days: number
  }
  onOrder: () => void
  onSave?: () => void
  onShare?: () => void
  isSaved?: boolean
}

export function OrderCTA({ selectedTier, onOrder, onSave, onShare, isSaved = false }: OrderCTAProps) {
  return (
    <Card style={{ padding: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: C.textMuted, marginBottom: '4px' }}>
          Selected package
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: C.text, marginBottom: '4px' }}>
          {selectedTier.title || selectedTier.tier}
        </div>
        <div style={{ fontSize: '32px', fontWeight: 900, color: C.text }}>
          {money(selectedTier.price)}
        </div>
        <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '4px' }}>
          {selectedTier.delivery_days} day delivery
        </div>
      </div>
      <Btn variant="primary" fullWidth onClick={onOrder} style={{ marginBottom: '12px' }}>
        Continue to Order
      </Btn>
      <div style={{ display: 'flex', gap: '8px' }}>
        {onSave && (
          <Btn variant="secondary" size="sm" onClick={onSave} style={{ flex: 1 }}>
            {isSaved ? '★ Saved' : '☆ Save'}
          </Btn>
        )}
        {onShare && (
          <Btn variant="secondary" size="sm" onClick={onShare} style={{ flex: 1 }}>
            Share
          </Btn>
        )}
      </div>
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${C.border}` }}>
        <div style={trustBadge}>
          <span>✓</span>
          <span>Escrow Protected</span>
        </div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '8px', lineHeight: 1.5 }}>
          Your payment is held in escrow until the service is delivered to your
          satisfaction.
        </div>
      </div>
    </Card>
  )
}
