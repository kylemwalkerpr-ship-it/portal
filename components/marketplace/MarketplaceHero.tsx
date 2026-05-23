// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { T, F } from './tokens'

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
  background: `linear-gradient(135deg, ${T.paper2}, #E8EEF6)`,
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
        boxShadow: hovered ? '0 6px 18px rgba(29,36,51,0.10)' : '0 1px 2px rgba(29,36,51,0.04)',
        borderColor: hovered ? T.ruleSoft : T.rule,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={gig.title} style={gigImage} />
      ) : (
        <div style={{ ...gigImage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', color: T.inkSoft, fontWeight: 700, letterSpacing: '.04em' }}>
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
            <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: gig.provider_type === 'attorney' ? 'rgba(95,107,58,0.12)' : 'rgba(60,59,110,0.12)', color: gig.provider_type === 'attorney' ? T.moss : T.indigo }}>
              {gig.provider_type === 'attorney' ? 'Attorney' : 'Consultant'}
            </span>
          )}
        </div>

        <h3 style={gigTitle}>{gig.title}</h3>

        <div style={gigMeta}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {price && (
              <>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.inkMid, letterSpacing: '.06em', textTransform: 'uppercase' }}>From</span>
                <span style={gigPrice}>${price}</span>
              </>
            )}
          </div>
          {showRating && (
            <div style={gigRating}>
              <span style={{ color: T.star }}>★</span>
              <span style={{ fontWeight: 700, color: T.ink }}>{rating}</span>
              <span style={{ color: T.inkSoft, fontSize: 11 }}>({reviewCount})</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
