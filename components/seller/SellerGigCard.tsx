'use client'

import React from 'react'
import Link from 'next/link'
import { computeSEOScore } from '@/lib/seoUtils'
import type { SEOData } from '@/lib/seoUtils'

interface GigMetrics {
  impressions: number
  clicks: number
  saves: number
}

interface GigTier {
  tier?: string
  title?: string
  price?: number | string
  delivery_days?: number | string
  revisions?: number | string
  features?: string[]
  is_active?: boolean
  description?: string
}

interface GalleryImage { url?: string }

interface Gig {
  id: string
  slug: string
  title: string
  status: string
  category: string | null
  pitch: string
  description?: string
  tags?: string[]
  seo_title?: string
  seo_description?: string
  jurisdiction?: string
  content_score: number
  metrics: GigMetrics | null
  gallery_images?: Array<GalleryImage | string>
  tiers?: GigTier[]
  created_at?: string
}

interface SellerGigCardProps {
  gig: Gig
  selected: boolean
  expanded: boolean
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onStatusChange: (id: string, status: string) => void
  onPublish: (id: string) => void
}

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

const STATUS_CONFIG: Record<string, { bg: string; text: string; border: string; accent: string; dot: string; label: string }> = {
  active:         { bg: '#EAF5EE', text: '#1A6B45', border: 'rgba(26,107,69,0.22)',  accent: '#1A6B45', dot: '#1A6B45', label: 'Active' },
  draft:          { bg: '#F5EDD6', text: '#7A6030', border: 'rgba(154,123,59,0.28)', accent: '#9A7B3B', dot: '#9A7B3B', label: 'Draft' },
  paused:         { bg: '#E5EEF7', text: '#1F3A6B', border: 'rgba(31,58,107,0.22)', accent: '#1F3A6B', dot: '#1F3A6B', label: 'Paused' },
  suspended:      { bg: '#FEF5E4', text: '#7A4D08', border: 'rgba(139,94,10,0.25)',  accent: '#8B5E0A', dot: '#D97706', label: 'Suspended' },
  archived:       { bg: '#EDEAF7', text: '#3D2B6B', border: 'rgba(61,43,107,0.22)', accent: '#3D2B6B', dot: '#6B5AB0', label: 'Archived' },
  deleted:        { bg: '#FAEAEA', text: '#7A1A1A', border: 'rgba(139,26,26,0.22)', accent: '#8B1A1A', dot: '#8B1A1A', label: 'Deleted' },
  pending_review: { bg: '#E8F4F6', text: '#0E5563', border: 'rgba(14,124,142,0.25)', accent: '#0E7C8E', dot: '#0E7C8E', label: 'In Review' },
  denied:         { bg: '#FAEAEA', text: '#7A1A1A', border: 'rgba(139,26,26,0.22)', accent: '#8B1A1A', dot: '#8B1A1A', label: 'Denied' },
  appeal_pending: { bg: '#FEF5E4', text: '#7A4D08', border: 'rgba(139,94,10,0.25)',  accent: '#8B5E0A', dot: '#D97706', label: 'Appeal Pending' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 8px 3px 6px', borderRadius: '4px',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase' as const,
      background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
      lineHeight: 1.2,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  )
}

function resolveThumb(gallery?: Array<GalleryImage | string>): string | null {
  if (!Array.isArray(gallery) || gallery.length === 0) return null
  const first = gallery[0]
  if (typeof first === 'string') return first.trim() || null
  if (first && typeof first === 'object' && typeof first.url === 'string') return first.url.trim() || null
  return null
}

function resolveStartingPrice(tiers?: GigTier[]): { price: number; days: number } | null {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  const active = tiers.filter((t) => t.is_active !== false)
  const source = active.length ? active : tiers
  const prices = source.map((t) => Number(t.price ?? 0)).filter((n) => Number.isFinite(n) && n > 0)
  if (!prices.length) return null
  const minPrice = Math.min(...prices)
  const matched = source.find((t) => Number(t.price) === minPrice)
  const days = Number(matched?.delivery_days ?? 0)
  return { price: minPrice, days: Number.isFinite(days) && days > 0 ? days : 0 }
}

