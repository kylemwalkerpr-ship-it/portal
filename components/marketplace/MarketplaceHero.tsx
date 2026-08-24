// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { T, F } from './tokens'
import { responsiveImageProps } from '@/lib/responsiveImage'

const gigCard: CSSProperties = {
  background: T.vellum,
  border: `1px solid ${T.rule}`,
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
  background: `linear-gradient(135deg, ${T.paper2}, ${T.paper3})`,
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
  color: T.inkMid,
  fontWeight: 600,
  letterSpacing: '.02em',
  cursor: 'pointer',
}

const gigTitle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  margin: 0,
  color: T.ink,
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
  color: T.ink,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}

const gigRating: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '3px',
  fontSize: '12px',
  color: T.inkMid,
}

// Legacy exports kept so any other importer doesn't break
const gigProvider: CSSProperties = gigProviderLine
const providerAvatar: CSSProperties = {
  width: '20px', height: '20px', borderRadius: '50%',
  background: `${T.indigo}22`, display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '9px', fontWeight: 700, color: T.indigo, flexShrink: 0,
}
const providerNameStyle: CSSProperties = {
  fontSize: '11px', fontWeight: 600, color: T.inkMid,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
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
  // Save-heart: optimistic, persisted via /api/saved-gigs (signed-in clients)
  // with a localStorage mirror so the heart survives for anonymous visitors.
  const [saved, setSaved] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return (JSON.parse(window.localStorage.getItem('ys.savedGigs') || '[]') as string[]).includes(gig.id) } catch { return false }
  })
  React.useEffect(() => {
    if ((gig as any).is_saved) setSaved(true)
  }, [gig])

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const next = !saved
    setSaved(next)
    try {
      const list = new Set<string>(JSON.parse(window.localStorage.getItem('ys.savedGigs') || '[]'))
      if (next) list.add(gig.id); else list.delete(gig.id)
      window.localStorage.setItem('ys.savedGigs', JSON.stringify(Array.from(list)))
    } catch {}
    // Best-effort server persist — 401 for anon is fine, localStorage covers them.
    if (next) {
      fetch('/api/saved-gigs', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gig_id: gig.id }) }).catch(() => {})
    } else {
      fetch(`/api/saved-gigs/by-gig/${encodeURIComponent(gig.id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {})
    }
  }

  const imageUrl = gig.gallery_images?.[0]?.url
  const price = gig.starting_price ? (gig.starting_price / 100).toFixed(0) : null
  const rating = gig.avg_rating?.toFixed(1) || '0'
  const reviewCount = gig.review_count || 0
  const providerName = gig.provider?.full_name || gig.provider?.email || 'YouSafe Provider'
  const providerId = gig.provider?.id || gig.provider_id
  const deliveryDays = (gig as any).min_delivery_days ?? (gig as any).delivery_days ?? null

  const handleProviderClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (providerId) {
      window.location.href = `/sellers/${providerId}`
    }
  }

  const initials = providerName.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0] || '').join('').toUpperCase()
  const showRating = (gig.avg_rating ?? 0) > 0 && (gig.review_count ?? 0) > 0
  const isAttorney = gig.provider_type === 'attorney'

  return (
    <Link
      href={`/marketplace/gigs/${gig.slug}`}
      aria-label={`${gig.title}${price ? ` — from $${price}` : ''}`}
      style={{
        ...gigCard,
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? '0 10px 28px rgba(29,36,51,0.14)' : '0 1px 2px rgba(29,36,51,0.04)',
        borderColor: hovered ? T.ruleSoft : T.rule,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Cover — subtle zoom on hover */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {imageUrl ? (
          <img
            style={{ ...gigImage, transform: hovered ? 'scale(1.04)' : 'scale(1)', transition: 'transform 320ms ease' }}
            loading="lazy"
            {...responsiveImageProps(imageUrl, gig.title)}
          />
        ) : (
          <div style={{ ...gigImage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: T.inkSoft, fontWeight: 700, letterSpacing: '.04em' }}>
            {gig.title.slice(0, 2).toUpperCase()}
          </div>
        )}
        {/* Save heart */}
        <button
          type="button"
          onClick={toggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save for later'}
          aria-pressed={saved}
          style={{
            position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: '50%',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.92)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
            fontSize: 15, lineHeight: 1, color: saved ? T.brick : T.inkSoft,
            transition: 'transform 120ms ease, color 120ms ease',
            transform: hovered || saved ? 'scale(1)' : 'scale(0.96)',
          }}
        >
          {saved ? '♥' : '♡'}
        </button>
        {/* Verified credential ribbon */}
        <span style={{
          position: 'absolute', left: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 700, letterSpacing: '.05em',
          background: 'rgba(255,255,255,0.94)', color: isAttorney ? T.moss : T.indigo,
          boxShadow: '0 1px 4px rgba(0,0,0,0.14)', textTransform: 'uppercase',
        }}>
          ✓ {isAttorney ? 'Licensed Attorney' : 'Vetted Consultant'}
        </span>
      </div>

      <div style={gigContent}>
        {/* Seller-first line (who, then what) */}
        <div
          style={{ ...gigProviderLine, cursor: providerId ? 'pointer' : 'default' }}
          onClick={handleProviderClick}
          role={providerId ? 'link' : undefined}
        >
          <span style={providerAvatar}>{initials}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{providerName}</span>
          {showRating && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}>
              <span style={{ color: T.star }}>★</span>
              <span style={{ fontWeight: 800, color: T.ink }}>{rating}</span>
              <span style={{ color: T.inkSoft, fontSize: 11 }}>({reviewCount >= 1000 ? '1k+' : reviewCount})</span>
            </span>
          )}
        </div>

        <h3 style={gigTitle}>{gig.title}</h3>

        {/* Quiet "safe to buy" signals */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          <span style={trustChip}>🔒 Escrow protected</span>
          {deliveryDays != null && Number(deliveryDays) > 0 && (
            <span style={trustChip}>⏱ {deliveryDays}d delivery</span>
          )}
        </div>

        <div style={gigMeta}>
          {(gig as any).order_count > 5 ? (
            <span style={{ fontSize: 11, color: T.inkSoft, fontWeight: 600 }}>
              {(gig as any).order_count >= 50 ? '50+' : (gig as any).order_count} orders completed
            </span>
          ) : <span />}
          {price && (
            <span style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: T.inkMid, letterSpacing: '.06em', textTransform: 'uppercase', display: 'block' }}>From</span>
              <span style={gigPrice}>${price}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

const trustChip: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  background: T.paper,
  border: `1px solid ${T.ruleSoft}`,
  color: T.inkMid,
  whiteSpace: 'nowrap',
}
