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

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: 'rgba(5,150,105,0.10)', text: '#059669', border: 'rgba(5,150,105,0.25)' },
  draft: { bg: '#F4F2EE', text: '#6B7280', border: 'rgba(0,0,0,0.14)' },
  suspended: { bg: 'rgba(217,119,6,0.10)', text: '#D97706', border: 'rgba(217,119,6,0.25)' },
  archived: { bg: 'rgba(60,59,110,0.10)', text: '#3C3B6E', border: 'rgba(60,59,110,0.25)' },
  deleted: { bg: 'rgba(220,38,38,0.08)', text: '#DC2626', border: 'rgba(220,38,38,0.22)' },
}

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
      }}
    >
      {status}
    </span>
  )
}

function ContentScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const color =
    clamped >= 75 ? '#059669' : clamped >= 50 ? '#D97706' : '#DC2626'
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span style={{ fontSize: '11px', color: '#6B7280', fontWeight: 700 }}>Content score</span>
        <span style={{ fontSize: '11px', color: '#1F2937', fontWeight: 800 }}>{clamped}%</span>
      </div>
      <div style={{ height: '4px', borderRadius: '999px', background: '#EAE7E0', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${clamped}%`, background: color, borderRadius: '999px', transition: 'width 0.3s' }} />
      </div>
    </div>
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
    if (!confirming) {
      setConfirming(true)
      return
    }
    onStatusChange(gig.id, 'deleted')
    setConfirming(false)
  }

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '12px',
        padding: '16px',
        display: 'grid',
        gap: '12px',
        opacity: gig.status === 'deleted' ? 0.6 : 1,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={gig.status} />
            {gig.category && (
              <span style={{ fontSize: '12px', color: '#6B7280' }}>{gig.category}</span>
            )}
          </div>
          <h3 style={{ fontWeight: 800, fontSize: '15px', color: '#1F2937', lineHeight: 1.35, margin: 0 }}>
            {gig.title}
          </h3>
          {gig.pitch && (
            <p style={{ color: '#6B7280', fontSize: '13px', lineHeight: 1.5, margin: '4px 0 0', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {gig.pitch}
            </p>
          )}
        </div>
      </div>

      {/* Metrics */}
      {metrics && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '8px',
            background: '#F4F2EE',
            borderRadius: '8px',
            padding: '10px',
          }}
        >
          {([
            ['Impressions', metrics.impressions],
            ['Clicks', metrics.clicks],
            ['Saves', metrics.saves],
          ] as [string, number | string][]).map(([label, val]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 900, fontSize: '16px', color: '#1F2937' }}>{val}</div>
              <div style={{ fontSize: '10px', color: '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Content score */}
      <ContentScoreBar score={gig.content_score} />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '4px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
        <Link
          href={`/dashboard/gigs/${gig.id}/edit`}
          style={{
            display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
            borderRadius: '999px', fontSize: '12px', fontWeight: 700,
            background: '#F4F2EE', color: '#1F2937', border: '1px solid rgba(0,0,0,0.12)',
            textDecoration: 'none',
          }}
        >
          Edit
        </Link>

        <Link
          href={`/marketplace/gigs/${gig.slug}`}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
            borderRadius: '999px', fontSize: '12px', fontWeight: 700,
            background: '#F4F2EE', color: '#1F2937', border: '1px solid rgba(0,0,0,0.12)',
            textDecoration: 'none',
          }}
        >
          Preview
        </Link>

        {canPublish && (
          <button
            type="button"
            onClick={() => onPublish(gig.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
              borderRadius: '999px', fontSize: '12px', fontWeight: 700,
              background: 'rgba(5,150,105,0.10)', color: '#059669',
              border: '1px solid rgba(5,150,105,0.25)', cursor: 'pointer',
            }}
          >
            Publish
          </button>
        )}

        {canActivate && (
          <button
            type="button"
            onClick={() => onStatusChange(gig.id, 'active')}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
              borderRadius: '999px', fontSize: '12px', fontWeight: 700,
              background: 'rgba(5,150,105,0.10)', color: '#059669',
              border: '1px solid rgba(5,150,105,0.25)', cursor: 'pointer',
            }}
          >
            Activate
          </button>
        )}

        {canArchive && (
          <button
            type="button"
            onClick={() => onStatusChange(gig.id, 'archived')}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
              borderRadius: '999px', fontSize: '12px', fontWeight: 700,
              background: 'rgba(60,59,110,0.10)', color: '#3C3B6E',
              border: '1px solid rgba(60,59,110,0.25)', cursor: 'pointer',
            }}
          >
            Archive
          </button>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            style={{
              display: 'inline-flex', alignItems: 'center', padding: '6px 14px',
              borderRadius: '999px', fontSize: '12px', fontWeight: 700,
              background: confirming ? '#DC2626' : 'rgba(220,38,38,0.08)',
              color: confirming ? '#fff' : '#DC2626',
              border: '1px solid rgba(220,38,38,0.22)', cursor: 'pointer',
            }}
          >
            {confirming ? 'Confirm delete?' : 'Delete'}
          </button>
        )}
      </div>
    </div>
  )
}
