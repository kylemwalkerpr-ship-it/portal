'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  onDuplicate: (id: string) => void
  onNotice: (type: 'ok' | 'err', msg: string) => void
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

type KebabItem =
  | { kind: 'action'; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { kind: 'divider' }

// Icons are 14px monochrome strokes that inherit currentColor.
const ICON = {
  share: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M11 5L8 2L5 5M8 2V10M3 10V13a1 1 0 001 1h8a1 1 0 001-1v-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  link: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M6.5 9.5l3-3M7 4.5L8.5 3a2.5 2.5 0 013.5 3.5L10.5 8M9 11.5L7.5 13a2.5 2.5 0 01-3.5-3.5L5.5 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  external: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M9 3h4v4M13 3L7 9M11 9v3a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  copy: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5" y="5" width="8" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-5A1.5 1.5 0 003 3.5v7A1.5 1.5 0 004.5 12H5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  ),
  chart: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 13V5M7 13V8M11 13V3M2 13.5h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  pause: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5" y="3" width="2" height="10" rx="0.6" fill="currentColor" />
      <rect x="9" y="3" width="2" height="10" rx="0.6" fill="currentColor" />
    </svg>
  ),
  play: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
    </svg>
  ),
  archive: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3" width="12" height="3" rx="0.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3 6v6.5A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6M6.5 8.5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  restore: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8a5 5 0 109-3M3 4v3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4.5h10M6 4.5V3a1 1 0 011-1h2a1 1 0 011 1v1.5M4.5 4.5l.5 8.5a1 1 0 001 1h4a1 1 0 001-1l.5-8.5M7 7v5M9 7v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

interface MenuCoords { top: number; left: number }

