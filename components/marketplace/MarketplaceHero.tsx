// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { T } from './tokens'
import { responsiveImageProps } from '@/lib/responsiveImage'
import { providerDisplayName } from '@/lib/providerDisplayName'

const DISCOVERY_FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif"

/*
 * Discovery-card contract
 * -----------------------
 * Marketplace browsing should feel spacious without wasting vertical space.
 * The image is the visual card; the information below sits directly on the
 * page rather than inside a second heavy bordered box. That gives each gig a
 * Fiverr-like scan rhythm while preserving YouSafe's own credential, escrow,
 * delivery and provider signals.
 */
const gigCard: CSSProperties = {
  background: 'transparent',
  border: 0,
  borderRadius: 0,
  overflow: 'visible',
  transition: 'transform 160ms ease',
  cursor: 'pointer',
  textDecoration: 'none',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  fontFamily: DISCOVERY_FONT,
}

const gigImage: CSSProperties = {
  width: '100%',
  height: 'auto',
  aspectRatio: '16 / 10',
  objectFit: 'cover',
  background: T.paper2,
  borderRadius: 12,
  display: 'block',
}

const gigContent: CSSProperties = {
  padding: '11px 2px 2px',
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  flex: 1,
  minWidth: 0,
}

const gigProviderLine: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  minWidth: 0,
  fontSize: 13,
  color: T.ink,
  fontWeight: 650,
  letterSpacing: '-0.005em',
  cursor: 'pointer',
}

const gigTitle: CSSProperties = {
  fontFamily: DISCOVERY_FONT,
  fontSize: 15,
  fontWeight: 450,
  margin: 0,
  color: T.inkMid,
  lineHeight: 1.42,
  letterSpacing: '-0.006em',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  minHeight: '2.84em',
}

const gigPrice: CSSProperties = {
  fontFamily: DISCOVERY_FONT,
  fontSize: 16,
  fontWeight: 720,
  color: T.ink,
  lineHeight: 1.15,
  fontVariantNumeric: 'tabular-nums',
}

const providerAvatar: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: '50%',
  background: T.paper2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 750,
  color: T.ink,
  flex: '0 0 26px',
  border: `1px solid ${T.ruleSoft}`,
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
    provider_headshot_url?: string | null
    gallery_images?: Array<{ url: string }>
  }
}

