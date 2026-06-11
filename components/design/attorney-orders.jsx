'use client'
import React from 'react'
import { Card, Btn, Badge, Avatar } from './shared'

/**
 * Attorney → Active Orders (Fiverr-grade).
 *
 * Server-side paginated, status-tabbed list of orders where the signed-in
 * attorney is the seller. Mirrors the student orders pattern but reads
 * different signals (overdue, unread from client, attorney fee instead of
 * total).
 *
 * Props:
 *   onOpenOrder(order) — opens the existing OrderDetail flow from attorney.jsx
 */

const NAVY='var(--portal-ink)', GOLD='var(--portal-gold)', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='var(--portal-accent)', PURPLE='#3D2B6B'
const BG='var(--portal-bg)', SURFACE='var(--portal-surface)', SURFACE2='var(--portal-surface-2)', BORDER='var(--portal-rule)', BORDER2='var(--portal-rule-soft)', TEXT='var(--portal-ink)', MUTED='var(--portal-ink-mid)', DIM='var(--portal-ink-soft)'
const SERIF=`var(--portal-font-display, 'Cormorant Garamond', Georgia, serif)`
const SANS=`var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif)`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 25

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtMoney = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
const fmtRelative = s => {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 7) return `${d}d ago`
  if (d < 30) return `${Math.floor(d/7)}w ago`
  if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}y ago`
}

const STATUS_CFG = {
  pending:   { color: AMBER,  label: 'Pending' },
  created:   { color: AMBER,  label: 'Created' },
  active:    { color: CYAN,   label: 'In progress' },
  review:    { color: AMBER,  label: 'Awaiting approval' },
  completed: { color: GREEN,  label: 'Completed' },
  cancelled: { color: RED,    label: 'Cancelled' },
  refunded:  { color: PURPLE, label: 'Refunded' },
  disputed:  { color: RED,    label: 'Disputed' },
}

const ESCROW_CFG = {
  held:     { color: AMBER,  label: 'Escrow held' },
  released: { color: GREEN,  label: 'Released' },
  refunded: { color: RED,    label: 'Refunded' },
  disputed: { color: RED,    label: 'Disputed' },
  frozen:   { color: PURPLE, label: 'Frozen' },
}

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'In progress' },
  { id: 'review',    label: 'Awaiting client approval' },
  { id: 'pending',   label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'disputed',  label: 'Disputed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'refunded',  label: 'Refunded' },
]

function StatTile({ label, value, accent = NAVY, sub, onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', fontFamily: SANS, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </button>
  )
}

function Pill({ color, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: `${color}15`, color }}>{label}</span>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 20px', display: 'flex', gap: 14 }}>
      <div style={{ width: 44, height: 44, borderRadius: '50%', background: BORDER2, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ flex: 1, display: 'grid', gap: 8 }}>
        <div style={{ height: 16, width: '60%', background: BORDER2, borderRadius: 4 }} />
        <div style={{ height: 12, width: '40%', background: '#F7F5F0', borderRadius: 4 }} />
        <div style={{ height: 6, width: '70%', background: BORDER2, borderRadius: 3 }} />
      </div>
    </div>
  )
}

export default function AttorneyOrders({ onOpenOrder }) {
  const [tab, setTab] = React.useState('active')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [escrowFilter, setEscrowFilter] = React.useState('all')
  const [sort, setSort] = React.useState('created_at')
  const [dir, setDir] = React.useState('desc')

  const [orders, setOrders] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const [stats, setStats] = React.useState(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.set('status', tab)
      if (escrowFilter !== 'all') params.set('escrow', escrowFilter)
      if (debouncedQ) params.set('q', debouncedQ)
      params.set('sort', sort); params.set('dir', dir)
      params.set('page', String(page)); params.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/attorney/orders/search?${params}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setOrders(d.orders || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
    } catch (e) {
      setError(e.message || 'Failed to load orders.')
    } finally {
      setLoading(false)
    }
  }, [tab, escrowFilter, debouncedQ, sort, dir, page])

  React.useEffect(() => { load() }, [load])

  const loadStats = React.useCallback(() => {
    setStatsLoading(true)
    fetch('/api/attorney/orders/stats', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setStats(d?.stats || null))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))
  }, [])

  React.useEffect(() => { loadStats() }, [loadStats, tab])

  // Soft poll every 12s while visible
  React.useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') { load(); loadStats() }
    }, 12000)
    return () => clearInterval(id)
  }, [load, loadStats])

  const tabCount = id => {
    if (!stats) return null
    if (id === 'all') return stats.total
    return stats[id] ?? null
  }

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Engagements</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Active orders.</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            {stats
              ? <>{fmtN(stats.active)} in progress · {fmtN(stats.review)} awaiting client approval · {fmtN(stats.dueSoon)} due in 3 days</>
              : 'Loading…'}
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <StatTile label="In progress"          value={statsLoading ? '—' : fmtN(stats?.active ?? 0)}              accent={CYAN}   sub={`${fmtN(stats?.pending ?? 0)} pending`} onClick={() => { setTab('active'); setPage(1) }} />
        <StatTile label="Awaiting client"      value={statsLoading ? '—' : fmtN(stats?.review ?? 0)}              accent={AMBER}  sub="approve / revise" onClick={() => { setTab('review'); setPage(1) }} />
        <StatTile label="Overdue"              value={statsLoading ? '—' : fmtN(stats?.overdue ?? 0)}             accent={RED}    sub="past deadline" />
        <StatTile label="Due soon"             value={statsLoading ? '—' : fmtN(stats?.dueSoon ?? 0)}             accent={AMBER}  sub="within 72h" />
        <StatTile label="Pending payout"       value={statsLoading ? '—' : fmtMoney(stats?.pendingPayoutFee ?? 0)} accent={GREEN}  sub="awaiting release" />
        <StatTile label="In-motion value"      value={statsLoading ? '—' : fmtMoney(stats?.inMotionFee ?? 0)}     accent={NAVY}   sub="your fees" />
      </div>

      {/* Toolbar */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search order # or requirements…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>
        <select value={escrowFilter} onChange={e => { setEscrowFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All escrow states</option>
          <option value="held">Escrow held</option>
          <option value="released">Released</option>
          <option value="refunded">Refunded</option>
          <option value="disputed">Disputed</option>
        </select>
        <select value={`${sort}:${dir}`} onChange={e => { const [c, d] = e.target.value.split(':'); setSort(c); setDir(d); setPage(1) }} style={selectStyle}>
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="deadline:asc">Deadline: soonest</option>
          <option value="attorney_fee:desc">Highest fee</option>
          <option value="total_amount:desc">Highest order total</option>
          <option value="progress:desc">Most progressed</option>
        </select>
        <Btn variant="ghost" size="sm" onClick={() => { load(); loadStats() }}>↻ Refresh</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id
          const c = tabCount(t.id)
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

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <div style={{ background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: RED, fontSize: 13 }}>{error}</span>
            <Btn variant="secondary" size="sm" onClick={load}>Retry</Btn>
          </div>
        )}

        {loading && (
          <>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </>
        )}

        {!loading && !error && orders.length === 0 && (
          <Card style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>📦</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
              No orders in this view
            </div>
            <div style={{ fontSize: 13, color: MUTED, maxWidth: 380, margin: '0 auto' }}>
              {tab === 'all'
                ? "You haven't won any engagements yet. Respond to inquiries in the queue to start earning."
                : 'Try a different tab — your orders may live under another status.'}
            </div>
          </Card>
        )}

        {!loading && !error && orders.map(order => (
          <OrderRow key={order.id} order={order} onClick={() => onOpenOrder?.(order.id)} />
        ))}
      </div>

      {/* Pagination */}
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

function OrderRow({ order, onClick }) {
  const [hover, setHover] = React.useState(false)
  const stCfg = STATUS_CFG[order.status] || { color: MUTED, label: order.status }
  const escCfg = ESCROW_CFG[order.escrowStatus] || { color: MUTED, label: order.escrowStatus }
  const isReview = order.status === 'review'
  const isOverdue = order.overdue
  const days = order.deadlineAt ? Math.ceil((new Date(order.deadlineAt).getTime() - Date.now()) / 86_400_000) : null
  const lastMsg = order.lastMessage

  const leftBar = isOverdue ? RED
    : isReview ? AMBER
    : order.status === 'active' ? CYAN
    : order.status === 'completed' ? GREEN
    : order.status === 'disputed' ? RED
    : MUTED

  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '16px 20px', cursor: 'pointer',
        border: `1px solid ${hover ? '#C8C2B6' : BORDER}`,
        borderLeft: `4px solid ${leftBar}`,
        boxShadow: hover ? '0 4px 14px rgba(27,45,79,0.10)' : '0 1px 3px rgba(27,45,79,0.05)',
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Avatar name={order.clientName} src={order.clientAvatar || undefined} size={44} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <Pill color={stCfg.color} label={stCfg.label} />
            <Pill color={escCfg.color} label={`🔒 ${escCfg.label}`} />
            {isReview && <Badge color="orange" style={{ fontSize: 10, fontWeight: 700 }}>⚠ Client reviewing</Badge>}
            {isOverdue && <Badge color="red" style={{ fontSize: 10, fontWeight: 700 }}>⚠ Overdue</Badge>}
            {order.unreadFromClient > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: CYAN, color: '#fff' }}>
                💬 {order.unreadFromClient} new
              </span>
            )}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: TEXT, lineHeight: 1.2, letterSpacing: '-.006em', marginBottom: 2 }}>
            {order.title}
          </div>
          <div style={{ color: MUTED, fontSize: 12, fontFamily: MONO }}>
            {order.orderNumber || order.id.slice(0, 8)} · {order.clientName} · {fmtRelative(order.createdAt)}
            {order.fileCount > 0 && <> · 📎 {order.fileCount} file{order.fileCount === 1 ? '' : 's'}</>}
          </div>
          {/* Progress */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, maxWidth: 380 }}>
            <div style={{ flex: 1, height: 6, background: BORDER2, borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${order.progress}%`, height: '100%', background: CYAN, transition: 'width 200ms' }} />
            </div>
            <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED, minWidth: 36, textAlign: 'right' }}>{order.progress}%</span>
          </div>
          {lastMsg && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: MONO, color: DIM, flexShrink: 0 }}>
                {lastMsg.from === 'client' ? '👤' : lastMsg.from === 'system' ? 'ℹ' : '↪'} {fmtRelative(lastMsg.at)}:
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{lastMsg.body || '(attachment)'}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', minWidth: 120 }}>
          <div>
            <div style={{ fontSize: 10, color: DIM, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'right' }}>Your fee</div>
            <span style={{ fontFamily: SERIF, fontSize: 22, color: GREEN, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(order.attorneyFee)}</span>
          </div>
          {order.deadlineAt && order.status !== 'completed' && order.status !== 'cancelled' && (
            <span style={{ fontSize: 11, color: isOverdue ? RED : days <= 3 ? AMBER : MUTED, fontFamily: MONO, fontWeight: 700 }}>
              {isOverdue ? `${-days}d overdue` : days === 0 ? 'due today' : days === 1 ? 'due tomorrow' : `due in ${days}d`}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: SANS, cursor: 'pointer',
}
