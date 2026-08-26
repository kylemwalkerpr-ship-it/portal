// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { C, Card, Btn, Avatar, Badge } from '../design/shared'
import { SaveGigButton } from './SaveGigButton'
import { T, F } from './tokens'

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
    // Resolved seller headshot from attorneys.headshot_url or
    // consultants.headshot_url. Null falls back to the initials Avatar.
    headshot_url?: string | null
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
  // Always render whole-dollar figures — the marketplace shows "From $299",
  // not "From $299.50". Stored values that aren't a round dollar get
  // rounded to the nearest dollar; this is the established convention
  // across PublicMarketplaceLanding / AllGigsDrawer / HeroCaseFileSlideshow.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(Number(cents || 0) / 100))
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

      const convRes = await fetch('/api/messages/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          counterpart_profile_id: seller.id,
          message: "Hi, I'm interested in your service.",
        }),
      })
      const convData = await convRes.json()
      const convId = convData?.conversation_id
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
    fontFamily: F.display,
    fontSize: '20px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: T.ink,
    margin: 0,
  }

  const roleStyle: CSSProperties = {
    fontFamily: F.mono,
    fontSize: '10.5px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: T.inkSoft,
    margin: '4px 0 0',
  }

  const statsRow: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '16px',
  }

  const statBox: CSSProperties = {
    background: T.paper2,
    border: `1px solid ${T.ruleSoft}`,
    borderRadius: '10px',
    padding: '10px',
    textAlign: 'center',
  }

  const statValue: CSSProperties = {
    fontFamily: F.display,
    fontSize: '17px',
    fontWeight: 600,
    color: T.ink,
    display: 'block',
  }

  const statLabel: CSSProperties = {
    fontFamily: F.mono,
    fontSize: '10px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: T.inkSoft,
    display: 'block',
    marginTop: '4px',
  }

  const onlineDot: CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: seller.is_online ? T.moss : T.inkSoft,
    display: 'inline-block',
    marginRight: '6px',
  }

  return (
    <Card style={cardStyle}>
      <div style={headerStyle}>
        <Avatar name={seller.full_name || '?'} src={seller.headshot_url || undefined} size={48} />
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
          <span style={statValue}><span style={{ color: T.star }}>★</span> {seller.avg_rating?.toFixed(1) || '—'}</span>
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
    marginBottom: '14px',
    background: T.paper2,
    border: `1px solid ${T.ruleSoft}`,
    borderRadius: '999px',
    padding: '4px',
  }

  return (
    <Card style={{ padding: '20px' }}>              <h3 style={{ fontFamily: F.mono, fontSize: '10.5px', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, margin: '0 0 14px', color: T.inkMid }}>
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
                padding: '7px 6px',
                border: 'none',
                borderRadius: '999px',
                cursor: 'pointer',
                fontFamily: F.ui,
                fontSize: '12.5px',
                fontWeight: 600,
                textTransform: 'capitalize',
                background: selectedTierId === t.id ? T.ink : 'transparent',
                color: selectedTierId === t.id ? '#fff' : T.inkMid,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '10px' }}>
              <span style={{ fontFamily: F.display, fontSize: '30px', fontWeight: 600, letterSpacing: '-0.01em', color: T.ink }}>
                {money(tier.price, tier.currency)}
              </span>
              {tier.delivery_days && (
                <span style={{ fontFamily: F.mono, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: T.inkSoft }}>
                  {tier.delivery_days}d delivery
                </span>
              )}
            </div>

            {tier.description && (
              <p style={{ fontFamily: F.ui, fontSize: '14px', color: T.inkMid, lineHeight: 1.55, margin: '0 0 12px' }}>
                {tier.description}
              </p>
            )}

            {/* What's included — every line answers a buyer hesitation */}
            <div style={{ display: 'grid', gap: 7 }}>
              {tier.delivery_days != null && (
                <div style={{ fontFamily: F.ui, fontSize: '13px', color: T.inkMid, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: T.indigo }}>✓</span>
                  <span><strong style={{ color: T.ink }}>{tier.delivery_days}-day</strong> delivery</span>
                </div>
              )}
              {tier.revisions != null && (
                <div style={{ fontFamily: F.ui, fontSize: '13px', color: T.inkMid, display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ color: T.indigo }}>✓</span>
                  <span>{tier.revisions === -1 ? 'Unlimited revisions' : `${tier.revisions} revision${tier.revisions !== 1 ? 's' : ''} included`}</span>
                </div>
              )}
              <div style={{ fontFamily: F.ui, fontSize: '13px', color: T.inkMid, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ color: T.indigo }}>✓</span>
                <span>Payment held in escrow until you approve</span>
              </div>
              <div style={{ fontFamily: F.ui, fontSize: '13px', color: T.inkMid, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ color: T.indigo }}>✓</span>
                <span>Direct chat with your specialist</span>
              </div>
            </div>
          </div>
        ))}

      {tiers.length > 1 && <ComparePackages tiers={tiers} selectedTierId={selectedTierId} onSelectTier={onSelectTier} />}
    </Card>
  )
}