export function GigCard({ gig }: GigCardProps) {
  const [hovered, setHovered] = React.useState(false)
  const [saved, setSaved] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try { return (JSON.parse(window.localStorage.getItem('ys.savedGigs') || '[]') as string[]).includes(gig.id) } catch { return false }
  })

  React.useEffect(() => {
    if ((gig as any).is_saved) setSaved(true)
  }, [gig])

  const toggleSave = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const next = !saved
    setSaved(next)
    try {
      const list = new Set<string>(JSON.parse(window.localStorage.getItem('ys.savedGigs') || '[]'))
      if (next) list.add(gig.id)
      else list.delete(gig.id)
      window.localStorage.setItem('ys.savedGigs', JSON.stringify(Array.from(list)))
    } catch {}
    if (next) {
      fetch('/api/saved-gigs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gig_id: gig.id }),
      }).catch(() => {})
    } else {
      fetch(`/api/saved-gigs/by-gig/${encodeURIComponent(gig.id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      }).catch(() => {})
    }
  }

  const imageUrl = gig.gallery_images?.[0]?.url || (gig as any).cover_image_url
  const price = gig.starting_price
    ? Math.round(gig.starting_price / 100).toLocaleString('en-US')
    : null
  const rating = gig.avg_rating?.toFixed(1) || '0'
  const reviewCount = gig.review_count || 0
  const providerName = providerDisplayName(gig.provider, 'YouSafe Provider')
  const providerId = gig.provider?.id || gig.provider_id
  const deliveryDays = (gig as any).min_delivery_days ?? (gig as any).delivery_days ?? null
  const isAttorney = gig.provider_type === 'attorney'

  const handleProviderClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (providerId) window.location.href = `/sellers/${providerId}`
  }

  const initials = providerName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => name[0] || '')
    .join('')
    .toUpperCase()
  const showRating = (gig.avg_rating ?? 0) > 0 && (gig.review_count ?? 0) > 0

  return (
    <Link
      href={`/gigs/${gig.slug}`}
      aria-label={`${gig.title}${price ? ` — from $${price}` : ''}`}
      className="ys-discovery-gig-card"
      style={{ ...gigCard, transform: hovered ? 'translateY(-2px)' : 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="ys-discovery-gig-media" style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, background: T.paper2 }}>
        {imageUrl ? (
          <img
            style={{
              ...gigImage,
              transform: hovered ? 'scale(1.025)' : 'scale(1)',
              transition: 'transform 320ms cubic-bezier(.2,.7,.2,1)',
            }}
            loading="lazy"
            {...responsiveImageProps(imageUrl, gig.title)}
          />
        ) : (
          <div style={{ ...gigImage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, color: T.inkSoft, fontWeight: 750, letterSpacing: '.04em' }}>
            {gig.title.slice(0, 2).toUpperCase()}
          </div>
        )}

        <button
          type="button"
          onClick={toggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save for later'}
          aria-pressed={saved}
          className="ys-gig-save"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 34,
            height: 34,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,.75)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15,23,42,.28)',
            backdropFilter: 'blur(8px)',
            boxShadow: '0 2px 8px rgba(0,0,0,.14)',
            fontSize: 20,
            lineHeight: 1,
            color: '#fff',
          }}
        >
          {saved ? '♥' : '♡'}
        </button>

        <span style={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '5px 9px',
          borderRadius: 7,
          fontFamily: DISCOVERY_FONT,
          fontSize: 10,
          fontWeight: 750,
          letterSpacing: '.025em',
          background: 'rgba(255,255,255,.94)',
          color: T.ink,
          boxShadow: '0 2px 8px rgba(15,23,42,.12)',
        }}>
          ✓ {isAttorney ? 'Licensed attorney' : 'Vetted consultant'}
        </span>
      </div>

      <div style={gigContent}>
        <div
          style={{ ...gigProviderLine, cursor: providerId ? 'pointer' : 'default' }}
          onClick={handleProviderClick}
          role={providerId ? 'link' : undefined}
        >
          {(gig.provider_headshot_url || (gig as any).providerHeadshot) ? (
            <img
              src={gig.provider_headshot_url || (gig as any).providerHeadshot}
              alt={`${providerName} profile`}
              width={26}
              height={26}
              style={{ ...providerAvatar, objectFit: 'cover', padding: 0 }}
            />
          ) : (
            <span style={providerAvatar}>{initials}</span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{providerName}</span>
        </div>

        <h3 style={gigTitle}>{gig.title}</h3>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 20,
          gap: 7,
          fontFamily: DISCOVERY_FONT,
          fontSize: 13,
          color: T.inkMid,
        }}>
          {showRating ? (
            <>
              <span aria-hidden="true" style={{ color: T.ink, fontSize: 14 }}>★</span>
              <strong style={{ color: T.ink, fontWeight: 720 }}>{rating}</strong>
              <span style={{ color: T.inkSoft }}>({reviewCount.toLocaleString('en-US')})</span>
            </>
          ) : (
            <span style={{ color: T.inkSoft }}>New service</span>
          )}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          minHeight: 25,
          marginTop: 1,
        }}>
          <span style={{ fontFamily: DISCOVERY_FONT, fontSize: 12, color: T.inkSoft, fontWeight: 520 }}>
            {deliveryDays != null && Number(deliveryDays) > 0 ? `${deliveryDays}-day delivery` : 'Escrow protected'}
          </span>
          {price && (
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <span style={{ ...gigPrice, fontWeight: 620, marginRight: 4 }}>From</span>
              <span style={gigPrice}>${price}</span>
            </span>
          )}
        </div>
      </div>

      <style jsx global>{`
        .ys-discovery-gig-card:focus-visible .ys-discovery-gig-media {
          outline: 3px solid color-mix(in srgb, ${T.ink} 24%, transparent);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .ys-discovery-gig-card,
          .ys-discovery-gig-card img { transition: none !important; transform: none !important; }
        }
      `}</style>
    </Link>
  )
}

// Legacy aliases retained for downstream imports that historically consumed
// MarketplaceHero's card style helpers.
export const gigProvider: CSSProperties = gigProviderLine
export const providerNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 650,
  color: T.ink,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
