'use client'
import React from 'react'
import { Card, Btn, Badge } from './shared'
import IntakeForm from './inquiry-intake-form'
// Reuse the existing rich detail view (offers, messaging, system events).
import { InquiryDetail } from './my-inquiries'

/**
 * Student → My Inquiries (Fiverr-grade).
 *
 * Server-side paginated, status-tabbed, searchable. Each row shows live
 * counts of attorneys responding and pending offers so the student can
 * triage at a glance.
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 25

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtRelative = s => {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}y ago`
}

const STATUS_CONFIG = {
  open:      { bg: `${AMBER}15`, color: AMBER,  label: 'Awaiting attorney' },
  engaged:   { bg: `${CYAN}15`,  color: CYAN,   label: 'Attorneys responding' },
  claimed:   { bg: `${PURPLE}15`,color: PURPLE, label: 'Claimed' },
  converted: { bg: `${GREEN}15`, color: GREEN,  label: 'Converted to order' },
  closed:    { bg: '#F2EFE9',    color: MUTED,  label: 'Closed' },
  cancelled: { bg: `${RED}15`,   color: RED,    label: 'Cancelled' },
}

const URGENCY_COLORS = {
  urgent: RED, high: AMBER, normal: NAVY, low: MUTED,
}

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'open',      label: 'Awaiting attorney' },
  { id: 'engaged',   label: 'Responding' },
  { id: 'claimed',   label: 'Claimed' },
  { id: 'converted', label: 'Converted' },
  { id: 'closed',    label: 'Closed' },
]

function StatTile({ label, value, accent = NAVY, sub }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || { bg: '#F2EFE9', color: MUTED, label: status || '—' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

export default function StudentInquiries() {
  const [openId, setOpenId] = React.useState(null)
  const [showIntake, setShowIntake] = React.useState(false)

  const [tab, setTab] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [urgency, setUrgency] = React.useState('')

  const [inquiries, setInquiries] = React.useState([])
  const [byStatus, setByStatus] = React.useState({})
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [schemaPending, setSchemaPending] = React.useState(false)

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Monotonic request seq so a slow earlier response can't clobber newer results.
  const loadSeqRef = React.useRef(0)
  const load = React.useCallback(async (isInitial) => {
    const seq = ++loadSeqRef.current
    if (isInitial) setLoading(true)
    setError('')
    try {
      const p = new URLSearchParams()
      p.set('status', tab)
      if (debouncedQ) p.set('q', debouncedQ)
      if (urgency) p.set('urgency', urgency)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/client/inquiries/search?${p}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (seq !== loadSeqRef.current) return // stale — superseded by a newer load
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setInquiries(d.inquiries || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
      setByStatus(d.byStatus || {})
      setSchemaPending(!!d.schema_pending)
    } catch (e) {
      if (seq === loadSeqRef.current) setError(e.message || 'Failed to load inquiries.')
    } finally {
      if (isInitial && seq === loadSeqRef.current) setLoading(false)
    }
  }, [tab, debouncedQ, urgency, page])

  React.useEffect(() => { load(true) }, [load])

  // Soft poll every 12s for new responses, but only when the tab is visible
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !openId && !showIntake) load(false)
    }, 12000)
    return () => clearInterval(id)
  }, [load, openId, showIntake])

  if (showIntake) {
    return (
      <IntakeForm
        onCancel={() => setShowIntake(false)}
        onSubmitted={() => { setShowIntake(false); load(false) }}
      />
    )
  }

  if (openId) {
    return (
      <InquiryDetail
        inquiryId={openId}
        onBack={() => { setOpenId(null); load(false) }}
      />
    )
  }

  const universeTotal = (byStatus.open || 0) + (byStatus.engaged || 0) + (byStatus.claimed || 0) + (byStatus.converted || 0) + (byStatus.closed || 0) + (byStatus.cancelled || 0)

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Intake</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>My inquiries.</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Inquiries you've submitted. Multiple attorneys may respond and send you competing offers.
          </div>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowIntake(true)}>+ New inquiry</Btn>
      </div>

      {schemaPending && (
        <Card style={{ padding: 14, background: `${AMBER}10`, border: `1px solid ${AMBER}33` }}>
          <div style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>Inquiries system is initialising — your first inquiry will appear here once submitted.</div>
        </Card>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatTile label="Total"               value={fmtN(universeTotal || total)}   accent={NAVY} />
        <StatTile label="Awaiting attorney"   value={fmtN(byStatus.open || 0)}       accent={AMBER}  sub="no responses yet" />
        <StatTile label="Responding"           value={fmtN(byStatus.engaged || 0)}    accent={CYAN}   sub="attorneys engaged" />
        <StatTile label="Converted"            value={fmtN(byStatus.converted || 0)}  accent={GREEN}  sub="became orders" />
      </div>

      {/* Toolbar */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search case type or country…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>
        <select value={urgency} onChange={e => { setUrgency(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="">All urgencies</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <Btn variant="ghost" size="sm" onClick={() => load(true)}>↻ Refresh</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id
          const c = t.id === 'all' ? universeTotal : (byStatus[t.id] || 0)
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }} style={{
              padding: '9px 14px', fontSize: 13, fontFamily: SANS, fontWeight: active ? 700 : 500,
              border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? CYAN : 'transparent'}`,
              color: active ? TEXT : MUTED, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {t.label}
              {typeof c === 'number' && <span style={{ fontFamily: MONO, fontSize: 11, color: DIM }}>({fmtN(c)})</span>}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {error && (
        <Card style={{ padding: 14, background: `${RED}10`, border: `1px solid ${RED}33`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: RED, fontSize: 13 }}>{error}</span>
          <Btn variant="secondary" size="sm" onClick={() => load(true)}>Retry</Btn>
        </Card>
      )}

      {loading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <Card key={i} style={{ padding: 18, opacity: 0.6 }}>
              <div style={{ height: 14, width: '50%', background: BORDER2, borderRadius: 4, marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
              <div style={{ height: 11, width: '70%', background: '#F7F5F0', borderRadius: 4 }} />
            </Card>
          ))}
        </div>
      )}

      {!loading && !error && inquiries.length === 0 && (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 38, marginBottom: 10 }}>📥</div>
          <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
            {tab === 'all' ? 'No inquiries yet' : `No ${STATUS_CONFIG[tab]?.label.toLowerCase() || tab} inquiries`}
          </div>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 14, maxWidth: 380, margin: '0 auto 14px' }}>
            {tab === 'all'
              ? 'Click + New inquiry to describe your case and get attorney responses.'
              : 'Try a different tab to find your inquiries.'}
          </div>
          {tab === 'all' && <Btn variant="primary" size="sm" onClick={() => setShowIntake(true)}>+ New inquiry</Btn>}
        </Card>
      )}

      {!loading && !error && inquiries.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {inquiries.map(q => <InquiryRow key={q.id} inquiry={q} onClick={() => setOpenId(q.id)} />)}
        </div>
      )}

      {!loading && !error && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `1px solid ${BORDER}` }}>
          <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
            {fmtN((page - 1) * PAGE_SIZE + 1)}–{fmtN(Math.min(page * PAGE_SIZE, total))} of {fmtN(total)}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
            <span style={{ fontFamily: MONO, fontSize: 12, color: TEXT, padding: '4px 10px' }}>Page {page} / {totalPages}</span>
            <Btn variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Next →</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

function InquiryRow({ inquiry, onClick }) {
  const [hover, setHover] = React.useState(false)
  const urgColor = URGENCY_COLORS[inquiry.urgency] || MUTED
  const hasOffers = inquiry.pending_offers > 0
  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '16px 20px', cursor: 'pointer',
        border: `1px solid ${hover ? '#C8C2B6' : BORDER}`,
        borderLeft: `4px solid ${hasOffers ? GREEN : inquiry.status === 'engaged' ? CYAN : inquiry.status === 'converted' ? GREEN : AMBER}`,
        boxShadow: hover ? '0 4px 14px rgba(27,45,79,0.10)' : '0 1px 3px rgba(27,45,79,0.05)',
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <StatusPill status={inquiry.status} />
            {inquiry.urgency && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: `${urgColor}15`, color: urgColor, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                {inquiry.urgency}
              </span>
            )}
            {hasOffers && (
              <Badge color="green" style={{ fontSize: 10, fontWeight: 700 }}>
                ⚡ {inquiry.pending_offers} offer{inquiry.pending_offers === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, lineHeight: 1.2, letterSpacing: '-.006em', marginBottom: 2 }}>
            {inquiry.case_type_label || 'Inquiry'}
          </div>
          <div style={{ color: MUTED, fontSize: 12, fontFamily: MONO }}>
            {inquiry.country || '—'} · submitted {fmtRelative(inquiry.created_at)}
            {inquiry.attorneys_responding > 0 && <> · 👥 {inquiry.attorneys_responding} attorney{inquiry.attorneys_responding === 1 ? '' : 's'} engaged</>}
            {inquiry.last_activity_at && inquiry.last_activity_at !== inquiry.created_at && <> · 💬 last activity {fmtRelative(inquiry.last_activity_at)}</>}
          </div>
        </div>
        <div style={{ color: CYAN, fontSize: 13, fontFamily: MONO, fontWeight: 700 }}>Open →</div>
      </div>
    </Card>
  )
}

const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: SANS, cursor: 'pointer',
}