function KebabMenu({ items }: { items: KebabItem[] }) {
  const [coords, setCoords] = React.useState<MenuCoords | null>(null)
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const open = coords !== null

  const close = React.useCallback(() => setCoords(null), [])

  const place = React.useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const MENU_WIDTH = 200
    const MENU_PAD = 8
    const top = r.bottom + 6
    // Anchor right-aligned to the button, but keep on-screen
    let left = r.right - MENU_WIDTH
    if (left < MENU_PAD) left = MENU_PAD
    if (left + MENU_WIDTH > window.innerWidth - MENU_PAD) left = window.innerWidth - MENU_WIDTH - MENU_PAD
    setCoords({ top, left })
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onClickAway = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onScrollOrResize = () => close()
    document.addEventListener('mousedown', onClickAway)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', onClickAway)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, close])

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) close()
    else place()
  }

  const menu = open && typeof document !== 'undefined' ? createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed' as const,
        top: `${coords!.top}px`,
        left: `${coords!.left}px`,
        width: '200px',
        background: '#FFFFFF',
        border: '1px solid #DDD8CE',
        borderRadius: '8px',
        boxShadow: '0 10px 36px rgba(15,23,42,0.14), 0 3px 10px rgba(15,23,42,0.08)',
        padding: '5px',
        zIndex: 1000,
        fontFamily: sans,
        animation: 'kebabFadeIn 0.12s ease-out',
      }}
    >
      <style>{`@keyframes kebabFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {items.map((item, i) => {
        if (item.kind === 'divider') {
          return <div key={`d-${i}`} role="separator" style={{ height: '1px', background: '#F2EFE9', margin: '4px 6px' }} />
        }
        const color = item.disabled ? '#B0A99A' : item.danger ? '#8B1A1A' : '#0F172A'
        return (
          <button
            key={item.label}
            role="menuitem"
            type="button"
            disabled={item.disabled}
            onClick={(e) => { e.stopPropagation(); close(); item.onClick() }}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              width: '100%', textAlign: 'left' as const,
              padding: '8px 10px', fontSize: '13px', fontWeight: 500,
              color, background: 'transparent',
              border: 'none', borderRadius: '5px',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              fontFamily: sans,
            }}
            onMouseEnter={(e) => { if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = item.danger ? '#FAEAEA' : '#F7F5F0' }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <span style={{ width: '14px', height: '14px', flexShrink: 0, color, opacity: 0.85, display: 'inline-flex' }}>
              {item.icon}
            </span>
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        )
      })}
    </div>,
    document.body,
  ) : null

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        style={{
          width: '30px', height: '30px', borderRadius: '6px',
          background: open ? '#F2EFE9' : 'transparent',
          border: '1px solid #DDD8CE', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#5C6070', padding: 0,
          transition: 'background 0.12s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.6" />
          <circle cx="8" cy="8" r="1.6" />
          <circle cx="13" cy="8" r="1.6" />
        </svg>
      </button>
      {menu}
    </>
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
  onStatusChange, onPublish, onDuplicate, onNotice,
}: SellerGigCardProps) {
  const router = useRouter()
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
  // The primary button shows Edit only for live/in-review states — for
  // every other status the primary is a state action (Publish/Resume/etc),
  // so Edit needs to live in the kebab instead.
  const editIsPrimary = ['active', 'pending_review', 'denied', 'appeal_pending'].includes(gig.status)
  const isViewable = gig.status === 'active'

  const handleShare = async () => {
    const url = `${window.location.origin}/marketplace/gigs/${gig.slug}`
    // Use Web Share API on mobile/PWA, fall back to clipboard.
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> }
    if (typeof nav.share === 'function') {
      try { await nav.share({ title: gig.title, url }); return } catch { /* user cancelled — fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      onNotice('ok', 'Public link copied to clipboard.')
    } catch {
      onNotice('err', `Could not copy. Link: ${url}`)
    }
  }

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/marketplace/gigs/${gig.slug}`
    try {
      await navigator.clipboard.writeText(url)
      onNotice('ok', 'Public link copied to clipboard.')
    } catch {
      onNotice('err', 'Could not copy link to clipboard.')
    }
  }

  const items: KebabItem[] = []

  // 1) View & share actions — present for every status (so a deleted gig
  //    can still be inspected before being purged).
  if (!editIsPrimary && gig.status !== 'deleted') {
    items.push({ kind: 'action', label: 'Edit', icon: ICON.edit, onClick: () => router.push(`/dashboard/gigs/${gig.id}/edit`) })
  }
  items.push({ kind: 'action', label: 'Preview', icon: ICON.external, onClick: () => window.open(`/marketplace/gigs/${gig.slug}`, '_blank', 'noopener,noreferrer') })
  items.push({ kind: 'action', label: 'Share', icon: ICON.share, onClick: handleShare, disabled: !isViewable })
  items.push({ kind: 'action', label: 'Copy public link', icon: ICON.link, onClick: handleCopyLink, disabled: !isViewable })
  items.push({ kind: 'action', label: 'Duplicate', icon: ICON.copy, onClick: () => onDuplicate(gig.id) })
  items.push({ kind: 'action', label: 'SEO insights', icon: ICON.chart, onClick: () => router.push('/dashboard/seo-analytics') })

  // 2) State-change actions — only the transitions the seller is allowed
  //    to drive from here. The primary button on the row handles the
  //    most-likely next action; the kebab carries everything else.
  const stateActions: KebabItem[] = []
  if (canPublish && gig.status !== 'draft') stateActions.push({ kind: 'action', label: 'Publish', icon: ICON.play, onClick: () => onPublish(gig.id) })
  if (canResume && gig.status !== 'paused') stateActions.push({ kind: 'action', label: 'Resume', icon: ICON.play, onClick: () => onPublish(gig.id) })
  if (canPause) stateActions.push({ kind: 'action', label: 'Pause', icon: ICON.pause, onClick: () => onStatusChange(gig.id, 'paused') })
  if (canArchive) stateActions.push({ kind: 'action', label: 'Archive', icon: ICON.archive, onClick: () => onStatusChange(gig.id, 'archived') })
  if (canRestore) stateActions.push({ kind: 'action', label: 'Restore to draft', icon: ICON.restore, onClick: () => onStatusChange(gig.id, 'draft') })
  if (stateActions.length) {
    items.push({ kind: 'divider' })
    items.push(...stateActions)
  }

  // 3) Destructive — always last, with a two-step confirm.
  if (canDelete) {
    items.push({ kind: 'divider' })
    items.push({
      kind: 'action',
      label: confirmingDelete ? 'Confirm delete?' : 'Delete',
      icon: ICON.trash,
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
          <KebabMenu items={items} />
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
