'use client'

import React from 'react'
import Link from 'next/link'

interface GigMetrics {
  impressions: number
  clicks: number
  saves: number
}

interface Gig {
  id: string
  slug: string
  title: string
  status: string
  category: string | null
  pitch: string
  content_score: number
  metrics: GigMetrics | null
}

interface SellerGigCardProps {
  gig: Gig
  onStatusChange: (id: string, status: string) => void
  onPublish: (id: string) => void
}

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; accent: string; label: string }> = {
  active:    { bg: '#EAF5EE', text: '#1A6B45', border: 'rgba(26,107,69,0.25)',  accent: '#1A6B45', label: 'Active' },
  draft:     { bg: '#F5EDD6', text: '#9A7B3B', border: 'rgba(154,123,59,0.30)', accent: '#9A7B3B', label: 'Draft' },
  suspended: { bg: '#FEF5E4', text: '#8B5E0A', border: 'rgba(139,94,10,0.28)',  accent: '#8B5E0A', label: 'Suspended' },
  archived:  { bg: '#EDEAF7', text: '#3D2B6B', border: 'rgba(61,43,107,0.25)', accent: '#3D2B6B', label: 'Archived' },
  deleted:   { bg: '#FAEAEA', text: '#8B1A1A', border: 'rgba(139,26,26,0.25)', accent: '#8B1A1A', label: 'Deleted' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 9px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      background: cfg.bg,
      color: cfg.text,
      border: `1px solid ${cfg.border}`,
      fontFamily: sans,
    }}>
      {cfg.label}
    </span>
  )
}

function ContentScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const color = clamped >= 75 ? '#1A6B45' : clamped >= 50 ? '#8B5E0A' : '#8B1A1A'
  return (
    <div style={{ paddingTop: '12px', borderTop: '1px solid #DDD8CE' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '11px', color: '#5C6070', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontFamily: sans }}>
          Content Score
        </span>
        <span style={{ fontSize: '12px', color: '#1A1F2E', fontWeight: 700, fontFamily: sans }}>{clamped}%</span>
      </div>
      <div style={{ height: '5px', borderRadius: '2px', background: '#F2EFE9', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: '2px', transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function ActionBtn({
  onClick,
  href,
  target,
  rel,
  color,
  children,
}: {
  onClick?: () => void
  href?: string
  target?: string
  rel?: string
  color: string
  children: React.ReactNode
}) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '5px 13px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    background: 'transparent',
    color,
    border: `1px solid ${color}`,
    cursor: 'pointer',
    textDecoration: 'none',
    fontFamily: sans,
    lineHeight: 1.4,
    transition: 'background 0.12s',
    whiteSpace: 'nowrap' as const,
  }
  if (href) {
    return <Link href={href} target={target} rel={rel} style={style}>{children}</Link>
  }
  return (
    <button type="button" onClick={onClick} style={{ ...style, border: `1px solid ${color}` }}>
      {children}
    </button>
  )
}

export default function SellerGigCard({ gig, onStatusChange, onPublish }: SellerGigCardProps) {
  const [confirming, setConfirming] = React.useState(false)
  const metrics = gig.metrics

  const canPublish = ['draft', 'suspended'].includes(gig.status)
  const canArchive = ['active', 'draft', 'suspended'].includes(gig.status)
  const canActivate = gig.status === 'archived'
  const canDelete = gig.status !== 'deleted'

  const handleDelete = () => {
    if (!confirming) { setConfirming(true); return }
    onStatusChange(gig.id, 'deleted')
    setConfirming(false)
  }

  const accentColor = (STATUS_CONFIG[gig.status] ?? STATUS_CONFIG.draft).accent

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #DDD8CE',
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: '8px',
      boxShadow: '0 1px 3px rgba(27,45,79,0.08), 0 1px 2px rgba(27,45,79,0.04)',
      opacity: gig.status === 'deleted' ? 0.55 : 1,
      overflow: 'hidden',
      fontFamily: sans,
    }}>
      {/* Main row */}
      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
        {/* Left: title + category + pitch */}
        <div style={{ flex: '1 1 0', minWidth: 0, padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' as const, marginBottom: '6px' }}>
            <StatusBadge status={gig.status} />
            {gig.category && (
              <span style={{ fontSize: '12px', color: '#5C6070', background: '#F2EFE9', border: '1px solid #DDD8CE', padding: '2px 8px', borderRadius: '4px', fontWeight: 500 }}>
                {gig.category}
              </span>
            )}
          </div>
          <h3 style={{
            fontFamily: serif,
            fontWeight: 600,
            fontSize: '18px',
            color: '#1B2D4F',
            lineHeight: 1.3,
            margin: '0 0 6px',
            letterSpacing: '-0.01em',
          }}>
            {gig.title}
          </h3>
          {gig.pitch && (
            <p style={{
              color: '#5C6070',
              fontSize: '13px',
              lineHeight: 1.55,
              margin: 0,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {gig.pitch}
            </p>
          )}
        </div>

        {/* Center: metrics */}
        {metrics && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            borderLeft: '1px solid #DDD8CE',
            borderRight: '1px solid #DDD8CE',
            flexShrink: 0,
          }}>
            {([
              ['Impressions', metrics.impressions],
              ['Clicks', metrics.clicks],
              ['Saves', metrics.saves],
            ] as [string, number][]).map(([label, val], i) => (
              <div key={label} style={{
                textAlign: 'center' as const,
                padding: '16px 20px',
                borderRight: i < 2 ? '1px solid #F2EFE9' : 'none',
              }}>
                <div style={{ fontWeight: 700, fontSize: '22px', color: '#1B2D4F', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                <div style={{ fontSize: '10px', color: '#9097A8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginTop: '3px' }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Right: actions */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end', justifyContent: 'center', gap: '7px', padding: '16px 20px', flexShrink: 0 }}>
          <ActionBtn href={`/dashboard/gigs/${gig.id}/edit`} color="#1B2D4F">Edit</ActionBtn>
          <ActionBtn href={`/marketplace/gigs/${gig.slug}`} target="_blank" rel="noreferrer" color="#5C6070">Preview ↗</ActionBtn>
          {canPublish && (
            <ActionBtn onClick={() => onPublish(gig.id)} color="#1A6B45">Publish</ActionBtn>
          )}
          {canActivate && (
            <ActionBtn onClick={() => onStatusChange(gig.id, 'active')} color="#1A6B45">Activate</ActionBtn>
          )}
          {canArchive && (
            <ActionBtn onClick={() => onStatusChange(gig.id, 'archived')} color="#3D2B6B">Archive</ActionBtn>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '5px 13px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                background: confirming ? '#8B1A1A' : 'transparent',
                color: confirming ? '#FFFFFF' : '#8B1A1A',
                border: '1px solid #8B1A1A',
                cursor: 'pointer',
                fontFamily: sans,
                transition: 'background 0.12s',
                whiteSpace: 'nowrap' as const,
              }}
            >
              {confirming ? 'Confirm delete?' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {/* Bottom: content score */}
      <div style={{ padding: '0 20px 14px' }}>
        <ContentScoreBar score={gig.content_score} />
      </div>
    </div>
  )
}
