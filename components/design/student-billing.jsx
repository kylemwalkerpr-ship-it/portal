'use client'
import React from 'react'
import { Card, Btn, Badge } from './shared'

/**
 * Student → Billing (Fiverr-grade).
 *
 * Wallet header + summary tiles + paginated transaction ledger with type
 * filter, search, date range, and CSV export. Payment methods + top-up are
 * rendered via slot props so we can keep the parent's NmiPaymentSection
 * and TopUpDialog (they own the Collect.js lifecycle).
 *
 * Props:
 *   currency             — display currency ('usd' | 'cad')
 *   onTopUpClick()       — opens the parent-owned top-up dialog
 *   paymentMethodsSlot   — JSX node rendering payment methods (NmiPaymentSection)
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`
const PAGE_SIZE = 25

const fmtMoneyCents = (cents, code = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: String(code || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(Number(cents || 0) / 100)
const fmtN = n => Number(n ?? 0).toLocaleString('en-US')
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

const TYPE_CONFIG = {
  purchase:      { label: 'Purchase',      icon: '🛒', color: NAVY,   sign: '-' },
  refund:        { label: 'Refund',        icon: '↩',  color: GREEN,  sign: '+' },
  wallet_credit: { label: 'Wallet credit', icon: '💳', color: PURPLE, sign: '+' },
  release:       { label: 'Escrow release',icon: '🔓', color: AMBER,  sign: '·' },
  topup:         { label: 'Top up',        icon: '➕', color: GREEN,  sign: '+' },
}

const TABS = [
  { id: 'all',           label: 'All' },
  { id: 'topup',         label: 'Top ups' },
  { id: 'purchase',      label: 'Purchases' },
  { id: 'refund',        label: 'Refunds' },
  { id: 'wallet_credit', label: 'Wallet credits' },
  { id: 'release',       label: 'Escrow releases' },
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

export default function StudentBilling({ currency = 'usd', onTopUpClick, paymentMethodsSlot }) {
  // ── Wallet balance (NMI-backed) ─────────────────────────────────────
  const [walletBal, setWalletBal] = React.useState(null)
  const [walletPending, setWalletPending] = React.useState(null)
  const loadWallet = React.useCallback(() => {
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => {
        setWalletBal(Number(d.available ?? 0))
        setWalletPending(Number(d.pending ?? 0))
      })
      .catch(() => { setWalletBal(0); setWalletPending(0) })
  }, [])
  React.useEffect(() => { loadWallet() }, [loadWallet])

  // ── Summary tiles ──────────────────────────────────────────────────────
  const [summary, setSummary] = React.useState(null)
  const [summaryLoading, setSummaryLoading] = React.useState(true)
  const loadSummary = React.useCallback(() => {
    setSummaryLoading(true)
    fetch('/api/student/billing/summary', { credentials: 'same-origin' })
      .then(r => r.json().catch(() => ({})))
      .then(d => setSummary(d?.summary || null))
      .catch(() => setSummary(null))
      .finally(() => setSummaryLoading(false))
  }, [])
  React.useEffect(() => { loadSummary() }, [loadSummary])

  // ── Ledger ─────────────────────────────────────────────────────────────
  const [tab, setTab] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [searchInput, setSearchInput] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  const [tx, setTx] = React.useState([])
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(searchInput); setPage(1) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const loadLedger = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.set('type', tab)
      if (debouncedQ) params.set('q', debouncedQ)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      params.set('page', String(page))
      params.set('page_size', String(PAGE_SIZE))
      const r = await fetch(`/api/student/billing/transactions?${params}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setTx(d.transactions || [])
      setTotal(d.total || 0)
      setTotalPages(d.total_pages || 1)
      setHasMore(!!d.has_more)
    } catch (e) {
      setError(e.message || 'Failed to load transactions.')
    } finally {
      setLoading(false)
    }
  }, [tab, debouncedQ, from, to, page])

  React.useEffect(() => { loadLedger() }, [loadLedger])

  const exportCSV = () => {
    const params = new URLSearchParams()
    params.set('type', tab)
    if (debouncedQ) params.set('q', debouncedQ)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('format', 'csv')
    window.location.href = `/api/student/billing/transactions?${params}`
  }

  const cur = currency

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.16em', color: GOLD, textTransform: 'uppercase', fontFamily: MONO, marginBottom: 4 }}>Money</div>
        <h1 style={{ fontFamily: SERIF, fontSize: 32, fontWeight: 500, color: TEXT, margin: 0, letterSpacing: '-.012em' }}>Billing.</h1>
      </div>

      {/* Wallet card */}
      <Card style={{
        background: `linear-gradient(135deg, #ffffff, ${PURPLE}10)`,
        border: `1px solid ${PURPLE}33`,
        borderRadius: 12,
        padding: '22px 26px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.14em', fontFamily: MONO, marginBottom: 6 }}>Wallet balance</div>
            <div style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 600, color: TEXT, lineHeight: 1, letterSpacing: '-.012em' }}>
              {walletBal === null ? '—' : fmtMoneyCents(Math.round(walletBal * 100), cur)}
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 6, fontFamily: MONO }}>
              {walletPending > 0
                ? `Available to spend · ${fmtMoneyCents(Math.round(walletPending * 100), cur)} pending`
                : 'Available to spend on services'}
            </div>
          </div>
          <Btn variant="primary" size="sm" onClick={onTopUpClick}>+ Top up wallet</Btn>
        </div>
      </Card>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <StatTile label="Lifetime spend"  value={summaryLoading ? '—' : fmtMoneyCents(Math.round((summary?.lifetimeSpend ?? 0) * 100), cur)}  accent={NAVY}   sub={summary ? `${fmtMoneyCents(Math.round((summary?.last30Spend ?? 0) * 100), cur)} last 30d` : ''} />
        <StatTile label="Refunds"          value={summaryLoading ? '—' : fmtMoneyCents(Math.round((summary?.lifetimeRefund ?? 0) * 100), cur)} accent={GREEN}  sub={summary ? `${fmtMoneyCents(Math.round((summary?.last30Refund ?? 0) * 100), cur)} last 30d` : ''} />
        <StatTile label="Escrow held"      value={summaryLoading ? '—' : fmtMoneyCents(Math.round((summary?.escrowHeld ?? 0) * 100), cur)}    accent={AMBER}  sub="for active orders" />
        <StatTile label="Wallet credit"    value={summaryLoading ? '—' : fmtMoneyCents(Math.round((summary?.walletCreditPending ?? 0) * 100), cur)} accent={PURPLE} sub="pending application" />
        <StatTile label="Orders placed"    value={summaryLoading ? '—' : fmtN(summary?.totalOrders ?? 0)}                                accent={CYAN}   sub={summary ? `${fmtN(summary?.activeOrders ?? 0)} active` : ''} />
      </div>

      {/* Toolbar */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: DIM, fontSize: 14 }}>🔍</span>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search description or order #…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6, background: BG, color: TEXT, fontFamily: SANS, boxSizing: 'border-box' }}
          />
        </div>
        <label style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
          From <input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }}
            style={inlineDate} />
        </label>
        <label style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
          To <input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }}
            style={inlineDate} />
        </label>
        <Btn variant="secondary" size="sm" onClick={() => { setFrom(''); setTo(''); setSearchInput(''); setTab('all'); setPage(1) }}>Reset</Btn>
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

      {/* Ledger */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
        {error && (
          <div style={{ padding: '16px 20px', background: `${RED}10`, color: RED, fontSize: 13, fontWeight: 600 }}>
            {error} · <button onClick={loadLedger} style={{ background: 'none', border: 'none', color: RED, textDecoration: 'underline', cursor: 'pointer', fontFamily: SANS }}>retry</button>
          </div>
        )}
        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading transactions…</div>
        )}
        {!loading && !error && tx.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            {tab === 'all'
              ? "No transactions yet. They'll appear here once you place your first order."
              : `No ${TABS.find(t => t.id === tab)?.label.toLowerCase() || 'transactions'} in this view.`}
          </div>
        )}
        {!loading && !error && tx.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: SURFACE2 }}>
                <Th style={{ width: 130 }}>Date</Th>
                <Th>Description</Th>
                <Th style={{ width: 120 }}>Order #</Th>
                <Th style={{ width: 120 }}>Status</Th>
                <Th style={{ width: 140, textAlign: 'right' }}>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {tx.map(t => {
                const cfg = TYPE_CONFIG[t.type] || { label: t.type, icon: '·', color: MUTED, sign: '' }
                const cur = String(t.currency || 'usd').toUpperCase()
                return (
                  <tr key={t.id} style={{ borderTop: `1px solid ${BORDER2}` }}>
                    <Td>
                      <div style={{ fontSize: 12, color: TEXT }}>{fmtDate(t.date)}</div>
                      <div style={{ fontSize: 10, color: DIM, fontFamily: MONO }}>{fmtRelative(t.date)}</div>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                        <div>
                          <div style={{ color: TEXT, fontWeight: 600 }}>{t.description}</div>
                          <div style={{ fontSize: 10, color: cfg.color, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', fontFamily: MONO }}>{cfg.label}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{t.orderNumber || (t.orderId ? t.orderId.slice(0, 8) : '—')}</span>
                    </Td>
                    <Td>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${cfg.color}15`, color: cfg.color, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '.04em' }}>
                        {String(t.status).replace(/_/g, ' ')}
                      </span>
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: t.signedCents > 0 ? GREEN : t.signedCents < 0 ? TEXT : MUTED, fontVariantNumeric: 'tabular-nums' }}>
                        {cfg.sign === '·' ? '' : cfg.sign}{fmtMoneyCents(t.amountCents, cur)}
                      </span>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && !error && totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

      {/* Payment methods (parent-owned NmiPaymentSection) */}
      {paymentMethodsSlot}
    </div>
  )
}

const Th = ({ children, style }) => (
  <th style={{
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    letterSpacing: '.06em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO,
    ...style,
  }}>{children}</th>
)
const Td = ({ children, style }) => (
  <td style={{ padding: '12px 14px', verticalAlign: 'top', color: TEXT, fontSize: 13, ...style }}>{children}</td>
)
const inlineDate = {
  marginLeft: 6, padding: '6px 8px', fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 6,
  background: BG, color: TEXT, fontFamily: MONO,
}
