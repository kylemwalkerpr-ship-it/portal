'use client'
import React from 'react'
import { Card, Badge, Btn, StatusBadge, ProgressBar, Avatar } from './shared'

/**
 * Student → My Orders (Fiverr-grade).
 *
 * Server-side paginated, status-tabbed, searchable. Replaces the prior client-
 * side filter pattern so a heavy user with hundreds of historical orders still
 * gets sub-second navigation.
 *
 * Props:
 *   onOpenOrder(order) — called when a row is clicked; parent handles drawer/detail nav.
 *   onCreateOrder()    — "+ New order" button.
 *   currency           — display currency string ('usd' | 'cad'); price formatting only.
 */

// Tokens — match the rest of the student dashboard
const NAVY='#1B2D4F', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const PAGE_SIZE = 25

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtMoney = (cents, code = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: String(code || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(Number(cents || 0) / 100)
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

const TABS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'In progress' },
  { id: 'review',    label: 'Awaiting your approval' },
  { id: 'pending',   label: 'Pending' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'refunded',  label: 'Refunded' },
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

function EscrowBadge({ status }) {
  const cfg = {
    held:     { bg: `${AMBER}15`, color: AMBER,  label: 'Escrow held' },
    released: { bg: `${GREEN}15`, color: GREEN,  label: 'Escrow released' },
    refunded: { bg: `${RED}15`,   color: RED,    label: 'Refunded' },
    disputed: { bg: `${RED}15`,   color: RED,    label: 'In dispute' },
    frozen:   { bg: `${PURPLE}15`,color: PURPLE, label: 'Frozen' },
  }[status] || { bg: '#F2EFE9', color: MUTED, label: status || '—' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: cfg.bg, color: cfg.color }}>
      🔒 {cfg.label}
    </span>
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
      <div style={{ width: 100, display: 'grid', gap: 8 }}>
        <div style={{ height: 16, width: '100%', background: BORDER2, borderRadius: 4 }} />
        <div style={{ height: 18, width: '80%', background: '#F7F5F0', borderRadius: 4 }} />
      </div>
    </div>
  )
}