// ── ComparePackages — Fiverr-style side-by-side table ────────────────────────
function ComparePackages({ tiers, selectedTierId, onSelectTier }: PricingTiersProps) {
  const [open, setOpen] = React.useState(false)
  const cell: CSSProperties = { padding: '8px 10px', fontFamily: F.ui, fontSize: 12.5, color: T.inkMid, borderTop: `1px solid ${T.ruleSoft}`, textAlign: 'center' }
  const head: CSSProperties = { ...cell, borderTop: 'none', fontWeight: 700, color: T.ink, textTransform: 'capitalize' }
  const label: CSSProperties = { ...cell, textAlign: 'left', color: T.inkSoft, fontWeight: 600, whiteSpace: 'nowrap' }
  return (
    <div style={{ marginTop: 16 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: F.ui, fontSize: 12.5, fontWeight: 700, color: T.indigo, padding: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', fontSize: 10 }}>▸</span>
        Compare packages
      </button>
      {open && (
        <div style={{ overflowX: 'auto', marginTop: 10, border: `1px solid ${T.ruleSoft}`, borderRadius: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
            <thead>
              <tr>
                <th style={{ ...label, borderTop: 'none' }} />
                {tiers.map((t) => <th key={t.id} style={head}>{t.name || t.tier}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={label}>Price</td>
                {tiers.map((t) => (
                  <td key={t.id} style={{ ...cell, fontWeight: 800, color: T.ink }}>{money(t.price, t.currency)}</td>
                ))}
              </tr>
              <tr>
                <td style={label}>Delivery</td>
                {tiers.map((t) => <td key={t.id} style={cell}>{t.delivery_days != null ? `${t.delivery_days}d` : '—'}</td>)}
              </tr>
              <tr>
                <td style={label}>Revisions</td>
                {tiers.map((t) => <td key={t.id} style={cell}>{t.revisions == null ? '—' : t.revisions === -1 ? 'Unlimited' : t.revisions}</td>)}
              </tr>
              <tr>
                <td style={label} />
                {tiers.map((t) => (
                  <td key={t.id} style={cell}>
                    <button
                      type="button"
                      onClick={() => onSelectTier(t.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: F.ui, fontSize: 12, fontWeight: 700,
                        border: `1.5px solid ${selectedTierId === t.id ? T.indigo : T.rule}`,
                        background: selectedTierId === t.id ? T.indigo : 'transparent',
                        color: selectedTierId === t.id ? '#fff' : T.inkMid,
                      }}
                    >
                      {selectedTierId === t.id ? 'Selected' : 'Select'}
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── FAQSection ────────────────────────────────────────────────────────────────

export function FAQSection({ faq }: FAQSectionProps) {
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)

  if (!faq || faq.length === 0) return null

  return (
    <Card style={{ padding: '24px' }}>
      <h3 style={{ fontFamily: F.display, fontSize: '24px', fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 16px', color: T.ink }}>
        FAQ
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {faq.map((item, i) => (
          <div key={i} style={{ borderBottom: i < faq.length - 1 ? `1px solid ${T.ruleSoft}` : 'none' }}>
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
                fontFamily: F.ui,
              }}
            >
              <span style={{ fontFamily: F.ui, fontSize: '15px', fontWeight: 600, color: T.ink }}>{item.question}</span>
              <span style={{ fontSize: '18px', color: T.indigo, flexShrink: 0, transform: openIndex === i ? 'rotate(45deg)' : 'none', transition: 'transform 150ms' }}>
                +
              </span>
            </button>
            {openIndex === i && (
              <p style={{ fontFamily: F.ui, fontSize: '14px', color: T.inkMid, lineHeight: 1.65, margin: '0 0 14px', paddingRight: '24px' }}>
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
      maximumFractionDigits: 0,
    }).format(Math.round(Number(cents || 0) / 100))
  }

  const grid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
  }

  const gigCard: CSSProperties = {
    background: T.vellum,
    border: `1px solid ${T.rule}`,
    borderRadius: '12px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'box-shadow 200ms, border-color 200ms',
    textDecoration: 'none',
    display: 'block',
    color: 'inherit',
  }

  const imgPlaceholder: CSSProperties = {
    width: '100%',
    height: '140px',
    background: `linear-gradient(135deg, ${T.paper2}, ${T.paper3})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: F.display,
    fontSize: '32px',
    color: T.inkSoft,
  }

  return (
    <Card style={{ padding: '24px' }}>
      <h3 style={{ fontFamily: F.display, fontSize: '24px', fontWeight: 500, letterSpacing: '-0.01em', margin: '0 0 16px', color: T.ink }}>
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
              <div style={{ padding: '14px' }}>
                <p style={{ fontFamily: F.display, fontSize: '15px', fontWeight: 500, letterSpacing: '-0.005em', color: T.ink, margin: '0 0 4px', lineHeight: 1.3 }}>
                  {g.title}
                </p>
                {g.provider?.full_name && (
                  <p style={{ fontFamily: F.mono, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: T.inkSoft, margin: '0 0 10px' }}>{g.provider.full_name}</p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {g.avg_rating != null && (
                    <span style={{ fontFamily: F.ui, fontSize: '12.5px', color: T.inkMid }}><span style={{ color: T.star }}>★</span> {g.avg_rating.toFixed(1)}</span>
                  )}
                  {g.starting_price != null && (
                    <span style={{ fontFamily: F.display, fontSize: '14px', fontWeight: 600, color: T.indigo }}>
                      From {money(g.starting_price)}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}

// ── OrderCTA ──────────────────────────────────────────────────────────────────

export function OrderCTA({ selectedTier, onOrder, onSave, onShare, isSaved = false, gigId, savedGigRecordId }: OrderCTAProps) {
  return (
    <Card style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
        <span style={{ fontFamily: F.display, fontSize: '24px', fontWeight: 600, letterSpacing: '-0.01em', color: T.ink }}>
          {money(selectedTier.price, selectedTier.currency)}
        </span>
        {selectedTier.delivery_days && (
          <span style={{ fontFamily: F.mono, fontSize: '10.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: T.inkSoft }}>
            {selectedTier.delivery_days}d delivery
          </span>
        )}
      </div>

      <Btn
        variant="primary"
        fullWidth
        onClick={onOrder}
        style={{
          marginBottom: '10px',
          background: T.indigo,
          color: '#fff',
          borderRadius: 999,
          padding: '10px 18px',
          boxShadow: '0 10px 22px -10px rgba(60,59,110,0.55)',
          fontFamily: F.ui,
        }}
      >
        Continue ({selectedTier.name || selectedTier.tier})
      </Btn>

      {/* The two lines that close the sale — security, then recourse */}
      <div style={{ fontFamily: F.ui, fontSize: 11.5, color: T.inkSoft, lineHeight: 1.6, textAlign: 'center', margin: '0 0 12px' }}>
        🔒 Payment held in escrow — released only when you approve.<br />
        ↩ Full refund if your specialist never delivers.
      </div>

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
            style={{
              fontSize: '13px',
              fontFamily: F.ui,
              background: T.paper,
              color: T.ink,
              border: `1px solid ${T.rule}`,
            }}
          >
            {isSaved ? '♥ Saved' : '♡ Save'}
          </Btn>
        )}
        <Btn
          variant="secondary"
          fullWidth
          onClick={onShare}
          style={{
            fontSize: '13px',
            fontFamily: F.ui,
            background: T.paper,
            color: T.ink,
            border: `1px solid ${T.rule}`,
          }}
        >
          Share
        </Btn>
      </div>
    </Card>
  )
}