function fmtMoney(cents: number): string {
  // price column is stored in cents (gig_tiers convention)
  const dollars = cents / 100
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars % 1000 === 0 ? 0 : 1)}k`
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return n.toLocaleString()
}

function ThumbnailBox({ src, title, accent }: { src: string | null; title: string; accent: string }) {
  const initials = title.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '·'
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        style={{
          width: '92px', height: '92px', objectFit: 'cover',
          borderRadius: '6px', flexShrink: 0,
          border: '1px solid #E8E4DC', background: '#F7F5F0',
        }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return (
    <div style={{
      width: '92px', height: '92px', borderRadius: '6px', flexShrink: 0,
      background: `linear-gradient(135deg, ${accent}18 0%, ${accent}08 100%)`,
      border: '1px solid #E8E4DC',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: serif, fontSize: '24px', fontWeight: 600,
      color: accent, letterSpacing: '0.01em',
    }}>
      {initials}
    </div>
  )
}

function ScoreChip({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const color = clamped >= 75 ? '#1A6B45' : clamped >= 45 ? '#8B5E0A' : '#8B1A1A'
  const bg = clamped >= 75 ? '#EAF5EE' : clamped >= 45 ? '#FFF8E7' : '#FAEAEA'
  return (
    <span title={`Content score ${clamped}%`} style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 700, color, background: bg,
      border: `1px solid ${color}25`,
      fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: color }} />
      {clamped}
    </span>
  )
}

function InlineMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div title={hint} style={{ display: 'flex', flexDirection: 'column' as const, gap: '1px', minWidth: '46px' }}>
      <span style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
        {value}
      </span>
      <span style={{ fontSize: '9px', color: '#9097A8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
        {label}
      </span>
    </div>
  )
}

interface KebabAction { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }

function KebabMenu({ actions }: { actions: KebabAction[] }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' as const }}>
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        style={{
          width: '30px', height: '30px', borderRadius: '6px',
          background: open ? '#F2EFE9' : 'transparent',
          border: '1px solid #DDD8CE', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#5C6070', padding: 0,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.6" />
          <circle cx="8" cy="8" r="1.6" />
          <circle cx="13" cy="8" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute' as const, top: 'calc(100% + 4px)', right: 0,
            background: '#FFFFFF', border: '1px solid #DDD8CE', borderRadius: '7px',
            boxShadow: '0 6px 24px rgba(15,23,42,0.10), 0 2px 6px rgba(15,23,42,0.06)',
            minWidth: '170px', padding: '4px', zIndex: 30,
          }}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              role="menuitem"
              type="button"
              disabled={a.disabled}
              onClick={(e) => { e.stopPropagation(); setOpen(false); a.onClick() }}
              style={{
                display: 'block', width: '100%', textAlign: 'left' as const,
                padding: '8px 12px', fontSize: '13px', fontWeight: 500,
                color: a.disabled ? '#B0A99A' : a.danger ? '#8B1A1A' : '#0F172A',
                background: 'transparent', border: 'none', borderRadius: '4px',
                cursor: a.disabled ? 'not-allowed' : 'pointer',
                fontFamily: sans,
              }}
              onMouseEnter={(e) => { if (!a.disabled) (e.currentTarget as HTMLButtonElement).style.background = a.danger ? '#FAEAEA' : '#F7F5F0' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PrimaryAction({ status, gigId, onPublish }: { status: string; gigId: string; onPublish: (id: string) => void }) {
  const linkStyle = (bg: string, color: string, border: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '7px 14px', borderRadius: '6px',
    fontSize: '12px', fontWeight: 600, letterSpacing: '0.01em',
    background: bg, color, border: `1px solid ${border}`,
    cursor: 'pointer', textDecoration: 'none', fontFamily: sans,
    whiteSpace: 'nowrap' as const,
  })

  if (['draft', 'paused', 'archived', 'suspended'].includes(status)) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onPublish(gigId) }} style={linkStyle('#1A6B45', '#FFFFFF', '#1A6B45')}>
        {status === 'draft' ? 'Publish' : status === 'paused' ? 'Resume' : 'Re-publish'}
      </button>
    )
  }
  if (status === 'deleted') {
    return (
      <Link href={`/dashboard/gigs/${gigId}/edit`} onClick={(e) => e.stopPropagation()} style={linkStyle('#FFFFFF', '#5C6070', '#DDD8CE')}>
        View
      </Link>
    )
  }
  // active / pending_review / denied / appeal_pending → Edit is the primary
  return (
    <Link href={`/dashboard/gigs/${gigId}/edit`} onClick={(e) => e.stopPropagation()} style={linkStyle('#0F172A', '#FFFFFF', '#0F172A')}>
      Edit
    </Link>
  )
}

export default function SellerGigCard({
  gig, selected, expanded,
  onToggleSelect, onToggleExpand,
  onStatusChange, onPublish,
}: SellerGigCardProps) {
  const [confirmingDelete, setConfirmingDelete] = React.useState(false)
  const [hovered, setHovered] = React.useState(false)
  const cfg = STATUS_CONFIG[gig.status] ?? STATUS_CONFIG.draft

  const metrics = gig.metrics
  const impressions = metrics?.impressions ?? 0
  const clicks = metrics?.clicks ?? 0
  const saves = metrics?.saves ?? 0
  const ctr = impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : null

  const thumb = resolveThumb(gig.gallery_images)
  const startPrice = resolveStartingPrice(gig.tiers)

  const seoScore = React.useMemo(() => {
    const data: SEOData = {
      title: gig.title || '',
      pitch: gig.pitch || '',
      description: gig.description || '',
      tags: gig.tags || [],
      seo_title: gig.seo_title || '',
      seo_description: gig.seo_description || '',
      category: gig.category || '',
      jurisdiction: gig.jurisdiction || '',
    }
    return computeSEOScore(data)
  }, [gig.title, gig.pitch, gig.description, gig.tags, gig.seo_title, gig.seo_description, gig.category, gig.jurisdiction])

  const canPublish = ['draft', 'suspended'].includes(gig.status)
  const canPause = gig.status === 'active'
  const canResume = gig.status === 'paused'
  const canArchive = ['active', 'draft', 'paused', 'suspended'].includes(gig.status)
  const canRestore = gig.status === 'archived'
  const canDelete = gig.status !== 'deleted'

  const kebabActions: KebabAction[] = []
  kebabActions.push({ label: 'Edit', onClick: () => { window.location.assign(`/dashboard/gigs/${gig.id}/edit`) } })
  kebabActions.push({ label: 'Preview ↗', onClick: () => { window.open(`/marketplace/gigs/${gig.slug}`, '_blank', 'noopener,noreferrer') } })
  if (canPublish) kebabActions.push({ label: 'Publish', onClick: () => onPublish(gig.id) })
  if (canResume)  kebabActions.push({ label: 'Resume',  onClick: () => onPublish(gig.id) })
  if (canPause)   kebabActions.push({ label: 'Pause',   onClick: () => onStatusChange(gig.id, 'paused') })
  if (canArchive) kebabActions.push({ label: 'Archive', onClick: () => onStatusChange(gig.id, 'archived') })
  if (canRestore) kebabActions.push({ label: 'Restore to draft', onClick: () => onStatusChange(gig.id, 'draft') })
  if (canDelete) {
    kebabActions.push({
      label: confirmingDelete ? 'Confirm delete?' : 'Delete',
      danger: true,
      onClick: () => {
        if (!confirmingDelete) { setConfirmingDelete(true); setTimeout(() => setConfirmingDelete(false), 4000); return }
        onStatusChange(gig.id, 'deleted')
        setConfirmingDelete(false)
      },
    })
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${selected ? '#0F172A' : hovered ? '#C8C2B6' : '#E8E4DC'}`,
        borderLeft: `3px solid ${cfg.accent}`,
        borderRadius: '8px',
        boxShadow: hovered || selected
          ? '0 3px 12px rgba(15,23,42,0.08), 0 1px 3px rgba(15,23,42,0.05)'
          : '0 1px 2px rgba(15,23,42,0.04)',
        opacity: gig.status === 'deleted' ? 0.55 : 1,
        overflow: 'hidden',
        fontFamily: sans,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* Top row — the main compact line */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '14px',
          padding: '14px 18px',
        }}
      >
        {/* Select checkbox */}
        <label
          onClick={(e) => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '18px', height: '18px', flexShrink: 0, cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(gig.id)}
            aria-label={`Select ${gig.title}`}
            style={{ width: '15px', height: '15px', accentColor: '#0F172A', cursor: 'pointer' }}
          />
        </label>

        {/* Thumbnail */}
        <ThumbnailBox src={thumb} title={gig.title} accent={cfg.accent} />

        {/* Info column */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' as const, marginBottom: '5px' }}>
            <StatusBadge status={gig.status} />
            {gig.category && (
              <span style={{
                fontSize: '10px', color: '#5C6070',
                background: '#F7F5F0', border: '1px solid #E8E4DC',
                padding: '2px 7px', borderRadius: '4px', fontWeight: 600,
                letterSpacing: '0.03em', textTransform: 'uppercase' as const,
              }}>
                {gig.category}
              </span>
            )}
            {gig.jurisdiction && (
              <span style={{
                fontSize: '10px', color: '#5C6070',
                background: '#FFFFFF', border: '1px solid #E8E4DC',
                padding: '2px 7px', borderRadius: '4px', fontWeight: 600,
                letterSpacing: '0.03em', textTransform: 'uppercase' as const,
              }}>
                {gig.jurisdiction}
              </span>
            )}
            <ScoreChip score={seoScore.score} />
          </div>

          <h3 style={{
            fontFamily: serif, fontWeight: 600, fontSize: '17px',
            color: '#0F172A', lineHeight: 1.25, margin: '0 0 3px',
            letterSpacing: '-0.01em',
            overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' as const,
          }}>
            {gig.title}
          </h3>

          {gig.pitch && (
            <p style={{
              color: '#5C6070', fontSize: '12px', lineHeight: 1.45, margin: 0,
              overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis' as const,
            }}>
              {gig.pitch}
            </p>
          )}
        </div>

        {/* Price */}
        {startPrice && (
          <div style={{
            display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-end',
            flexShrink: 0, minWidth: '78px', borderLeft: '1px solid #F2EFE9', paddingLeft: '14px',
          }}>
            <span style={{ fontSize: '9px', color: '#9097A8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>
              Starting at
            </span>
            <span style={{ fontSize: '17px', fontWeight: 700, color: '#0F172A', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
              {fmtMoney(startPrice.price)}
            </span>
            {startPrice.days > 0 && (
              <span style={{ fontSize: '10px', color: '#9097A8', fontWeight: 500 }}>
                {startPrice.days}-day delivery
              </span>
            )}
          </div>
        )}

        {/* Inline metrics */}
        <div style={{
          display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0,
          borderLeft: '1px solid #F2EFE9', paddingLeft: '16px',
        }}>
          <InlineMetric label="Imp." value={fmtCount(impressions)} hint="Impressions" />
          <InlineMetric label="Clicks" value={fmtCount(clicks)} hint="Clicks" />
          <InlineMetric label="CTR" value={ctr === null ? '—' : `${ctr}%`} hint="Click-through rate" />
          <InlineMetric label="Saves" value={fmtCount(saves)} hint="Saves" />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <PrimaryAction status={gig.status} gigId={gig.id} onPublish={onPublish} />
          <KebabMenu actions={kebabActions} />
          <button
            type="button"
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            onClick={(e) => { e.stopPropagation(); onToggleExpand(gig.id) }}
            style={{
              width: '30px', height: '30px', borderRadius: '6px',
              background: expanded ? '#F2EFE9' : 'transparent',
              border: '1px solid #DDD8CE', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: '#5C6070', padding: 0,
              transition: 'transform 0.15s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable: SEO + keywords */}
      {expanded && (
        <div style={{ borderTop: '1px solid #F2EFE9', background: '#FAFAF7', padding: '14px 18px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(260px, 2fr)', gap: '24px', alignItems: 'start' }}>
            {/* SEO checks */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', color: '#5C6070', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  SEO Health
                </span>
                <span style={{ fontSize: '11px', color: '#0F172A', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {seoScore.checks.filter((c) => c.passed).length}/{seoScore.checks.length} passed
                </span>
              </div>
              <div style={{ display: 'grid', gap: '5px' }}>
                {seoScore.checks.map((c) => (
                  <div key={c.label} title={c.hint} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span style={{
                      width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                      background: c.passed ? '#EAF5EE' : '#FAEAEA',
                      color: c.passed ? '#1A6B45' : '#8B1A1A',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '9px', fontWeight: 700,
                    }}>
                      {c.passed ? '✓' : '!'}
                    </span>
                    <span style={{ fontSize: '12px', color: c.passed ? '#0F172A' : '#5C6070', lineHeight: 1.4 }}>
                      {c.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', color: '#5C6070', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                  Tags
                </span>
                <span style={{ fontSize: '11px', color: '#9097A8', fontWeight: 600 }}>
                  {Array.isArray(gig.tags) ? gig.tags.length : 0}/5
                </span>
              </div>
              {Array.isArray(gig.tags) && gig.tags.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: '5px' }}>
                  {gig.tags.map((t) => (
                    <span key={t} style={{
                      padding: '3px 9px', borderRadius: '4px',
                      fontSize: '11px', fontWeight: 500, color: '#0F172A',
                      background: '#FFFFFF', border: '1px solid #DDD8CE',
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '12px', color: '#9097A8', margin: 0 }}>
                  No tags yet — open in the editor to add up to 5.
                </p>
              )}

              {/* Pricing tiers */}
              {Array.isArray(gig.tiers) && gig.tiers.length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <span style={{ fontSize: '10px', color: '#5C6070', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, display: 'block', marginBottom: '6px' }}>
                    Packages
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' as const }}>
                    {gig.tiers.map((t, i) => (
                      <div key={`${t.tier ?? i}`} style={{
                        padding: '6px 10px', background: '#FFFFFF', border: '1px solid #DDD8CE',
                        borderRadius: '5px', display: 'flex', flexDirection: 'column' as const, gap: '1px',
                        minWidth: '92px',
                      }}>
                        <span style={{ fontSize: '10px', color: '#9097A8', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
                          {t.title || t.tier || `Tier ${i + 1}`}
                        </span>
                        <span style={{ fontSize: '13px', color: '#0F172A', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtMoney(Number(t.price ?? 0))}
                        </span>
                        {t.delivery_days && (
                          <span style={{ fontSize: '10px', color: '#9097A8' }}>
                            {Number(t.delivery_days)}-day
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