export default function StudentOrders({ onOpenOrder, onCreateOrder, currency = 'usd' }) {
  const [tab, setTab] = React.useState(() => {
    try { return new URLSearchParams(window.location.search).get('tab') || 'all' } catch { return 'all' }
  })
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [escrowFilter, setEscrowFilter] = React.useState('all')
  const [productFilter, setProductFilter] = React.useState('all')
  const [sort, setSort] = React.useState('created_at')
  const [dir, setDir] = React.useState('desc')

  const [orders, setOrders] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)
  const [totalPages, setTotalPages] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const [stats, setStats] = React.useState(null)
  const [statsLoading, setStatsLoading] = React.useState(true)

  // Debounce search input
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
      if (productFilter !== 'all') params.set('product', productFilter)
      if (debouncedQ) params.set('q', debouncedQ)
      params.set('sort', sort)
      params.set('dir', dir)
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/student/orders?${params}`, { credentials: 'same-origin' })
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
  }, [tab, escrowFilter, productFilter, debouncedQ, sort, dir, page])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    setStatsLoading(true)
    fetch('/api/student/orders/stats', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setStats(d?.stats || null))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false))
  }, [tab]) // refresh when tab changes (after possible action elsewhere)

  const onSort = col => {
    if (sort === col) setDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSort(col); setDir('desc') }
  }
  const sortArrow = col => sort === col ? (dir === 'asc' ? ' ↑' : ' ↓') : ''

  // Build the tab counts using stats so they update with the universe, not the current page
  const tabCount = id => {
    if (!stats) return null
    if (id === 'all') return stats.total
    if (id === 'review') return stats.awaitingApproval
    return stats[id] ?? null
  }

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 22, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Engagements</div>
          <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>My orders.</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            {stats
              ? <>{fmtN(stats.total)} total · {fmtN(stats.active)} in progress · {fmtN(stats.awaitingApproval)} awaiting your approval · {fmtN(stats.completed)} completed</>
              : 'Loading order summary…'}
          </div>
        </div>
        <Btn variant="primary" size="sm" onClick={onCreateOrder}>+ New order</Btn>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatTile label="Active"            value={statsLoading ? '—' : fmtN(stats?.active ?? 0)}                 accent={CYAN}   sub={`${fmtN(stats?.pending ?? 0)} pending`} />
        <StatTile label="Awaiting approval" value={statsLoading ? '—' : fmtN(stats?.awaitingApproval ?? 0)}        accent={AMBER}  sub="needs your action" />
        <StatTile label="Completed"         value={statsLoading ? '—' : fmtN(stats?.completed ?? 0)}              accent={GREEN}  sub="lifetime" />
        <StatTile label="Escrow held"       value={statsLoading ? '—' : fmtMoney(Math.round((stats?.escrowHeld ?? 0) * 100), currency)} accent={AMBER}  sub="held for active orders" />
        <StatTile label="Lifetime spend"    value={statsLoading ? '—' : fmtMoney(Math.round((stats?.lifetimeSpend ?? 0) * 100), currency)} accent={NAVY}  sub="across all engagements" />
      </div>

      {/* Toolbar: search + filters */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', minWidth: 220 }}>
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
        <select value={productFilter} onChange={e => { setProductFilter(e.target.value); setPage(1) }} style={selectStyle}>
          <option value="all">All products</option>
          <option value="service">Services</option>
          <option value="template">Templates</option>
        </select>
        <select value={`${sort}:${dir}`} onChange={e => { const [c, d] = e.target.value.split(':'); setSort(c); setDir(d); setPage(1) }} style={selectStyle}>
          <option value="created_at:desc">Newest first</option>
          <option value="created_at:asc">Oldest first</option>
          <option value="total_amount:desc">Price: high → low</option>
          <option value="total_amount:asc">Price: low → high</option>
          <option value="deadline:asc">Deadline: soonest</option>
          <option value="progress:desc">Most progressed</option>
        </select>
        <Btn variant="ghost" size="sm" onClick={load}>↻ Refresh</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}`, paddingBottom: 0, marginBottom: -2 }}>
        {TABS.map(t => {
          const isActive = tab === t.id
          const c = tabCount(t.id)
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }}
              style={{
                padding: '8px 14px',
                fontSize: 13, fontFamily: SANS, fontWeight: isActive ? 700 : 500,
                border: 'none', background: 'transparent',
                borderBottom: `2px solid ${isActive ? CYAN : 'transparent'}`,
                color: isActive ? TEXT : MUTED,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {t.label}
              {typeof c === 'number' && <span style={{ fontFamily: MONO, fontSize: 11, opacity: .7, fontWeight: 600 }}>({fmtN(c)})</span>}
            </button>
          )
        })}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {error && (
          <div style={{ background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          <div style={{ background: SURFACE, border: `1px dashed ${BORDER}`, borderRadius: 10, padding: '48px 28px', textAlign: 'center' }}>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
              {tab === 'all'
                ? "You don't have any orders yet."
                : `No orders in “${TABS.find(t => t.id === tab)?.label || tab}”.`}
            </div>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 18 }}>
              {tab === 'all'
                ? 'Browse the catalogue or contact an attorney to start your first engagement.'
                : 'Try a different tab — your orders may live under another status.'}
            </div>
            {tab === 'all' && <Btn variant="primary" size="sm" onClick={onCreateOrder}>+ Place your first order</Btn>}
          </div>
        )}

        {!loading && !error && orders.map(order => (
          <OrderRow key={order.id} order={order} currency={currency} onClick={() => onOpenOrder?.(order)} />
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

function OrderRow({ order, currency, onClick }) {
  const [hover, setHover] = React.useState(false)
  const isTemplate = order.productType === 'template'
  const isReview = order.status === 'review'
  const lastMsg = order.lastMessage

  return (
    <Card
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '18px 22px',
        cursor: 'pointer',
        border: `1px solid ${hover ? '#C8C2B6' : BORDER}`,
        borderLeft: `4px solid ${isReview ? AMBER : order.status === 'completed' ? GREEN : order.status === 'cancelled' || order.status === 'refunded' ? RED : CYAN}`,
        boxShadow: hover ? '0 4px 14px rgba(27,45,79,0.10)' : '0 1px 3px rgba(27,45,79,0.05)',
        transition: 'box-shadow .15s, border-color .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <Avatar name={order.consultant} size={44} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <StatusBadge status={order.status} />
            <EscrowBadge status={order.escrowStatus} />
            {isTemplate && <Badge color="purple" style={{ fontSize: 10 }}>Template</Badge>}
            {isReview && <Badge color="orange" style={{ fontSize: 10, fontWeight: 700 }}>⚠ Awaiting your approval</Badge>}
          </div>
          <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 18, color: TEXT, lineHeight: 1.2, letterSpacing: '-.006em', marginBottom: 2 }}>
            {order.service}
          </div>
          <div style={{ color: MUTED, fontSize: 12, fontFamily: MONO }}>
            {order.orderNumber || order.id.slice(0, 8)} · {isTemplate ? 'Digital delivery' : `with ${order.consultant}`} · {fmtRelative(order.createdAt)}
            {order.fileCount > 0 && <> · 📎 {order.fileCount} file{order.fileCount === 1 ? '' : 's'}</>}
          </div>
          {!isTemplate && (
            <ProgressBar value={order.progress} style={{ marginTop: 10, maxWidth: 320 }} />
          )}
          {lastMsg && (
            <div style={{ fontSize: 12, color: MUTED, marginTop: 8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <span style={{ fontFamily: MONO, color: DIM, flexShrink: 0 }}>💬 {fmtRelative(lastMsg.at)}:</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>{lastMsg.body || '(attachment)'}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', minWidth: 110 }}>
          <span style={{ fontFamily: SERIF, fontSize: 20, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(order.totalCents, currency)}</span>
          {order.deadlineAt && order.status !== 'completed' && order.status !== 'cancelled' && (
            <span style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>due {new Date(order.deadlineAt).toLocaleDateString()}</span>
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
