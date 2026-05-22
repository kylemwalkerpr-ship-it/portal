// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { C, Card, Btn, Avatar, Badge } from '../design/shared'
import { SaveGigButton } from './SaveGigButton'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SellerProfileCardProps {
  seller: {
    id: string
    full_name?: string | null
    email?: string | null
    role?: string | null
    avg_rating?: number | null
    review_count?: number
    order_count?: number
    response_time?: string | null
    is_online?: boolean
  }
  onViewProfile?: () => void
  onMessage?: () => void
}

interface PricingTiersProps {
  tiers: Array<{
    id: string
    tier: string
    name?: string | null
    price: number
    currency?: string
    delivery_days?: number
    revisions?: number | null
    description?: string | null
  }>
  selectedTierId: string
  onSelectTier: (id: string) => void
}

interface FAQSectionProps {
  faq: Array<{ question: string; answer: string }>
}

interface SimilarGigsProps {
  gigs: Array<{
    id: string
    slug: string
    title: string
    pitch?: string | null
    starting_price?: number
    avg_rating?: number | null
    review_count?: number
    provider?: { full_name?: string | null } | null
    gallery_images?: Array<{ url: string }>
  }>
}

interface OrderCTAProps {
  selectedTier: {
    id: string
    tier: string
    name?: string | null
    price: number
    currency?: string
    delivery_days?: number
    revisions?: number | null
  }
  onOrder: () => void
  onSave?: () => void
  onShare: () => void
  isSaved?: boolean
  gigId?: string
  savedGigRecordId?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

// ── SellerProfileCard ─────────────────────────────────────────────────────────

export function SellerProfileCard({ seller, onViewProfile, onMessage }: SellerProfileCardProps) {
  const handleMessage = async () => {
    if (typeof onMessage === 'function') {
      onMessage()
      return
    }

    try {
      const res = await fetch('/api/profile', { credentials: 'same-origin' })
      if (!res.ok) {
        window.location.href = 'https://portal.yousafeconsultancy.com/sign-in'
        return
      }
      const profile = await res.json()
      const currentUserId = profile?.clerk_user_id || profile?.id

      if (!currentUserId) {
        window.location.href = 'https://portal.yousafeconsultancy.com/sign-in'
        return
      }

      const convRes = await fetch('/api/conversations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participant_id: seller.id,
          initial_message: "Hi, I'm interested in your service.",
        }),
      })
      const convData = await convRes.json()
      const convId = convData?.id || convData?.conversation_id
      window.location.href = `/dashboard/messages${convId ? `?conversation=${convId}` : ''}`
    } catch (e) {
      console.error('Failed to start conversation', e)
      alert('Could not open chat. Please try again.')
    }
  }

  const cardStyle: CSSProperties = {
    padding: '20px',
  }

  const headerStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  }

  const nameStyle: CSSProperties = {
    fontFamily: C.serif,
    fontSize: '18px',
    fontWeight: 600,
    color: C.text,
    margin: 0,
  }

  const roleStyle: CSSProperties = {
    fontSize: '13px',
    color: C.textMuted,
    margin: '2px 0 0',
    textTransform: 'capitalize',
  }

  const statsRow: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '16px',
  }

  const statBox: CSSProperties = {
    background: C.surface2,
    borderRadius: '8px',
    padding: '10px',
    textAlign: 'center',
  }

  const statValue: CSSProperties = {
    fontSize: '16px',
    fontWeight: 700,
    color: C.text,
    display: 'block',
  }

  const statLabel: CSSProperties = {
    fontSize: '11px',
    color: C.textMuted,
    display: 'block',
    marginTop: '2px',
  }

  const onlineDot: CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: seller.is_online ? C.green : C.textDim,
    display: 'inline-block',
    marginRight: '4px',
  }

  return (
    <Card style={cardStyle}>
      <div style={headerStyle}>
        <Avatar name={seller.full_name || '?'} size={48} />
        <div>
          <p style={nameStyle}>{seller.full_name || 'Provider'}</p>
          <p style={roleStyle}>
            <span style={onlineDot} />
            {seller.is_online ? 'Online' : 'Offline'} · {seller.role?.replace('_', ' ') || 'Expert'}
          </p>
        </div>
      </div>

      <div style={statsRow}>
        <div style={statBox}>
          <span style={statValue}>★ {seller.avg_rating?.toFixed(1) || '—'}</span>
          <span style={statLabel}>{seller.review_count || 0} reviews</span>
        </div>
        <div style={statBox}>
          <span style={statValue}>{seller.order_count || 0}</span>
          <span style={statLabel}>orders</span>
        </div>
        {seller.response_time && (
          <div style={{ ...statBox, gridColumn: '1 / -1' }}>
            <span style={statValue}>{seller.response_time}</span>
            <span style={statLabel}>avg. response time</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Btn variant="secondary" fullWidth onClick={handleMessage}>
          Message
        </Btn>
        {onViewProfile && (
          <Btn variant="ghost" fullWidth onClick={onViewProfile}>
            View Profile
          </Btn>
        )}
      </div>
    </Card>
  )
}

// ── PricingTiers ──────────────────────────────────────────────────────────────

export function PricingTiers({ tiers, selectedTierId, onSelectTier }: PricingTiersProps) {
  if (!tiers || tiers.length === 0) return null

  const tabBar: CSSProperties = {
    display: 'flex',
    gap: '4px',
    marginBottom: '12px',
    background: C.surface2,
    borderRadius: '10px',
    padding: '4px',
  }

  const tierColors: Record<string, string> = {
    basic: C.textMuted,
    standard: C.cyan,
    premium: C.orange,
  }

  return (
    <Card style={{ padding: '20px' }}>
      <h3 style={{ fontFamily: C.serif, fontSize: '18px', fontWeight: 600, margin: '0 0 12px', color: C.text }}>
        Pricing
      </h3>

      {tiers.length > 1 && (
        <div style={tabBar}>
          {tiers.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTier(t.id)}
              style={{
                flex: 1,
                padding: '6px 4px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'capitalize',
                background: selectedTierId === t.id ? C.surface : 'transparent',
                color: selectedTierId === t.id ? tierColors[t.tier] || C.cyan : C.textMuted,
                boxShadow: selectedTierId === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 150ms',
              }}
            >
              {t.name || t.tier}
            </button>
          ))}
        </div>
      )}

      {tiers
        .filter((t) => t.id === selectedTierId || tiers.length === 1)
        .slice(0, 1)
        .map((tier) => (
          <div key={tier.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
              <span style={{ fontSize: '28px', fontWeight: 700, color: C.text }}>
                {money(tier.price, tier.currency)}
              </span>
              {tier.delivery_days && (
                <span style={{ fontSize: '13px', color: C.textMuted }}>
                  {tier.delivery_days}d delivery
                </span>
              )}
            </div>

            {tier.description && (
              <p style={{ fontSize: '14px', color: C.textMuted, lineHeight: 1.5, margin: '0 0 12px' }}>
                {tier.description}
              </p>
            )}

            {tier.revisions != null && (
              <div style={{ fontSize: '13px', color: C.textMuted, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span>✓</span>
                <span>{tier.revisions === -1 ? 'Unlimited revisions' : `${tier.revisions} revision${tier.revisions !== 1 ? 's' : ''}`}</span>
              </div>
            )}
          </div>
        ))}
    </Card>
  )
}

// ── FAQSection ────────────────────────────────────────────────────────────────

export function FAQSection({ faq }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)

  if (!faq || faq.length === 0) return null

  return (
    <Card style={{ padding: '24px' }}>
      <h3 style={{ fontFamily: C.serif, fontSize: '24px', fontWeight: 500, margin: '0 0 16px', color: C.text }}>
        FAQ
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {faq.map((item, i) => (
          <div key={i} style={{ borderBottom: i < faq.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '14px 0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: 600, color: C.text }}>{item.question}</span>
              <span style={{ fontSize: '18px', color: C.textMuted, flexShrink: 0, transform: openIndex === i ? 'rotate(45deg)' : 'none', transition: 'transform 150ms' }}>
                +
              </span>
            </button>
            {openIndex === i && (
              <p style={{ fontSize: '14px', color: C.textMuted, lineHeight: 1.65, margin: '0 0 14px', paddingRight: '24px' }}>
                {item.answer}
              </p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── SimilarGigs ───────────────────────────────────────────────────────────────

export function SimilarGigs({ gigs }: SimilarGigsProps) {
  if (!gigs || gigs.length === 0) return null

  function money(cents: number, currency = 'usd') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(Number(cents || 0) / 100)
  }

  const grid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
  }

  const gigCard: CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: '12px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'box-shadow 200ms',
    textDecoration: 'none',
    display: 'block',
    color: 'inherit',
  }

  const imgPlaceholder: CSSProperties = {
    width: '100%',
    height: '140px',
    background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    color: C.textDim,
  }

  return (
    <div>
      <h3 style={{ fontFamily: C.serif, fontSize: '24px', fontWeight: 500, margin: '0 0 16px', color: C.text }}>
        Similar Services
      </h3>
      <div style={grid}>
        {gigs.slice(0, 4).map((g) => {
          const img = g.gallery_images?.[0]?.url
          return (
            <Link key={g.id} href={`/marketplace/gigs/${g.slug}`} style={gigCard}>
              {img ? (
                <img src={img} alt={g.title} style={{ width: '100%', height: '140px', objectFit: 'cover' }} />
              ) : (
                <div style={imgPlaceholder}>{g.title.slice(0, 2).toUpperCase()}</div>
              )}
              <div style={{ padding: '12px' }}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: C.text, margin: '0 0 4px', lineHeight: 1.3 }}>
                  {g.title}
                </p>
                {g.provider?.full_name && (
                  <p style={{ fontSize: '12px', color: C.textMuted, margin: '0 0 8px' }}>{g.provider.full_name}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {g.avg_rating != null && (
                    <span style={{ fontSize: '12px', color: C.textMuted }}>★ {g.avg_rating.toFixed(1)}</span>
                  )}
                  {g.starting_price != null && (
                    <span style={{ fontSize: '13px', fontWeight: 700, color: C.cyan }}>
                      From {money(g.starting_price)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ── OrderCTA ──────────────────────────────────────────────────────────────────

export function OrderCTA({ selectedTier, onOrder, onSave, onShare, isSaved = false, gigId, savedGigRecordId }: OrderCTAProps) {
  return (
    <Card style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
        <span style={{ fontSize: '22px', fontWeight: 700, color: C.text }}>
          {money(selectedTier.price, selectedTier.currency)}
        </span>
        {selectedTier.delivery_days && (
          <span style={{ fontSize: '13px', color: C.textMuted }}>
            {selectedTier.delivery_days}d delivery
          </span>
        )}
      </div>

      <Btn variant="primary" fullWidth onClick={onOrder} style={{ marginBottom: '8px' }}>
        Continue ({selectedTier.name || selectedTier.tier})
      </Btn>

      <div style={{ display: 'flex', gap: '8px' }}>
        {gigId ? (
          <SaveGigButton
            gigId={gigId}
            initialSaved={isSaved}
            savedGigRecordId={savedGigRecordId}
          />
        ) : (
          <Btn
            variant="secondary"
            fullWidth
            onClick={onSave}
            style={{ fontSize: '13px' }}
          >
            {isSaved ? '♥ Saved' : '♡ Save'}
          </Btn>
        )}
        <Btn
          variant="secondary"
          fullWidth
          onClick={onShare}
          style={{ fontSize: '13px' }}
        >
          Share
        </Btn>
      </div>
    </Card>
  )
}
