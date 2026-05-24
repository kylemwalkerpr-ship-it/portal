'use client'
import React from 'react'
import { C, Btn, Card, Badge } from './shared'

/**
 * Attorney → Earnings (Fiverr-grade).
 *
 * Three endpoints back this page:
 *   GET /api/attorney/earnings/summary  — tile aggregates + Connect status
 *   GET /api/attorney/earnings/monthly  — 12-month transferred breakdown
 *   GET /api/attorney/earnings          — paginated ledger (+ CSV export)
 *
 * Mirrors the student-billing pattern: stat tiles, filter toolbar, tabs,
 * paginated ledger table.
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 25

const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
const fmtMoney = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
const fmtRelative = s => {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d/30)}mo ago`
  return `${Math.floor(d/365)}y ago`
}

const TABS = [
  { id: 'all',         label: 'All' },
  { id: 'transferred', label: 'Transferred' },
  { id: 'pending',     label: 'Pending payout' },
  { id: 'failed',      label: 'Failed' },
  { id: 'refunded',    label: 'Refunded' },
]

const PAYOUT_CFG = {
  transferred: { color: GREEN,  label: 'Transferred' },
  pending:     { color: AMBER,  label: 'Pending' },
  failed:      { color: RED,    label: 'Failed' },
  refunded:    { color: PURPLE, label: 'Refunded' },
  held:        { color: AMBER,  label: 'Escrow held' },
}

function StatTile({ label, value, accent = NAVY, sub }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 26, color: accent, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.05 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

function PayoutPill({ status }) {
  const cfg = PAYOUT_CFG[status] || { color: MUTED, label: status || '—' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: `${cfg.color}15`, color: cfg.color }}>
      {cfg.label}
    </span>
  )
}

function MonthlyBar({ rows }) {
  if (!rows?.length) return null
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1
  // Render oldest → newest left to right
  const ordered = [...rows].sort((a, b) => a.ts - b.ts)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, padding: '12px 0' }}>
      {ordered.map(r => {
        const h = Math.max(4, Math.round((r.amount / max) * 80))
        return (
          <div key={r.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${r.label} · ${fmtMoney(r.amount)} · ${r.count} order${r.count === 1 ? '' : 's'}`}>
            <div style={{ width: '100%', height: h, background: `linear-gradient(180deg, ${CYAN}, ${NAVY})`, borderRadius: 4 }} />
            <div style={{ fontSize: 9, color: DIM, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{r.label.split(' ')[0]}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function AttorneyEarnings({ onOpenPayouts }) {
  const [summary, setSummary] = React.useState(null)
  const [monthly, setMonthly] = React.useState([])
  const [summaryLoading, setSummaryLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const [tab, setTab] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [sort, setSort] = React.useState('completed_at')
  const [dir, setDir] = React.useState('desc')

  const [ledger, setLedger] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [ledgerLoading, setLedgerLoading] = React.useState(true)
  const [ledgerError, setLedgerError] = React.useState('')

  // Summary + monthly
  React.useEffect(() => {
    setSummaryLoading(true)
    Promise.all([
      fetch('/api/attorney/earnings/summary', { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
      fetch('/api/attorney/earnings/monthly', { credentials: 'same-origin' }).then(r => r.json().catch(() => ({}))),
    ])
      .then(([s, m]) => {
        setSummary(s?.summary || null)
        setMonthly(m?.monthly || [])
      })
      .catch(e => setError(e.message || 'Failed to load summary'))
      .finally(() => setSummaryLoading(false))
  }, [])

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Ledger
  const loadLedger = React.useCallback(async () => {
    setLedgerLoading(true); setLedgerError('')
    try {
      const params = new URLSearchParams()
      params.set('status', tab)
      if (debouncedQ) params.set('q', debouncedQ)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('sort', sort); params.set('dir', dir)
      params.set('page', String(page)); params.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/attorney/earnings?${params}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setLedger(d.ledger || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
    } catch (e) {
      setLedgerError(e.message || 'Failed to load ledger.')
    } finally {
      setLedgerLoading(false)
    }
  }, [tab, debouncedQ, from, to, sort, dir, page])

  React.useEffect(() => { loadLedger() }, [loadLedger])

  const exportCSV = () => {
    const params = new URLSearchParams()
    params.set('status', tab)
    if (debouncedQ) params.set('q', debouncedQ)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('format', 'csv')
    window.location.href = `/api/attorney/earnings?${params}`
  }

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Money in</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Earnings.</h1>
        <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
          Track payouts, pending releases, and lifetime revenue. Funds settle into your connected bank automatically when clients approve delivery.
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: `${RED}10`, color: RED, fontSize: 13, fontWeight: 600 }}>{error}</div>
      )}

      {/* Hero card */}
      <Card style={{
        background: `linear-gradient(135deg, ${NAVY} 0%, #0d2060 100%)`,
        borderRadius: 16, padding: 0, position: 'relative', overflow: 'hidden', color: '#fff',
      }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 6, height: '100%', background: CYAN }} />
        <div style={{ position: 'absolute', top: 0, right: 6, width: 6, height: '100%', background: 'rgba(255,255,255,0.15)' }} />
        <div style={{ padding: '26px 30px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 6, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: MONO }}>Lifetime transferred</div>
            <div style={{ fontFamily: SERIF, fontSize: 44, fontWeight: 600, color: '#fff', lineHeight: 1, letterSpacing: '-.018em' }}>
              {summaryLoading ? '—' : fmtMoney(summary?.transferredLifetime || 0)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 6 }}>
              {summary?.transferredOrders > 0
                ? `${fmtN(summary.transferredOrders)} successful payout${summary.transferredOrders === 1 ? '' : 's'}`
                : 'Payouts will appear here when your first client approves delivery.'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {summary?.transferred30d !== undefined && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.10em', textTransform: 'uppercase', opacity: .7 }}>Last 30 days</div>
                <div style={{ fontFamily: SERIF, fontSize: 22, color: '#fff', fontWeight: 600 }}>{fmtMoney(summary.transferred30d)}</div>
              </div>
            )}
            {!summaryLoading && (
              summary?.['connect'] || true /* ts placeholder */
            )}
          </div>
        </div>
        <div style={{ padding: '16px 30px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {summary && (
            summary._noConnect ? null : null
          )}
        </div>
      </Card>

      {/* Stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <StatTile label="Pending payout" value={summaryLoading ? '—' : fmtMoney(summary?.pendingPayout || 0)} accent={AMBER} sub={summary ? `${fmtN(summary.pendingPayoutOrders)} order${summary.pendingPayoutOrders === 1 ? '' : 's'}` : ''} />
        <StatTile label="Last 30 days"   value={summaryLoading ? '—' : fmtMoney(summary?.transferred30d || 0)} accent={GREEN} sub="transferred" />
        <StatTile label="Last 90 days"   value={summaryLoading ? '—' : fmtMoney(summary?.transferred90d || 0)} accent={CYAN}  sub="transferred" />
        <StatTile label="Refunded"       value={summaryLoading ? '—' : fmtMoney(summary?.refundedLifetime || 0)} accent={PURPLE} sub="lifetime clawbacks" />
        <StatTile label="Platform fees"  value={summaryLoading ? '—' : fmtMoney(summary?.platformFeeLifetime || 0)} accent={MUTED} sub="paid to platform" />
        <StatTile label="Completed orders" value={summaryLoading ? '—' : fmtN(summary?.completedOrders || 0)} accent={NAVY} sub={summary ? `of ${fmtN(summary.totalOrders)} total` : ''} />
      </div>

      {/* Monthly chart */}
      <Card>
        <div style={{ padding: '16px 22px 8px', borderBottom: `1px solid ${BORDER2}` }}>
          <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: TEXT, letterSpacing: '-.01em' }}>Monthly transferred</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Rolling 12 months. Drag to scroll horizontally on small screens.</div>
        </div>
        <div style={{ padding: '8px 22px 16px' }}>
          {monthly.length === 0 ? (
            <div style={{ color: MUTED, fontSize: 13, padding: '20px 0' }}>No transferred payouts yet. Earnings appear here once your delivery is approved.</div>
          ) : (
            <>
              <MonthlyBar rows={monthly} />
              <div style={{ display: 'grid', gap: 4, marginTop: 12 }}>
                {monthly.map(r => (
                  <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${BORDER2}`, fontSize: 12 }}>
                    <span style={{ color: TEXT, fontWeight: 600 }}>{r.label}</span>
                    <span style={{ color: MUTED, fontFamily: MONO }}>{r.count} order{r.count === 1 ? '' : 's'}</span>
                    <span style={{ color: GREEN, fontWeight: 700, fontFamily: MONO }}>{fmtMoney(r.amount)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      {/* Toolbar */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search order #, client, title…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>
        <label style={{ fontSize: 12, color: MUTED, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          From <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} style={inlineDate} />
        </label>
        <label style={{ fontSize: 12, color: MUTED, fontFamily: MONO, display: 'flex', alignItems: 'center', gap: 4 }}>
          To <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} style={inlineDate} />
        </label>
        <select value={`${sort}:${dir}`} onChange={e => { const [c, d] = e.target.value.split(':'); setSort(c); setDir(d); setPage(1) }} style={selectStyle}>
          <option value="completed_at:desc">Most recent payout</option>
          <option value="completed_at:asc">Oldest payout</option>
          <option value="attorney_fee:desc">Highest fee</option>
          <option value="attorney_fee:asc">Lowest fee</option>
          <option value="total_amount:desc">Highest order total</option>
          <option value="created_at:desc">Newest order</option>
        </select>
        <Btn variant="secondary" size="sm" onClick={() => { setSearchInput(''); setFrom(''); setTo(''); setTab('all'); setPage(1) }}>Reset</Btn>
        <Btn variant="ghost" size="sm" onClick={exportCSV}>⬇ Export CSV</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => { setTab(t.id); setPage(1) }} style={{
              padding: '9px 14px', fontSize: 13, fontFamily: SANS, fontWeight: active ? 700 : 500,
              border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? CYAN : 'transparent'}`,
              color: active ? TEXT : MUTED, cursor: 'pointer',
            }}>{t.label}</button>
          )
        })}
      </div>

      {/* Ledger table */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        {ledgerError && (
          <div style={{ padding: '14px 18px', background: `${RED}10`, color: RED, fontSize: 13 }}>
            {ledgerError} · <button onClick={loadLedger} style={{ background: 'none', border: 'none', color: RED, textDecoration: 'underline', cursor: 'pointer', fontFamily: SANS }}>retry</button>
          </div>
        )}
        {ledgerLoading && <div style={{ padding: '32px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading ledger…</div>}
        {!ledgerLoading && !ledgerError && ledger.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            {tab === 'all' ? 'No payouts yet. Complete an order to start earning.' : `No ${TABS.find(t => t.id === tab)?.label.toLowerCase()} transactions.`}
          </div>
        )}
        {!ledgerLoading && !ledgerError && ledger.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: SURFACE2 }}>
                <Th style={{ width: 130 }}>Completed</Th>
                <Th>Order</Th>
                <Th style={{ width: 140 }}>Client</Th>
                <Th style={{ width: 110 }}>Payout</Th>
                <Th style={{ width: 110, textAlign: 'right' }}>Total</Th>
                <Th style={{ width: 110, textAlign: 'right' }}>Your fee</Th>
              </tr>
            </thead>
            <tbody>
              {ledger.map(l => (
                <tr key={l.id} style={{ borderTop: `1px solid ${BORDER2}` }}>
                  <Td>
                    <div style={{ fontSize: 12, color: TEXT }}>{fmtDate(l.completed_at || l.created_at)}</div>
                    <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>{fmtRelative(l.completed_at || l.created_at)}</div>
                  </Td>
                  <Td>
                    <div style={{ color: TEXT, fontWeight: 600 }}>{l.title}</div>
                    <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>{l.order_number || l.id.slice(0, 8)}</div>
                  </Td>
                  <Td><span style={{ color: TEXT }}>{l.client_name}</span></Td>
                  <Td><PayoutPill status={l.payout_status} /></Td>
                  <Td style={{ textAlign: 'right', fontFamily: MONO, color: MUTED }}>{fmtMoney(l.total)}</Td>
                  <Td style={{ textAlign: 'right', fontFamily: MONO, fontWeight: 700, color: l.payout_status === 'refunded' ? RED : GREEN }}>
                    {l.payout_status === 'refunded' ? '−' : ''}{fmtMoney(l.attorney_fee)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!ledgerLoading && !ledgerError && totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER2}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
    </div>
  )
}

const Th = ({ children, style }) => (
  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, ...style }}>{children}</th>
)
const Td = ({ children, style }) => (
  <td style={{ padding: '12px 14px', verticalAlign: 'top', color: TEXT, fontSize: 13, ...style }}>{children}</td>
)
const selectStyle = {
  padding: '8px 10px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: SANS, cursor: 'pointer',
}
const inlineDate = {
  padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: MONO,
}
