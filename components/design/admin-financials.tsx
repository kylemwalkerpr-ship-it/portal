'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'
import AdminStudentFinancialDrawer from './admin-student-financial-drawer'
import AdminEscrow from './admin-escrow'
import AdminPayouts from './admin-payouts'
import AdminWallets from './admin-wallets'
import AdminWalletLoyalty from './admin-wallet-loyalty'

// ─── constants ────────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans

// ─── canonical ledger hook ──────────────────────────────────────────────────
// Self-healing GET against the unified /api/admin/analytics/ledger endpoint.
// Every data-driven tab reads from this one source so all KPIs are consistent.
function useLedgerQuery(view: string, params: Record<string, any> = {}) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  // Stable param string — build from the view + serialized params so the
  // effect only re-fires when actual query params change.
  const paramStr = React.useMemo(() => {
    const p = new URLSearchParams({ view })
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
    }
    return p.toString()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, JSON.stringify(Object.entries(params).sort((a, b) => a[0].localeCompare(b[0])))])
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true); setError('')
      try {
        const res = await fetch(`/api/admin/analytics/ledger?${paramStr}`, { credentials: 'same-origin' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Failed')
        if (!cancelled) setData(json?.data ?? json)
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [paramStr])
  return { data, loading, error }
}

// Cents → currency string. Used wherever we read from APIs that speak cents.
const fmtCents = (cents, compact = false) => {
  const dollars = (Number(cents) || 0) / 100
  const abs = Math.abs(dollars)
  if (compact && abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (compact && abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(dollars)
}
const fmtPct = (n) => `${(Number(n) || 0).toFixed(1)}%`

// "Coming soon" pill — surfaced when an API can't supply a number yet.
function ComingSoonBadge() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em',
      padding: '2px 6px', borderRadius: 3, background: '#FEF5E4', color: '#8B5E0A',
      whiteSpace: 'nowrap', marginLeft: 6,
    }}>Coming soon</span>
  )
}

function Legend({ color, label, value, dashed }: any) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 18, height: 3, borderRadius: 2, background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color,
      }} />
      <span style={{ fontSize: 12, color: 'var(--portal-ink-mid, #5C6070)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-ink, #0F172A)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function DataWarnings({ items }: any) {
  if (!items?.length) return null
  return (
    <div style={{
      background: '#FEF5E4', border: '1px solid #F0E2C0', borderRadius: 6,
      padding: '8px 12px', fontSize: 12, color: '#8B5E0A', lineHeight: 1.45,
    }}>
      <strong style={{ marginRight: 4 }}>Partial data:</strong>
      {items.slice(0, 3).join(' · ')}{items.length > 3 ? ` · +${items.length - 3} more` : ''}
    </div>
  )
}

const FINANCIAL_TABS = [
  { id: 'overview',     label: 'Overview',       icon: '📊' },
  { id: 'revenue',      label: 'Revenue',         icon: '💰' },
  { id: 'users',        label: 'User Profiles',   icon: '👤' },
  { id: 'escrow',       label: 'Escrow',          icon: '🔒' },
  { id: 'payouts',      label: 'Payouts',         icon: '💰' },
  { id: 'wallets',      label: 'Wallets',         icon: '👛' },
  { id: 'liabilities',  label: 'Liabilities',     icon: '⚖️' },
  { id: 'projections',  label: 'Projections',     icon: '📈' },
  { id: 'risk',         label: 'Risk',            icon: '🔴' },
  { id: 'loyalty',      label: 'Loyalty',         icon: '🎖' },
  { id: 'ledger-dash',  label: 'Ledger Dashboard', icon: '📋' },
]

// ── Entry-type filter groups for the Ledger Dashboard ──────────────────────
// Grouped by category so operators can quickly find the type they need.
const ENTRY_TYPE_GROUPS = [
  { label: 'Revenue', types: ['purchase', 'fee', 'commission', 'discount', 'bonus'] },
  { label: 'Payouts', types: ['payout'] },
  { label: 'Refunds', types: ['refund', 'chargeback'] },
  { label: 'Escrow', types: ['escrow_deposit', 'escrow_release', 'escrow_refund'] },
  { label: 'Other', types: ['topup', 'adjustment', 'loyalty_credit'] },
]

// ─── helpers ──────────────────────────────────────────────────────────────────
const mv  = v => Number(String(v ?? 0).replace(/[^0-9.-]/g, '')) || 0
const fmt = (n, compact = false) => {
  const abs = Math.abs(Number(n) || 0)
  if (compact && abs >= 1000000) return `$${(abs / 1000000).toFixed(1)}M`
  if (compact && abs >= 1000)    return `$${(abs / 1000).toFixed(1)}K`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0)
}
const pct = (n, d) => d === 0 ? '0%' : `${((n / d) * 100).toFixed(1)}%`
const monthKey = (dateStr: any) => { const d = new Date(dateStr); return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = key => { if (!key) return ''; const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' }) }

// ─── SVG chart primitives ─────────────────────────────────────────────────────
function BarChart({ data, height = 120, barColor = 'var(--portal-ink, #0F172A)', labelColor = 'var(--portal-ink-soft, #9097A8)' }: any) {
  if (!data.length) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: '13px' }}>No data</div>
  const max = Math.max(...data.map(d => d.value), 1)
  const w = 100 / data.length
  return (
    <svg viewBox={`0 0 100 ${height + 20}`} preserveAspectRatio="none" style={{ width: '100%', height: height + 20, overflow: 'visible' }}>
      {data.map((d, i) => {
        const bh = (d.value / max) * height
        const x = i * w + w * 0.1
        const bw = w * 0.8
        return (
          <g key={i}>
            <title>{d.label}: {fmt(d.value)}</title>
            <rect x={x} y={height - bh} width={bw} height={bh}
              fill={d.highlight ? '#C4A45A' : barColor} rx="2" opacity="0.9" />
            <text x={x + bw / 2} y={height + 14} textAnchor="middle"
              fontSize="5" fill={labelColor} fontFamily={sans}>{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function LineChart({ data, height = 100, color = 'var(--portal-ink, #0F172A)', fillColor = 'rgba(27,45,79,0.08)' }: any) {
  if (data.length < 2) return null
  const max = Math.max(...data.map(d => d.value), 1)
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: height - (d.value / max) * height,
  }))
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
  const area = `${line} L${pts[pts.length - 1].x},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <path d={area} fill={fillColor} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.5" fill={color} vectorEffect="non-scaling-stroke">
          <title>{data[i].label}: {fmt(data[i].value)}</title>
        </circle>
      ))}
    </svg>
  )
}

function DonutChart({ segments, size = 80 }: any) {
  const total = segments.reduce((s, g) => s + g.value, 0)
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: C.surface3 }} />
  const r = 30, cx = 40, cy = 40, strokeW = 12
  let cumPct = 0
  const circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.surface3} strokeWidth={strokeW} />
      {segments.filter(s => s.value > 0).map((seg, i) => {
        const segPct = seg.value / total
        const offset = circ * (1 - cumPct)
        const dash = circ * segPct
        cumPct += segPct
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color}
            strokeWidth={strokeW} strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={offset} style={{ transform: 'rotate(-90deg)', transformOrigin: '40px 40px' }}>
            <title>{seg.label}: {fmt(seg.value)}</title>
          </circle>
        )
      })}
    </svg>
  )
}

function MiniSparkline({ values, color = 'var(--portal-ink, #0F172A)' }: any) {
  if (!values || values.length < 2) return null
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 60},${20 - (v / max) * 18}`).join(' ')
  return (
    <svg viewBox="0 0 60 20" style={{ width: 60, height: 20 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, delta, icon, accent = 'var(--portal-ink, #0F172A)', onClick, chart }: any) {
  const [hov, setHov] = React.useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{ background: '#fff', border: `1px solid ${hov && onClick ? 'var(--portal-ink, #0F172A)' : 'var(--portal-rule, #DDD8CE)'}`, borderTop: `3px solid ${accent}`, borderRadius: '8px', padding: '18px 20px', cursor: onClick ? 'pointer' : 'default', boxShadow: hov && onClick ? '0 4px 12px rgba(27,45,79,0.12)' : '0 1px 3px rgba(27,45,79,0.06)', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--portal-ink-soft, #9097A8)' }}>{label}</span>
        <span style={{ fontSize: '16px', opacity: 0.5 }}>{icon}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: '26px', color: 'var(--portal-ink, #0F172A)', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--portal-ink-soft, #9097A8)', lineHeight: 1.4 }}>{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: '12px', fontWeight: 700, color: delta >= 0 ? 'var(--portal-moss, #1A6B45)' : 'var(--portal-brick, #8B1A1A)' }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs last period
        </div>
      )}
      {chart && <div style={{ marginTop: '4px' }}>{chart}</div>}
    </div>
  )
}

// ─── Section shell ─────────────────────────────────────────────────────────────
function Section({ title, sub, action, children }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: 'var(--portal-ink, #0F172A)', margin: 0, letterSpacing: '-0.01em' }}>{title}</h3>
          {sub && <p style={{ margin: '3px 0 0', fontSize: '13px', color: 'var(--portal-ink-soft, #9097A8)', lineHeight: 1.4 }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Table shell ──────────────────────────────────────────────────────────────
function DataTable({ cols, rows, emptyMsg = 'No data', onRowClick }: any) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${cols.length * 120}px` }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '11px 14px', textAlign: c.right ? 'right' : 'left', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)', background: 'var(--portal-ink, #0F172A)', whiteSpace: 'nowrap', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '32px', textAlign: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: '14px' }}>{emptyMsg}</td></tr>
            ) : rows.map((row, ri) => {
              // onRowClick is opt-in per-table. When supplied, the row
              // gains hover affordance + a pointer cursor; without it,
              // every other table on this page behaves exactly as before.
              const clickable = typeof onRowClick === 'function' && row._clickable !== false
              return (
                <tr key={ri}
                  onClick={clickable ? () => onRowClick(row, ri) : undefined}
                  style={{
                    background: ri % 2 === 0 ? '#fff' : 'var(--portal-surface-2, #FAFAF8)',
                    borderBottom: '1px solid #F2EFE9',
                    cursor: clickable ? 'pointer' : 'default',
                  }}
                  onMouseEnter={clickable ? e => { e.currentTarget.style.background = 'var(--portal-rule-soft, #F2EFE9)' } : undefined}
                  onMouseLeave={clickable ? e => { e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : 'var(--portal-surface-2, #FAFAF8)' } : undefined}
                >
                  {cols.map(c => (
                    <td key={c.key} style={{ padding: '11px 14px', fontSize: '13px', textAlign: c.right ? 'right' : 'left', color: c.muted ? 'var(--portal-ink-soft, #9097A8)' : '#1A1F2E', fontWeight: c.bold ? 700 : 400, whiteSpace: c.wrap ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ level }: any) {
  const map = { low: { bg: '#EAF5EE', color: 'var(--portal-moss, #1A6B45)', label: 'Low' }, medium: { bg: '#FEF5E4', color: '#8B5E0A', label: 'Medium' }, high: { bg: '#FAEAEA', color: 'var(--portal-brick, #8B1A1A)', label: 'High' } }
  const cfg = map[level] || map.low
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminFinancials({ orders = [], users = [], settings = {}, setPage, formatPrimary, templateOrders = [], walletTransactions = [], setActionNotice, initialTab = null }: any) {
  const [tab, setTab] = React.useState(initialTab || 'overview')
  // Navigating to an alias page (escrow/payouts/wallets/loyalty) while
  // already on Financials should switch tabs too.
  React.useEffect(() => { if (initialTab) setTab(initialTab) }, [initialTab])
  const [userSort, setUserSort] = React.useState('spent')
  const [exportMsg, setExportMsg] = React.useState('')
  // Open student id for the financial drill-down drawer. Set by clicking
  // a row in the Student / Client Spending table; cleared by the drawer's
  // own onClose. Lives at the page level so we can render the drawer at
  // the bottom of the Users tab block without re-wiring DataTable.
  const [openStudentId, setOpenStudentId] = React.useState(null)
  // Map of student display-name -> profile_id, built once from the
  // `users` prop. The DataTable's underlying student rows only carry the
  // display name (because they are aggregated from orders), so we resolve
  // the profile_id by name here. Names are unique enough in practice; on
  // a collision the first match wins, which is acceptable for an admin
  // tool — clicking again reopens with the matched id.
  // ── Canonical ledger hooks. Every tab reads from the same ledger endpoint
  //    so KPIs are consistent across views. ──────────────────────────────────
  const ledgerOverview  = useLedgerQuery('overview')
  const ledgerRevenue   = useLedgerQuery('revenue')
  const ledgerLiab      = useLedgerQuery('liabilities')
  const ledgerProj      = useLedgerQuery('projections')
  const ledgerRisk      = useLedgerQuery('risk')

  // Open payment incidents (money moved, follow-up write failed). Recorded by
  // the checkout route; earning_credit_failed rows are auto-retried by the
  // hourly cron, the rest need an operator. Surfaced on the Risk tab.
  const [incidents, setIncidents] = React.useState<any[]>([])
  const [incidentsLoading, setIncidentsLoading] = React.useState(true)
  const loadIncidents = React.useCallback(async () => {
    setIncidentsLoading(true)
    try {
      const res = await fetch('/api/admin/payment-incidents', { credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      setIncidents(res.ok ? (json?.data?.incidents ?? []) : [])
    } catch { setIncidents([]) }
    finally { setIncidentsLoading(false) }
  }, [])
  React.useEffect(() => { loadIncidents() }, [loadIncidents])
  const resolveIncident = React.useCallback(async (id: string) => {
    if (!window.confirm('Mark this incident as resolved? Confirm you have reconciled the money movement (refund issued, order created manually, or earning credited).')) return
    try {
      const res = await fetch('/api/admin/payment-incidents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setActionNotice?.(json?.error?.message || 'Could not resolve incident.')
        return
      }
      setActionNotice?.('Incident marked resolved.')
      loadIncidents()
    } catch { setActionNotice?.('Could not resolve incident.') }
  }, [loadIncidents, setActionNotice])
  const ledgerDaily     = useLedgerQuery('daily_series')
  // Ledger Dashboard date range state — defaults to current month for a
  // tight daily view, but users can widen it to any range the API supports.
  const [ldFrom, setLdFrom] = React.useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [ldTo, setLdTo] = React.useState(() => new Date().toISOString().slice(0, 10))
  // Selected entry types for the Ledger Dashboard filter. Empty array = all types.
  const [ldTypes, setLdTypes] = React.useState([])

  const ldTypeParam = ldTypes.length ? ldTypes.join(',') : undefined
  const ledgerDashboard  = useLedgerQuery('daily_series', { from: ldFrom, to: ldTo, type: ldTypeParam })

  // ── Previous period for week-over-week comparison ──────────────────────────
  // Computes the same-length duration immediately before the current range.
  const ldPrevRange = React.useMemo(() => {
    const fromMs = new Date(ldFrom).getTime()
    const toMs = new Date(ldTo).getTime()
    if (isNaN(fromMs) || isNaN(toMs) || toMs <= fromMs) return null
    const durationMs = toMs - fromMs
    const prevTo = new Date(fromMs - 1)
    const prevFrom = new Date(prevTo.getTime() - durationMs)
    return {
      from: prevFrom.toISOString().slice(0, 10),
      to: prevTo.toISOString().slice(0, 10),
      days: Math.round(durationMs / 86400_000),
    }
  }, [ldFrom, ldTo])
  const ledgerDashboardPrev = useLedgerQuery('daily_series', {
    from: ldPrevRange?.from,
    to: ldPrevRange?.to,
    type: ldTypeParam,
  })

  const toggleLdType = (type) => {
    setLdTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type])
  }

  const studentNameToId = React.useMemo(() => {
    const m = {}
    for (const u of users || []) {
      const role = String(u?.role || '').toLowerCase()
      if (role && role !== 'student' && role !== 'client') continue
      const key = u?.name || u?.full_name || u?.email
      if (key && u?.id && !m[key]) m[key] = u.id
    }
    return m
  }, [users])

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const consultantPct = Number(settings.consultant_fee_percent || 70)
  const platformPct   = 100 - consultantPct

  // Merge service orders + template orders into one ledger
  const allOrders     = [...orders, ...templateOrders.map(t => ({
    id: t.id,
    service: '📄 Template: ' + ((t.slugs || []).length > 0 ? t.slugs.join(', ') : 'Pack'),
    student: t.email || t.name || 'Guest',
    consultant: null,
    amountValue: (t.amount_cents || 0) / 100,
    adminCut: ((t.amount_cents || 0) / 100) * (platformPct / 100),
    isTemplate: true,
    consultantPay: 0,
    escrow: t.status === 'paid' ? 'released' : 'held',
    status: t.status === 'refunded' ? 'refunded' : 'completed',
    createdAt: t.created_at,

  }))]
  const activeOrders  = orders.filter(o => !['cancelled','refunded'].includes(o.status))
  const released      = orders.filter(o => o.escrow === 'released')
  const held          = orders.filter(o => o.escrow === 'held')
  const cancelled     = orders.filter(o => ['cancelled','refunded'].includes(o.status))
  const completed     = orders.filter(o => ['completed','released','paid'].includes(o.status))

  const grossRevenue    = activeOrders.reduce((s, o) => s + o.amountValue, 0)
  const netRevenue      = released.reduce((s, o) => s + mv(o.adminCut), 0)
  const totalPayouts    = released.reduce((s, o) => s + mv(o.consultantPay), 0)
  const heldEscrow      = held.reduce((s, o) => s + o.amountValue, 0)
  const cancelledValue  = cancelled.reduce((s, o) => s + o.amountValue, 0)
  const pendingRevenue  = held.reduce((s, o) => s + mv(o.adminCut), 0)
  const avgOrderValue   = activeOrders.length ? grossRevenue / activeOrders.length : 0
  const completionRate  = activeOrders.length ? (completed.length / activeOrders.length) * 100 : 0
  const cancellationRate = allOrders.length ? (cancelled.length / allOrders.length) * 100 : 0

  // Monthly breakdown
  const monthlyMap = React.useMemo(() => {
    const m = {}
    activeOrders.forEach(o => {
      const k = monthKey(o.createdAt)
      if (!k) return
      if (!m[k]) m[k] = { gross: 0, net: 0, payouts: 0, count: 0 }
      m[k].gross   += o.amountValue
      m[k].net     += mv(o.adminCut)
      m[k].payouts += mv(o.consultantPay)
      m[k].count   += 1
    })
    return m
  }, [activeOrders])

  const months = Object.keys(monthlyMap).sort()
  const last6  = months.slice(-6)
  const last3  = months.slice(-3)

  const mrr = last6.length > 0
    ? last6.reduce((s, k) => s + monthlyMap[k].gross, 0) / last6.length
    : 0
  const arr = mrr * 12

  const growthRate = last6.length >= 2
    ? ((monthlyMap[last6[last6.length - 1]].gross - monthlyMap[last6[last6.length - 2]].gross) / Math.max(1, monthlyMap[last6[last6.length - 2]].gross)) * 100
    : 0

  const monthlyBarData = last6.map(k => ({ label: monthLabel(k), value: monthlyMap[k].gross, highlight: k === last6[last6.length - 1] }))
  const cumulativeData = months.map((k, i) => ({ label: monthLabel(k), value: months.slice(0, i + 1).reduce((s, m) => s + monthlyMap[m].gross, 0) }))

  // ── Per-user financials ──────────────────────────────────────────────────────
  const userFinancials = React.useMemo(() => {
    const studentMap: Record<string, any> = {}
    const providerMap: Record<string, any> = {}

    activeOrders.forEach(o => {
      // Student side
      if (o.student && o.student !== 'Unknown student') {
        if (!studentMap[o.student]) studentMap[o.student] = { name: o.student, role: 'student', orders: 0, spent: 0, lastOrder: null, services: new Set() }
        studentMap[o.student].orders++
        studentMap[o.student].spent += o.amountValue
        if (!studentMap[o.student].lastOrder || o.createdAt > studentMap[o.student].lastOrder) studentMap[o.student].lastOrder = o.createdAt
        studentMap[o.student].services.add(o.service)
      }
      // Provider side
      if (o.consultant) {
        if (!providerMap[o.consultant]) providerMap[o.consultant] = { name: o.consultant, role: 'consultant', orders: 0, earned: 0, pending: 0, released: 0, lastOrder: null }
        providerMap[o.consultant].orders++
        const earnAmt = mv(o.consultantPay)
        providerMap[o.consultant].earned += earnAmt
        if (o.escrow === 'released') providerMap[o.consultant].released += earnAmt
        else providerMap[o.consultant].pending += earnAmt
        if (!providerMap[o.consultant].lastOrder || o.createdAt > providerMap[o.consultant].lastOrder) providerMap[o.consultant].lastOrder = o.createdAt
      }
    })

    const students  = Object.values(studentMap).map(u => ({ ...u, ltv: u.spent, avgOrder: u.orders ? u.spent / u.orders : 0, serviceCount: u.services.size }))
    const providers = Object.values(providerMap)
    return { students, providers }
  }, [activeOrders])

  const sortedStudents  = [...userFinancials.students].sort((a, b) => b[userSort === 'orders' ? 'orders' : 'spent'] - a[userSort === 'orders' ? 'orders' : 'spent'])
  const sortedProviders = [...userFinancials.providers].sort((a, b) => b.earned - a.earned)

  // ── Refund handler (canonical ledger) ──────────────────────────────────────────
  // Uses the unified /api/admin/ledger/refund endpoint so all refunds write
  // to canonical_ledger + wallet + legacy tables consistently.
  const handleRefund = async (type, id, label) => {
    if (!confirm(`Refund ${label}? This will credit the buyer via the unified ledger.`)) return
    const reason = prompt('Refund reason:')
    if (!reason) return
    const amtStr = prompt('Refund amount in dollars (leave blank for full):')
    const amountCents = amtStr ? Math.round(parseFloat(amtStr) * 100) : 0
    if (amountCents <= 0) return alert('Invalid amount.')
    try {
      const res = await fetch('/api/admin/ledger/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: null, // will be resolved server-side
          amount_cents: amountCents,
          order_id: id,
          source_table: type === 'template_order' ? 'template_orders' : 'orders',
          source_id: id,
          reason,
          method: 'wallet',
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || json?.data?.error || 'Refund failed')
      if (setActionNotice) setActionNotice(`Refund processed: ${fmtCents(amountCents)}`)
      window.location.reload()
    } catch (e) {
      if (setActionNotice) setActionNotice(e.message || 'Refund failed')
    }
  }

  // ── Concentration risk ───────────────────────────────────────────────────────
  const top3StudentRevenue = sortedStudents.slice(0, 3).reduce((s, u) => s + u.spent, 0)
  const concentrationRisk  = grossRevenue > 0 ? (top3StudentRevenue / grossRevenue) * 100 : 0

  const top1ProviderRevenue   = sortedProviders[0]?.earned || 0
  const providerConcentration = totalPayouts > 0 ? (top1ProviderRevenue / totalPayouts) * 100 : 0

  // Days since last order (churn risk)
  const now = Date.now()
  const churnRisk = userFinancials.students.filter(u => {
    if (!u.lastOrder) return true
    return (now - new Date(u.lastOrder).getTime()) > 60 * 24 * 60 * 60 * 1000
  })

  // ── Projections ──────────────────────────────────────────────────────────────
  const proj3m  = mrr * 3
  const proj6m  = mrr * 6
  const proj12m = arr
  const roiNote = grossRevenue > 0 ? `Platform keeps ${pct(netRevenue, grossRevenue)} of all collected revenue` : 'No orders yet'

  // ── CSV export ───────────────────────────────────────────────────────────────
  const exportCSV = (rows, filename) => {
    if (!rows.length) return
    const keys = Object.keys(rows[0])
    const csv  = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = filename
    a.click()
    setExportMsg(`${filename} downloaded`)
    setTimeout(() => setExportMsg(''), 3000)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: sans }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--portal-ink-soft, #9097A8)', marginBottom: '4px' }}>Finance</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '34px', color: 'var(--portal-ink, #0F172A)', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>Financial Intelligence</h2>
          <p style={{ color: 'var(--portal-ink-soft, #9097A8)', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
            Full financial visibility across all users, transactions, liabilities, and projections.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {exportMsg && <span style={{ fontSize: '12px', color: 'var(--portal-moss, #1A6B45)', fontWeight: 600 }}>{exportMsg}</span>}
          <Btn variant="ghost" size="sm" onClick={() => exportCSV(allOrders.map(o => ({ id: o.id, service: o.service, student: o.student, consultant: o.consultant, amount: o.amountValue, platform_fee: mv(o.adminCut), consultant_pay: mv(o.consultantPay), escrow: o.escrow, status: o.status, date: o.createdAt })), 'orders-export.csv')}>
            ↓ Export Orders CSV
          </Btn>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #DDD8CE', gap: 0, overflowX: 'auto' }}>
        {FINANCIAL_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '10px 18px',
            fontSize: '13px', fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--portal-ink, #0F172A)' : 'var(--portal-ink-soft, #9097A8)',
            background: 'none', border: 'none',
            borderBottom: tab === t.id ? '2px solid #0F172A' : '2px solid transparent',
            cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: sans,
            transition: 'color 0.12s',
          }}>
            <span style={{ opacity: tab === t.id ? 1 : 0.6 }}>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────────── */}
      {tab === 'overview' && (() => {
        // Live snapshot from the canonical ledger. All KPIs come from the
        // same source so Overview, Revenue, Liabilities all agree.
        const od = ledgerOverview.data || {}
        // Daily series from the dedicated view
        const daily = ledgerDaily.data?.daily_series || []
        const grossDelta = od.gross_30d_prev_cents
          ? ((od.gross_30d_cents - od.gross_30d_prev_cents) / od.gross_30d_prev_cents) * 100
          : null
        /* daily already set above */
        // Build a small split-line chart from the daily series.
        const splitMax = Math.max(1, ...daily.map(d => Math.max(d.gross, d.net, d.payouts)))
        const linePath = (key, w = 100, h = 80) => daily.length < 2 ? '' :
          daily.map((d, i) => `${i === 0 ? 'M' : 'L'}${(i / (daily.length - 1)) * w},${h - (d[key] / splitMax) * h}`).join(' ')

        return (
          <>
            <DataWarnings items={od.data_warnings} />

            {/* Top row — 4 decision-useful KPIs (cents-based, from ledger) */}
            <Section title="Last 30 Days" sub="Operator KPIs from the canonical ledger — all transactions across student, attorney, consultant, and platform accounts">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <KpiCard label="Gross Revenue (30d)" value={fmtCents(od.gross_30d_cents, true)}
                  sub={`vs ${fmtCents(od.gross_30d_prev_cents, true)} prior 30d`}
                  delta={grossDelta} accent="#1A6B45" icon="💵" />
                <KpiCard label="Net Take (30d)" value={fmtCents(od.net_take_30d_cents, true)}
                  sub={`Payouts ${fmtCents(od.payouts_30d_cents, true)}`}
                  accent="#0F172A" icon="📊" />
                <KpiCard label="Outstanding Escrow" value={fmtCents(od.outstanding_escrow_cents, true)}
                  sub="Held / partial / disputed / frozen" accent="#D97706" icon="🔒" />
                <KpiCard label="Refund Rate (30d)" value={fmtPct(od.refund_rate_30d_pct)}
                  sub={`${fmtCents(od.chargeback_dollar_30d_cents, true)} refunded`}
                  accent={(od.refund_rate_30d_pct || 0) > 10 ? 'var(--portal-brick, #8B1A1A)' : 'var(--portal-moss, #1A6B45)'} icon="↩" />
              </div>
            </Section>

            {/* 30d revenue chart split gross / net / payouts */}
            <Section title="30-Day Revenue Flow" sub="Gross collected · platform net · provider payouts">
              <Card style={{ padding: '20px' }}>
                {ledgerDaily.loading ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Loading…</div>
                ) : daily.length < 2 ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>No revenue in last 30 days</div>
                ) : (
                  <>
                    <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ width: '100%', height: 140 }}>
                      <path d={linePath('gross')}   fill="none" stroke="#1A6B45" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      <path d={linePath('net')}     fill="none" stroke="#0F172A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      <path d={linePath('payouts')} fill="none" stroke="#9A7B3B" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
                    </svg>
                    <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F2EFE9', flexWrap: 'wrap' }}>
                      <Legend color="#1A6B45" label="Gross" value={fmtCents(od.gross_30d_cents, true)} />
                      <Legend color="#0F172A" label="Net (platform)" value={fmtCents(od.net_take_30d_cents, true)} />
                      <Legend color="#9A7B3B" label="Payouts" value={fmtCents(od.payouts_30d_cents, true)} dashed />
                    </div>
                  </>
                )}
              </Card>
            </Section>         
            
            {/* ── Escrow Summary ────────────────────────────────────────────────
                Live escrow breakdown from the canonical ledger: held, released,
                refunded amounts, volume, and a donut-chart distribution. */}
            <Section title="Escrow Summary" sub="All escrow activity in this period — held, released, refunded, and disputed — from the canonical ledger">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KpiCard label="Held (deposits)" value={fmtCents(od.escrow_held_cents, true)}
                  sub={`${od.escrow_held_count || 0} escrow deposits`}
                  accent="#D97706" icon="🔒" />
                <KpiCard label="Released" value={fmtCents(od.escrow_released_cents, true)}
                  sub={`${od.escrow_released_count || 0} releases`}
                  accent="#1A6B45" icon="✅" />
                <KpiCard label="Refunded" value={fmtCents(od.escrow_refunded_cents, true)}
                  sub={`${od.escrow_refunded_count || 0} refunds`}
                  accent={od.escrow_refunded_count > 0 ? 'var(--portal-brick, #8B1A1A)' : 'var(--portal-ink-soft, #9097A8)'} icon="↩" />
                <KpiCard label="Net Outstanding" value={fmtCents(od.escrow_net_outstanding_cents, true)}
                  sub="Current liability (held − released − refunded)"
                  accent="#3D2B6B" icon="⚖️" />
                <KpiCard label="Disputed / Frozen"
                  value={od.escrow_disputed_count || 0}
                  sub={`${fmtCents(od.escrow_disputed_cents, true)} held`}
                  accent={(od.escrow_disputed_count || 0) > 0 ? 'var(--portal-brick, #8B1A1A)' : 'var(--portal-ink-soft, #9097A8)'} icon="⚠️" />
              </div>

              {/* Mini donut chart showing the escrow distribution
                  NOTE: Disputed is NOT included in the donut because it's a
                  subset of Held — adding it would double-count. Disputed
                  appears independently in the KPI card above. */}
              {(od.escrow_held_cents || od.escrow_released_cents || od.escrow_refunded_cents) ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 8 }}>
                  <DonutChart segments={[
                    { label: 'Held',       value: od.escrow_held_cents || 0,       color: '#D97706' },
                    { label: 'Released',   value: od.escrow_released_cents || 0,   color: 'var(--portal-moss, #1A6B45)' },
                    { label: 'Refunded',   value: od.escrow_refunded_cents || 0,   color: 'var(--portal-brick, #8B1A1A)' },
                  ]} size={80} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[
                      { label: 'Held',       cents: od.escrow_held_cents,       color: '#D97706' },
                      { label: 'Released',   cents: od.escrow_released_cents,   color: 'var(--portal-moss, #1A6B45)' },
                      { label: 'Refunded',   cents: od.escrow_refunded_cents,   color: 'var(--portal-brick, #8B1A1A)' },
                    ].map(s => (
                      <Legend key={s.label} color={s.color}
                        label={s.label}
                        value={fmtCents(s.cents, true)} />
                    ))}
                    {(od.escrow_disputed_count || 0) > 0 && (
                      <Legend color="#3D2B6B" label="Disputed" value={`${od.escrow_disputed_count} orders`} />
                    )}
                  </div>
                  <div style={{ flex: 1 }} />
                  {/* Volume trail — show counts as a simple summary */}
                  <div style={{ fontSize: 12, color: 'var(--portal-ink-soft, #9097A8)', lineHeight: 1.6, textAlign: 'right' }}>
                    <div><strong style={{ color: 'var(--portal-ink, #0F172A)' }}>{od.escrow_held_count}</strong> deposits</div>
                    <div><strong style={{ color: 'var(--portal-ink, #0F172A)' }}>{od.escrow_released_count}</strong> releases</div>
                    <div><strong style={{ color: 'var(--portal-ink, #0F172A)' }}>{od.escrow_refunded_count}</strong> refunds</div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '16px 0', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13, textAlign: 'center' }}>
                  No escrow activity in this period
                </div>
              )}
            </Section>

            {/* ── Escrow Aging ────────────────────────────────────────────────
                How long have outstanding escrow deposits been sitting? Bucketed
                by age range so the operator can spot stale funds that need
                follow-up or admin intervention. */}
            <Section title="Escrow Aging" sub="When escrow deposits arrived (not adjusted for releases/refunds) — anything in 60+ days needs follow-up">
              <Card style={{ padding: '20px' }}>
                {(() => {
                  const aging = od.escrow_aging || {}
                  const buckets = [
                    { key: '0_7',     label: '0–7 days',    color: 'var(--portal-moss, #1A6B45)', weight: 1 },
                    { key: '8_30',    label: '8–30 days',   color: '#D97706', weight: 2 },
                    { key: '31_60',   label: '31–60 days',  color: '#CD5C1C', weight: 3 },
                    { key: '60_plus', label: '60+ days',    color: 'var(--portal-brick, #8B1A1A)', weight: 4 },
                  ]
                  const totalCents = buckets.reduce((s, b) => s + (aging[b.key]?.cents || 0), 0)
                  const maxCents = Math.max(1, ...buckets.map(b => aging[b.key]?.cents || 0))

                  if (totalCents === 0) {
                    return <div style={{ padding: '16px 0', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13, textAlign: 'center' }}>No outstanding escrow deposits</div>
                  }

                  return (
                    <>
                      {/* Stacked horizontal bar showing relative proportion */}
                      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 16 }}>
                        {buckets.map(b => {
                          const pct = totalCents > 0 ? ((aging[b.key]?.cents || 0) / totalCents) * 100 : 0
                          if (pct === 0) return null
                          return (
                            <div key={b.key}
                              title={`${b.label}: ${fmtCents(aging[b.key]?.cents, true)} (${pct.toFixed(1)}%)`}
                              style={{ width: `${pct}%`, background: b.color, minWidth: 4, transition: 'width 0.3s' }}
                            />
                          )
                        })}
                      </div>

                      {/* Bucket table */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {buckets.map(b => {
                          const row = aging[b.key] || { count: 0, cents: 0 }
                          const pct = totalCents > 0 ? ((row.cents / totalCents) * 100).toFixed(1) : '0.0'
                          const barW = maxCents > 0 ? (row.cents / maxCents) * 100 : 0
                          return (
                            <div key={b.key}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{
                                    width: 10, height: 10, borderRadius: '50%',
                                    background: b.color, display: 'inline-block', flexShrink: 0,
                                  }} />
                                  <span style={{ fontSize: 13, fontWeight: 700, color: b.weight >= 3 ? b.color : 'var(--portal-ink, #0F172A)' }}>
                                    {b.label}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-ink, #0F172A)', fontVariantNumeric: 'tabular-nums' }}>
                                    {fmtCents(row.cents, true)}
                                  </span>
                                  <span style={{ fontSize: 12, color: 'var(--portal-ink-soft, #9097A8)', minWidth: 40, textAlign: 'right' }}>
                                    {row.count} order{row.count !== 1 ? 's' : ''}
                                  </span>
                                  <span style={{
                                    fontSize: 11, fontWeight: 700, minWidth: 38, textAlign: 'right',
                                    color: Number(pct) > 50 ? b.color : 'var(--portal-ink-soft, #9097A8)',
                                  }}>
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                              {/* Mini inline bar */}
                              <div style={{ height: 4, background: 'var(--portal-rule-soft, #F2EFE9)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ width: `${barW}%`, height: '100%', background: b.color, borderRadius: 2, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Total row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #F2EFE9' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-ink-mid, #5C6070)' }}>Total outstanding</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-ink, #0F172A)' }}>{fmtCents(totalCents, true)}</span>
                      </div>
                    </>
                  )
                })()}
              </Card>
            </Section>

            {/* Top services & providers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Section title="Revenue Breakdown" sub="What moved through the ledger this period">
                <Card style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { label: 'Gross (purchases)', value: fmtCents(od.gross_30d_cents, true), color: 'var(--portal-moss, #1A6B45)' },
                      { label: 'Platform net (fees)', value: fmtCents(od.net_take_30d_cents, true), color: 'var(--portal-ink, #0F172A)' },
                      { label: 'Provider payouts', value: fmtCents(od.payouts_30d_cents, true), color: 'var(--portal-gold, #9A7B3B)' },
                      { label: 'Refunds', value: fmtCents(od.chargeback_dollar_30d_cents, true), color: 'var(--portal-brick, #8B1A1A)' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--portal-surface-2, #FAFAF8)', borderRadius: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--portal-ink-mid, #5C6070)' }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: row.color }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </Section>
              <Section title="All-Time Platform Metrics" sub="Aggregated from the canonical ledger across all user types">
                <Card style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { label: 'Avg Order Value', value: fmt(avgOrderValue) },
                      { label: 'Order Completion Rate', value: `${completionRate.toFixed(1)}%` },
                      { label: 'Cancellation Rate', value: `${cancellationRate.toFixed(1)}%` },
                      { label: 'Platform Take Rate', value: pct(netRevenue, grossRevenue) },
                      { label: 'Escrow Liability Ratio', value: pct(heldEscrow, grossRevenue) },
                      { label: 'MRR (6m trailing)', value: fmt(mrr, true) },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'var(--portal-surface-2, #FAFAF8)', borderRadius: 6 }}>
                        <span style={{ fontSize: 12, color: 'var(--portal-ink-mid, #5C6070)' }}>{row.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-ink, #0F172A)' }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </Section>
            </div>


          </>
        )
      })()}

      {/* ── REVENUE ───────────────────────────────────────────────────────────── */}
      {tab === 'revenue' && (() => {
        // Data from the canonical ledger — includes ALL purchases, fees,
        // payouts, and refunds across student, attorney, and consultant flows.
        const rd = ledgerRevenue.data || {}
        const totals = rd.totals || {}
        const monthlyBkdn = (rd.monthly_breakdown || []).filter(m => m.gross > 0)
        const last6 = monthlyBkdn.slice(-6)
        const last3 = monthlyBkdn.slice(-3)

        const mrr = last6.length > 0
          ? last6.reduce((s, m) => s + m.gross, 0) / last6.length
          : 0
        const grossAllTime = last6.reduce((s, m) => s + m.gross, 0)

        const monthlyBarData = last6.map(m => ({
          label: monthLabel(m.month),
          value: m.gross,
          highlight: m.month === last6[last6.length - 1]?.month,
        }))
        const cumulativeMonths = monthlyBkdn.map((m, i) => ({
          label: monthLabel(m.month),
          value: monthlyBkdn.slice(0, i + 1).reduce((s, x) => s + x.gross, 0),
        }))

        return (
        <>
          <DataWarnings items={rd.data_warnings} />

          <Section title="Last 30 Days — From the Canonical Ledger" sub="Revenue, refunds, and platform net across ALL user types (students, attorneys, consultants)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <KpiCard
                label="Gross Revenue (30d)"
                value={fmtCents(totals.purchase__debit?.total_cents, true)}
                sub={`${totals.purchase__debit?.count || 0} purchase entries`}
                accent="#1A6B45" icon="💵" />
              <KpiCard
                label="Refund / Chargeback (30d)"
                value={fmtCents(totals.refund__debit?.total_cents || totals.refund__credit?.total_cents || 0, true)}
                sub={`${(totals.refund__debit?.count || totals.refund__credit?.count || 0)} refund entries`}
                accent="#8B1A1A" icon="↩" />
              <KpiCard
                label="Net Take (30d)"
                value={fmtCents(totals.fee__credit?.total_cents, true)}
                sub="Platform fees from all orders"
                accent="#0F172A" icon="💰" />
              <KpiCard
                label="Provider Payouts (30d)"
                value={fmtCents(totals.payout__credit?.total_cents, true)}
                sub={`${totals.payout__credit?.count || 0} payouts`}
                accent="#9A7B3B" icon="📤" />
            </div>
          </Section>

          <Section title="Monthly Revenue" sub="Gross revenue per month (last 6, from canonical ledger)">
            <Card style={{ padding: '20px' }}>
              <BarChart data={monthlyBarData} height={140} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F2EFE9' }}>
                {last3.map(m => (
                  <div key={m.month} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--portal-ink-soft, #9097A8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{monthLabel(m.month)}</div>
                    <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--portal-ink, #0F172A)', marginTop: '4px' }}>{fmtCents(m.gross, true)}</div>
                    <div style={{ fontSize: '11px', color: 'var(--portal-moss, #1A6B45)', marginTop: '2px' }}>{fmtCents(m.net, true)} net</div>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Section title="Cumulative Revenue" sub="All-time collected total (from ledger)">
            <Card style={{ padding: '20px' }}>
              <LineChart data={cumulativeMonths} height={120} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F2EFE9' }}>
                <span style={{ fontSize: '13px', color: 'var(--portal-ink-soft, #9097A8)' }}>All-time gross (last 6 month view)</span>
                <span style={{ fontWeight: 700, color: 'var(--portal-ink, #0F172A)' }}>{fmtCents(grossAllTime)}</span>
              </div>
            </Card>
          </Section>

          <Section title="Monthly Breakdown Table" sub="Gross · Net (platform) · Payouts · Order count from the canonical ledger">
            <DataTable
              cols={[
                { key: 'month',   label: 'Month' },
                { key: 'gross',   label: 'Gross Revenue', right: true, bold: true },
                { key: 'net',     label: 'Net (Platform)', right: true },
                { key: 'payouts', label: 'Provider Payouts', right: true },
                { key: 'count',   label: 'Entries', right: true },
              ]}
              rows={monthlyBkdn.slice().reverse().map(m => ({
                month:   monthLabel(m.month),
                gross:   fmtCents(m.gross),
                net:     fmtCents(m.net),
                payouts: fmtCents(m.payouts),
                count:   m.count,
              }))}
              emptyMsg="No revenue data yet (run backfill first)"
            />
          </Section>
        </>
        )
      })()}

      {/* ── USER PROFILES ─────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <>
          <Section title="Student / Client Spending"
            sub={`${userFinancials.students.length} clients with paid orders`}
            action={
              <div style={{ display: 'flex', gap: '6px' }}>
                {['spent', 'orders'].map(s => (
                  <button key={s} onClick={() => setUserSort(s)} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: sans, border: `1px solid ${userSort === s ? 'var(--portal-ink, #0F172A)' : 'var(--portal-rule, #DDD8CE)'}`, background: userSort === s ? 'var(--portal-ink, #0F172A)' : '#fff', color: userSort === s ? '#fff' : 'var(--portal-ink-mid, #5C6070)' }}>
                    {s === 'spent' ? 'By Spend' : 'By Orders'}
                  </button>
                ))}
                <Btn variant="ghost" size="sm" onClick={() => exportCSV(sortedStudents.map(u => ({ name: u.name, orders: u.orders, total_spent: u.spent, avg_order: u.avgOrder, services: u.serviceCount, last_order: u.lastOrder })), 'student-financials.csv')}>↓ CSV</Btn>
              </div>
            }>
            <DataTable
              cols={[
                { key: 'rank',     label: '#', muted: true },
                { key: 'name',     label: 'Client' },
                { key: 'orders',   label: 'Orders', right: true },
                { key: 'spent',    label: 'Total Spent', right: true, bold: true },
                { key: 'avg',      label: 'Avg Order', right: true },
                { key: 'ltv',      label: 'LTV', right: true },
                { key: 'services', label: 'Services', right: true, muted: true },
                { key: 'pct',      label: '% of Revenue', right: true, muted: true },
                { key: 'last',     label: 'Last Order', muted: true },
              ]}
              rows={sortedStudents.map((u, i) => ({
                _profileId: studentNameToId[u.name] || null,
                _clickable: !!studentNameToId[u.name],
                rank:     `#${i + 1}`,
                name:     u.name,
                orders:   u.orders,
                spent:    fmt(u.spent),
                avg:      fmt(u.avgOrder),
                ltv:      fmt(u.ltv),
                services: u.serviceCount,
                pct:      pct(u.spent, grossRevenue),
                last:     u.lastOrder ? new Date(u.lastOrder).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
              }))}
              onRowClick={row => { if (row._profileId) setOpenStudentId(row._profileId) }}
              emptyMsg="No client spending data"
            />
          </Section>

          <Section title="Provider Earnings"
            sub={`${userFinancials.providers.length} providers with completed orders`}
            action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(sortedProviders.map(u => ({ name: u.name, orders: u.orders, total_earned: u.earned, released: u.released, pending: u.pending, last_order: u.lastOrder })), 'provider-earnings.csv')}>↓ CSV</Btn>}>
            <DataTable
              cols={[
                { key: 'rank',     label: '#', muted: true },
                { key: 'name',     label: 'Provider' },
                { key: 'orders',   label: 'Orders', right: true },
                { key: 'earned',   label: 'Total Earned', right: true, bold: true },
                { key: 'released', label: 'Paid Out', right: true },
                { key: 'pending',  label: 'Pending', right: true },
                { key: 'pct',      label: '% of Payouts', right: true, muted: true },
                { key: 'last',     label: 'Last Order', muted: true },
              ]}
              rows={sortedProviders.map((u, i) => ({
                rank:     `#${i + 1}`,
                name:     u.name,
                orders:   u.orders,
                earned:   fmt(u.earned),
                released: fmt(u.released),
                pending:  fmt(u.pending),
                pct:      pct(u.earned, totalPayouts),
                last:     u.lastOrder ? new Date(u.lastOrder).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
              }))}
              emptyMsg="No provider earnings data"
            />
          </Section>

          {/* Order-level ledger */}
          <Section title="Full Transaction Ledger" sub="Every order, gross amount, platform fee, and provider payout"
            action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(allOrders.map(o => ({ id: o.id, service: o.service, student: o.student, consultant: o.consultant || '—', amount: o.amountValue, platform_fee: mv(o.adminCut), provider_pay: mv(o.consultantPay), escrow: o.escrow, status: o.status, date: o.createdAt })), 'full-ledger.csv')}>↓ CSV</Btn>}>
            <DataTable
              cols={[
                { key: 'id',       label: 'Order ID', muted: true },
                { key: 'service',  label: 'Service', wrap: true },
                { key: 'student',  label: 'Client' },
                { key: 'provider', label: 'Provider', muted: true },
                { key: 'amount',   label: 'Gross', right: true, bold: true },
                { key: 'fee',      label: 'Platform Fee', right: true },
                { key: 'pay',      label: 'Provider Pay', right: true },
                { key: 'escrow',   label: 'Escrow' },
                { key: 'status',   label: 'Status' },
                { key: 'date',     label: 'Date', muted: true },
                { key: 'actions',  label: 'Actions' },
              ]}
              rows={[...allOrders].reverse().map(o => {
                const orderType = o.isTemplate ? 'template_order' : 'order'
                const refundLabel = o.service || 'Order'
                return {
                  id:       o.id?.slice(0, 8) + '…',
                  service:  o.service,
                  student:  o.student,
                  provider: o.consultant || '—',
                  amount:   fmt(o.amountValue),
                  fee:      fmt(mv(o.adminCut)),
                  pay:      fmt(mv(o.consultantPay)),
                  escrow:   o.escrow === 'released' ? '✓ Released' : '🔒 Held',
                  status:   o.status,
                  date:     o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
                  actions:  o.status !== 'refunded' ? (
                    <button
                      onClick={() => handleRefund(orderType, o.id, refundLabel)}
                      style={{
                        padding: '3px 8px', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
                        background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '4px',
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Refund
                    </button>
                  ) : (
                    <span style={{ fontSize: '11px', color: 'var(--portal-ink-soft, #9097A8)' }}>Refunded</span>
                  ),
                }
              })}
              emptyMsg="No transactions yet"
            />
          </Section>

          {/* Per-student financial drill-down drawer. Lives at the tail
              of the Users tab block; only mounts when openStudentId is
              truthy. Backdrop click + ESC + the drawer's own X all
              close it via the same callback. */}
          {openStudentId && (
            <AdminStudentFinancialDrawer
              studentId={openStudentId}
              onClose={() => setOpenStudentId(null)}
            />
          )}
        </>
      )}

      {/* ── LIABILITIES ───────────────────────────────────────────────────────── */}
      {tab === 'liabilities' && (() => {
        const ld = ledgerLiab.data || {}
        const aging = ld.escrow_aging || {}
        const agingRows = [
          { bucket: '0-7 days',   key: '0_7' },
          { bucket: '8-30 days',  key: '8_30' },
          { bucket: '31-60 days', key: '31_60' },
          { bucket: '60+ days',   key: '60_plus' },
        ].map(b => ({
          bucket: b.bucket,
          count:  aging[b.key]?.count ?? 0,
          held:   fmtCents(aging[b.key]?.cents ?? 0, true),
        }))
        const heldRows = (ld.held_orders || []).map(o => ({
          order:    o.order_number || (o.id ? `${o.id.slice(0, 8)}…` : '—'),
          status:   `${o.status} / ${o.escrow_status}`,
          client:   o.client_name || '—',
          provider: o.consultant_name || '—',
          amount:   fmtCents(o.amount_cents, true),
          age:      `${o.age_days}d`,
        }))
        return (
          <>
            <DataWarnings items={ld.data_warnings} />
            <Section title="Platform Liability" sub="Sources we owe money to right now — escrow held funds + student wallet balances">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <KpiCard label="Outstanding Escrow" value={fmtCents(ld.escrow_outstanding_cents, true)}
                  sub={`${(ld.held_orders || []).length}+ orders held / disputed / frozen`}
                  accent="#D97706" icon="🔒" />
                <KpiCard label="Wallet Liability"
                  value={ld.wallet_liability_cents === null ? '' : fmtCents(ld.wallet_liability_cents, true)}
                  sub={ld.wallet_liability_cents === null ? <>student_wallets unavailable <ComingSoonBadge /></> : `${ld.wallet_count || 0} wallets`}
                  accent="#3D2B6B" icon="💼" />
                <KpiCard label="Total Liability"
                  value={fmtCents(ld.total_liability_cents, true)}
                  sub="Escrow + wallet exposure"
                  accent="#0F172A" icon="⚖️" />
                <KpiCard label="Cancelled / Refunded (all-time)"
                  value={fmt(cancelledValue, true)} sub={`${cancelled.length} orders`}
                  accent="#8B1A1A" icon="⚠️" />
              </div>
            </Section>

            <Section title="Escrow Aging" sub="How long has held money been sitting? Anything in 60+ days needs follow-up"
              action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(agingRows.map(r => ({ bucket: r.bucket, count: r.count, held: r.held })), 'escrow-aging.csv')}>↓ CSV</Btn>}>
              <DataTable
                cols={[
                  { key: 'bucket', label: 'Age bucket' },
                  { key: 'count',  label: 'Orders', right: true },
                  { key: 'held',   label: 'Cents Held', right: true, bold: true },
                ]}
                rows={agingRows}
                emptyMsg="No held funds"
              />
            </Section>

            <Section title="Held Escrow Detail" sub="Top 25 held orders, oldest first"
              action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(heldRows, 'escrow-held.csv')}>↓ CSV</Btn>}>
              <DataTable
                cols={[
                  { key: 'order',    label: 'Order' },
                  { key: 'status',   label: 'Status' },
                  { key: 'client',   label: 'Client' },
                  { key: 'provider', label: 'Provider' },
                  { key: 'amount',   label: 'Held', right: true, bold: true },
                  { key: 'age',      label: 'Age', right: true, muted: true },
                ]}
                rows={heldRows}
                emptyMsg={ledgerLiab.loading ? 'Loading…' : 'No funds currently in escrow'}
              />
            </Section>

            <Section title="Cancelled & Refunded Orders" sub="Historical cancellations and revenue lost"
              action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(cancelled.map(o => ({ id: o.id, service: o.service, client: o.student, value: o.amountValue, status: o.status, date: o.createdAt })), 'cancelled-orders.csv')}>↓ CSV</Btn>}>
              <DataTable
                cols={[
                  { key: 'service',  label: 'Service' },
                  { key: 'client',   label: 'Client' },
                  { key: 'amount',   label: 'Value Lost', right: true, bold: true },
                  { key: 'status',   label: 'Status' },
                  { key: 'date',     label: 'Date', muted: true },
                ]}
                rows={cancelled.map(o => ({
                  service: o.service,
                  client:  o.student,
                  amount:  fmt(o.amountValue),
                  status:  o.status,
                  date:    o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
                }))}
                emptyMsg="No cancellations"
              />
            </Section>
          </>
        )
      })()}

      {/* ── PROJECTIONS ───────────────────────────────────────────────────────── */}
      {tab === 'projections' && (() => {
        // Live 90d run-rate projection from the canonical ledger.
        // All revenue data across every user type feeds into this projection.
        const pd = ledgerProj.data || {}
        const fwd = pd.forward_3m || []
        const runRate = pd.run_rate_30d_cents || 0

        // SVG confidence band — point line + shaded lo/hi area
        const w = 100, h = 60
        const allVals = fwd.flatMap(p => [p.lo_cents, p.point_cents, p.hi_cents])
        const maxV = Math.max(1, ...allVals)
        const yAt = (v) => h - (Number(v) / maxV) * (h - 6) - 3
        const xAt = (i) => fwd.length > 1 ? (i / (fwd.length - 1)) * w : w / 2
        const pointPath = fwd.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.point_cents)}`).join(' ')
        const bandPath = fwd.length >= 2
          ? `${fwd.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i)},${yAt(p.hi_cents)}`).join(' ')} ${fwd.map((p, i) => `L${xAt(fwd.length - 1 - i)},${yAt(fwd[fwd.length - 1 - i].lo_cents)}`).join(' ')} Z`
          : ''

        return (
        <>
          <DataWarnings items={pd.data_warnings} />

          {/* Live 90d run-rate from canonical ledger — covers ALL user types */}
          <Section title="3-Month Forward Projection (90d run-rate)"
            sub="Point estimate = mean monthly gross from canonical ledger. Band = ±1 standard deviation across the buckets."
            action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(fwd.map(p => ({ month: p.month, point_cents: p.point_cents, lo_cents: p.lo_cents, hi_cents: p.hi_cents })), 'projections-forward.csv')}>↓ CSV</Btn>}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <KpiCard label="Total Run-Rate (30d)" value={fmtCents(runRate, true)}
                sub="From canonical ledger — all user types"
                accent="#0F172A" icon="📊" />
              <KpiCard label="Projected 3-Month" value={fmtCents(runRate * 3, true)}
                sub="Next 3 months at current pace"
                accent="#1A6B45" icon="📈" />
              <KpiCard label="ARR (Annual Run Rate)" value={fmtCents(runRate * 12, true)}
                sub="12 × monthly run-rate"
                accent="#3D2B6B" icon="🎯" />
            </div>
          </Section>

          <Section title="Forward Band — Next 3 Months" sub="Shaded area is the ±1 SD confidence interval. Single line is the point estimate.">
            <Card style={{ padding: 20 }}>
              {ledgerProj.loading ? (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Loading…</div>
              ) : fwd.length < 2 ? (
                <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Not enough run-rate history yet</div>
              ) : (
                <>
                  <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 160 }}>
                    <path d={bandPath} fill="rgba(15,23,42,0.08)" />
                    <path d={pointPath} fill="none" stroke="#0F172A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    {fwd.map((p, i) => (
                      <g key={p.month}>
                        <circle cx={xAt(i)} cy={yAt(p.point_cents)} r="1.6" fill="#0F172A" vectorEffect="non-scaling-stroke">
                          <title>{p.month}: {fmtCents(p.point_cents, true)} ({fmtCents(p.lo_cents, true)}–{fmtCents(p.hi_cents, true)})</title>
                        </circle>
                      </g>
                    ))}
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #F2EFE9' }}>
                    {fwd.map(p => (
                      <div key={p.month} style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--portal-ink-soft, #9097A8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{p.month}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-ink, #0F172A)', marginTop: 2 }}>{fmtCents(p.point_cents, true)}</div>
                        <div style={{ fontSize: 11, color: 'var(--portal-ink-soft, #9097A8)', marginTop: 2 }}>{fmtCents(p.lo_cents, true)} – {fmtCents(p.hi_cents, true)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </Section>

          <Section title="Revenue Projections" sub={`Based on ${last6.length}-month trailing average. ${roiNote}.`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>                <KpiCard label="Run-Rate (30d)" value={fmtCents(pd.run_rate_30d_cents, true)} sub="From canonical ledger" accent="#0F172A" icon="📅" />
              <KpiCard label="Projected 3-Month" value={fmtCents(pd.run_rate_30d_cents * 3, true)} sub="Next 3 months at current pace" accent="#1A6B45" icon="📊" />
              <KpiCard label="Projected 6-Month" value={fmtCents(pd.run_rate_30d_cents * 6, true)} sub="Next 6 months at current pace" accent="#9A7B3B" icon="📈" />
              <KpiCard label="ARR (Annual Run Rate)" value={fmtCents(pd.run_rate_30d_cents * 12, true)} sub="12 × monthly run-rate" accent="#3D2B6B" icon="🎯" />
            </div>
          </Section>

          <Section title="Scenario Modelling" sub="Revenue sensitivity at different growth rates">
            <DataTable
              cols={[
                { key: 'scenario', label: 'Scenario' },
                { key: 'mrrGrowth', label: 'Monthly Growth', right: true },
                { key: 'm3',  label: '3-Month', right: true },
                { key: 'm6',  label: '6-Month', right: true },
                { key: 'm12', label: '12-Month (ARR)', right: true, bold: true },
                { key: 'net', label: 'Platform Net (12m)', right: true },
              ]}
              rows={[-20, -10, 0, 10, 20, 40, 60].map(growthPct => {
                const gFactor = 1 + growthPct / 100
                const m1 = mrr * gFactor
                const m12 = Array.from({ length: 12 }, (_, i) => mrr * Math.pow(gFactor, i + 1)).reduce((s, v) => s + v, 0)
                return {
                  scenario:  growthPct === 0 ? '→ Flat (base case)' : growthPct > 0 ? `▲ +${growthPct}% MoM growth` : `▼ ${growthPct}% MoM decline`,
                  mrrGrowth: `${growthPct >= 0 ? '+' : ''}${growthPct}%`,
                  m3:  fmt(m1 * 3, true),
                  m6:  fmt(m1 * 6, true),
                  m12: fmt(m12, true),
                  net: fmt(m12 * (platformPct / 100), true),
                }
              })}
            />
          </Section>

          <Section title="Break-Even & ROI" sub="Platform economics at current fee structure">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Card style={{ padding: '20px' }}>
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: 'var(--portal-ink, #0F172A)', marginBottom: '14px' }}>Platform Economics</div>
                {[
                  { label: 'Gross Revenue Collected', value: fmt(grossRevenue) },
                  { label: `Platform Fee (${platformPct}%)`, value: fmt(netRevenue) },
                  { label: `Provider Payouts (${consultantPct}%)`, value: fmt(totalPayouts) },
                  { label: 'Effective Take Rate', value: pct(netRevenue, grossRevenue) },
                  { label: 'Revenue Per Order', value: fmt(avgOrderValue) },
                  { label: 'Net Revenue Per Order', value: fmt(activeOrders.length ? netRevenue / activeOrders.length : 0) },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: '13px', color: 'var(--portal-ink-mid, #5C6070)' }}>{row.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--portal-ink, #0F172A)' }}>{row.value}</span>
                  </div>
                ))}
              </Card>
              <Card style={{ padding: '20px' }}>
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: 'var(--portal-ink, #0F172A)', marginBottom: '14px' }}>Provider Economics</div>
                {sortedProviders.slice(0, 6).map(p => (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: '13px', color: 'var(--portal-ink-mid, #5C6070)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--portal-moss, #1A6B45)' }}>{fmt(p.earned, true)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--portal-ink-soft, #9097A8)' }}>{fmt(p.pending, true)} pending</div>
                    </div>
                  </div>
                ))}
                {sortedProviders.length === 0 && <p style={{ color: 'var(--portal-ink-soft, #9097A8)', fontSize: '13px' }}>No provider data yet</p>}
              </Card>
            </div>
          </Section>
        </>
        )
      })()}

      {/* ── ESCROW ───────────────────────────────────────────────────────────── */}
      {tab === 'escrow' && <AdminEscrow />}

      {/* ── PAYOUTS ──────────────────────────────────────────────────────────── */}
      {tab === 'payouts' && <AdminPayouts formatPrimary={formatPrimary} />}

      {/* ── WALLETS ───────────────────────────────────────────────────────────── */}
      {tab === 'wallets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <AdminWallets />

          {/* Wallet transactions history */}
          <Section title="Wallet Transaction History" sub="All wallet topups, debits, refunds, and adjustments">
            <DataTable
              cols={[
                { key: 'date',        label: 'Date', muted: true },
                { key: 'profile_id',  label: 'Profile ID', muted: true },
                { key: 'type',        label: 'Type' },
                { key: 'amount',      label: 'Amount', right: true, bold: true },
                { key: 'balance',     label: 'Balance After', right: true },
                { key: 'description', label: 'Description', wrap: true },
                { key: 'reference',   label: 'Reference', muted: true },
              ]}
              rows={walletTransactions.slice(0, 100).map(w => ({
                date:        w.created_at ? new Date(w.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
                profile_id:  w.profile_id ? w.profile_id.slice(0, 8) + '…' : '—',
                type:        w.type || '—',
                amount:      fmtCents(w.signed_cents),
                balance:     fmtCents(w.balance_after_cents),
                description: w.description || '—',
                reference:   w.reference ? w.reference.slice(0, 16) : '—',
              }))}
              emptyMsg="No wallet transactions yet"
            />
          </Section>
        </div>
      )}

      {/* ── LOYALTY ───────────────────────────────────────────────────────────── */}
      {tab === 'loyalty' && <AdminWalletLoyalty />}

      {/* ── LEDGER DASHBOARD ────────────────────────────────────────────────────
          Dedicated daily-series dashboard with date range controls, multi-series
          bar / line / area charts, refund-rate analysis, and a raw-data table.
          All data comes from the canonical ledger's daily_series view. */}
      {tab === 'ledger-dash' && (() => {
        const dd = ledgerDashboard.data?.daily_series || []
        const loading = ledgerDashboard.loading

        // ── Derived totals ─────────────────────────────────────────────────────
        const totalGross   = dd.reduce((s, d) => s + d.gross, 0)
        const totalNet     = dd.reduce((s, d) => s + d.net, 0)
        const totalPayouts = dd.reduce((s, d) => s + d.payouts, 0)
        const totalRefunds = dd.reduce((s, d) => s + d.refunds, 0)
        const activeDays   = dd.filter(d => d.gross > 0).length
        const avgDailyGross = activeDays > 0 ? totalGross / activeDays : 0

        // ── Bar chart (gross net overlay) ─────────────────────────────────────
        const barData = dd.map(d => ({
          label: d.date.slice(5),  // "MM-DD"
          value: d.gross,
          highlight: d.date === dd[dd.length - 1]?.date,
        }))

        // ── Cumulative line ───────────────────────────────────────────────────
        let cum = 0
        const cumData = dd.map(d => {
          cum += d.gross
          return { label: d.date.slice(5), value: cum }
        })

        // ── Refund-rate by day ───────────────────────────────────────────────
        const refundRateDays = dd.map(d => {
          const total = d.gross + d.net + d.refunds
          return {
            date:  d.date.slice(5),
            rate:  total > 0 ? (d.refunds / total) * 100 : 0,
            cents: d.refunds,
          }
        })

        // ── Split line: net vs payouts vs refunds (on a 0-100% scale) ───────
        const splitMax = Math.max(1, ...dd.map(d => Math.max(d.net, d.payouts, d.refunds)))
        const mkPath = (key, w = 100, h = 80) => dd.length < 2 ? '' :
          dd.map((d, i) => `${i === 0 ? 'M' : 'L'}${(i / (dd.length - 1)) * w},${h - (Math.max(d[key], 0) / splitMax) * h}`).join(' ')

        return (
          <>
            {/* ── Date range picker ────────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 4 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--portal-ink-soft, #9097A8)', display: 'block', marginBottom: 4 }}>From</label>
                <input type="date" value={ldFrom} onChange={e => setLdFrom(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #DDD8CE', borderRadius: 5, fontSize: 13, fontFamily: sans }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--portal-ink-soft, #9097A8)', display: 'block', marginBottom: 4 }}>To</label>
                <input type="date" value={ldTo} onChange={e => setLdTo(e.target.value)}
                  style={{ padding: '6px 10px', border: '1px solid #DDD8CE', borderRadius: 5, fontSize: 13, fontFamily: sans }} />
              </div>
              <Btn variant="ghost" size="sm" onClick={() => {
                const d = new Date(); d.setDate(1)
                setLdFrom(d.toISOString().slice(0, 10))
                setLdTo(new Date().toISOString().slice(0, 10))
              }}>
                ↺ This month
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => {
                const to = new Date()
                const from = new Date(to.getTime() - 30 * 86400_000)
                setLdFrom(from.toISOString().slice(0, 10))
                setLdTo(to.toISOString().slice(0, 10))
              }}>
                Last 30d
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => {
                const to = new Date()
                const from = new Date(to.getTime() - 90 * 86400_000)
                setLdFrom(from.toISOString().slice(0, 10))
                setLdTo(to.toISOString().slice(0, 10))
              }}>
                Last 90d
              </Btn>
              <div style={{ flex: 1 }} />
              <Btn variant="ghost" size="sm" onClick={() => exportCSV(dd.map(d => ({ date: d.date, gross: d.gross, net: d.net, payouts: d.payouts, refunds: d.refunds })), 'daily-series.csv')}>
                ↓ CSV
              </Btn>
            </div>

            {/* ── Entry-type filter chips ─────────────────────────────
                Grouped by category. Clicking a chip toggles that entry type
                on/off. When none are selected, all types are returned. */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft, #9097A8)' }}>Type filter</span>
                {ldTypes.length > 0 && (
                  <button onClick={() => setLdTypes([])}
                    style={{ padding: '1px 8px', borderRadius: 4, border: '1px solid #DDD8CE', background: 'var(--portal-bg, #F7F5F0)', fontSize: 10, fontWeight: 600, color: 'var(--portal-ink-mid, #5C6070)', cursor: 'pointer', fontFamily: sans }}>
                    Clear all
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {ENTRY_TYPE_GROUPS.map(group => (
                  <div key={group.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--portal-ink-soft, #9097A8)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 2 }}>{group.label}</span>
                    {group.types.map(t => {
                      const active = ldTypes.length === 0 || ldTypes.includes(t)
                      return (
                        <button key={t} onClick={() => toggleLdType(t)}
                          title={`${active ? 'Remove' : 'Add'} ${t} filter`}
                          style={{
                            padding: '3px 10px', borderRadius: 14, fontSize: 11, fontWeight: 600,
                            fontFamily: sans, cursor: 'pointer', whiteSpace: 'nowrap',
                            border: active ? '1px solid rgba(15,23,42,0.25)' : '1px dashed #DDD8CE',
                            background: active ? 'var(--portal-ink, #0F172A)' : '#fff',
                            color: active ? '#fff' : 'var(--portal-ink-soft, #9097A8)',
                            opacity: ldTypes.length === 0 ? 0.85 : 1,
                            transition: 'all 0.12s',
                          }}>
                          {t.replace(/_/g, ' ')}
                        </button>
                      )
                    })}
                    {group !== ENTRY_TYPE_GROUPS[ENTRY_TYPE_GROUPS.length - 1] && (
                      <span style={{ width: 1, height: 20, background: 'var(--portal-rule, #DDD8CE)', margin: '0 6px', flexShrink: 0 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Period Comparison ────────────────────────────────────
                This period vs previous same-length period side by side,
                with change indicators (▲ green / ▼ red). */}
            <Section title="Period Comparison"
              sub={`${dd.length}-day period vs prior ${ldPrevRange?.days || 'same-length'} period — same type filter applied`}>
              {(() => {
                const prev = ledgerDashboardPrev.data?.daily_series || []
                const prevLoading = ledgerDashboardPrev.loading
                if (prevLoading && prev.length === 0) {
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                      {['Gross', 'Net', 'Payouts', 'Refunds'].map(l => (
                        <div key={l} style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: 8, padding: '16px 18px' }}>
                          <div style={{ height: 11, width: '40%', background: 'var(--portal-rule-soft, #F2EFE9)', borderRadius: 3, marginBottom: 8 }} />
                          <div style={{ height: 22, width: '55%', background: 'var(--portal-rule-soft, #F2EFE9)', borderRadius: 3, marginBottom: 6 }} />
                          <div style={{ height: 10, width: '35%', background: 'var(--portal-rule-soft, #F2EFE9)', borderRadius: 3 }} />
                        </div>
                      ))}
                    </div>
                  )
                }
                const prevGross = prev.reduce((s, d) => s + d.gross, 0)
                const prevNet = prev.reduce((s, d) => s + d.net, 0)
                const prevPayouts = prev.reduce((s, d) => s + d.payouts, 0)
                const prevRefunds = prev.reduce((s, d) => s + d.refunds, 0)
                const prevActiveDays = prev.filter(d => d.gross > 0).length

                const deltaPct = (cur, prevTotal) => prevTotal === 0 ? null : ((cur - prevTotal) / prevTotal) * 100

                const metrics = [
                  { label: 'Gross Revenue', cur: totalGross, prev: prevGross, icon: '💵', accent: 'var(--portal-moss, #1A6B45)' },
                  { label: 'Platform Net', cur: totalNet, prev: prevNet, icon: '💰', accent: 'var(--portal-ink, #0F172A)' },
                  { label: 'Provider Payouts', cur: totalPayouts, prev: prevPayouts, icon: '📤', accent: 'var(--portal-gold, #9A7B3B)' },
                  { label: 'Total Refunds', cur: totalRefunds, prev: prevRefunds, icon: '↩', accent: 'var(--portal-brick, #8B1A1A)' },
                ]

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Side-by-side metric rows */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 60px', gap: 8, alignItems: 'center', padding: '0 4px', marginBottom: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft, #9097A8)' }}>Metric</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink, #0F172A)', textAlign: 'right' }}>This period</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft, #9097A8)', textAlign: 'right' }}>Previous</span>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--portal-ink-soft, #9097A8)', textAlign: 'right' }}>Change</span>
                    </div>
                    {metrics.map(m => {
                      const delta = deltaPct(m.cur, m.prev)
                      const dir = delta === null ? '' : delta >= 0 ? '▲' : '▼'
                      const isGood = m.label === 'Total Refunds' ? (delta !== null && delta <= 0) : (delta !== null && delta >= 0)
                      const deltaColor = delta === null ? 'var(--portal-ink-soft, #9097A8)' : isGood ? 'var(--portal-moss, #1A6B45)' : 'var(--portal-brick, #8B1A1A)'
                      return (
                        <div key={m.label}
                          style={{
                            display: 'grid', gridTemplateColumns: '140px 1fr 1fr 60px', gap: 8,
                            alignItems: 'center', padding: '10px 12px',
                            background: 'var(--portal-surface-2, #FAFAF8)', borderRadius: 6,
                            borderLeft: `3px solid ${m.accent}`,
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 14 }}>{m.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-ink, #0F172A)' }}>{m.label}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-ink, #0F172A)', fontVariantNumeric: 'tabular-nums' }}>{fmtCents(m.cur, true)}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-ink-mid, #5C6070)', fontVariantNumeric: 'tabular-nums' }}>{fmtCents(m.prev, true)}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            {delta !== null ? (
                              <span style={{ fontSize: 13, fontWeight: 700, color: deltaColor, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                {dir} {Math.abs(delta).toFixed(1)}%
                              </span>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--portal-ink-soft, #9097A8)' }}>—</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {/* Activity summary row */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, marginTop: 4, padding: '6px 12px' }}>
                      <span style={{ fontSize: 11, color: 'var(--portal-ink-soft, #9097A8)' }}>
                        Active days: <strong style={{ color: 'var(--portal-ink, #0F172A)' }}>{activeDays}</strong>
                        <span style={{ color: 'var(--portal-ink-soft, #9097A8)', margin: '0 4px' }}>vs</span>
                        <strong style={{ color: prevActiveDays >= activeDays ? 'var(--portal-moss, #1A6B45)' : 'var(--portal-brick, #8B1A1A)' }}>{prevActiveDays}</strong>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--portal-ink-soft, #9097A8)' }}>
                        Daily avg (active): <strong style={{ color: 'var(--portal-ink, #0F172A)' }}>{fmtCents(avgDailyGross, true)}</strong>
                        <span style={{ color: 'var(--portal-ink-soft, #9097A8)', margin: '0 4px' }}>vs</span>
                        <strong style={{ color: prevActiveDays >= activeDays ? 'var(--portal-moss, #1A6B45)' : 'var(--portal-brick, #8B1A1A)' }}>{fmtCents(prevActiveDays > 0 ? (prevGross / prevActiveDays) : 0, true)}</strong>
                      </span>
                    </div>
                  </div>
                )
              })()}
            </Section>

            {/* ── Period KPIs ────────────────────────────────────────── */}
            <Section title="Period Overview" sub={`${dd.length} days · ${activeDays} with activity · avg $${(avgDailyGross / 100).toFixed(0)}/day`}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <KpiCard label="Gross Revenue" value={fmtCents(totalGross, true)}
                  sub={`${activeDays} active days`} accent="#1A6B45" icon="💵" />
                <KpiCard label="Platform Net" value={fmtCents(totalNet, true)}
                  sub={totalGross > 0 ? `${((totalNet / totalGross) * 100).toFixed(1)}% take rate` : '—'}
                  accent="#0F172A" icon="💰" />
                <KpiCard label="Provider Payouts" value={fmtCents(totalPayouts, true)}
                  sub={`${dd.filter(d => d.payouts > 0).length} payout days`}
                  accent="#9A7B3B" icon="📤" />
                <KpiCard label="Total Refunds" value={fmtCents(totalRefunds, true)}
                  sub={totalGross > 0 ? `${((totalRefunds / totalGross) * 100).toFixed(1)}% of gross` : '—'}
                  accent={totalRefunds > 0 ? 'var(--portal-brick, #8B1A1A)' : 'var(--portal-ink-soft, #9097A8)'} icon="↩" />
              </div>
            </Section>

            {/* ── Two charts side by side: daily bars + cumulative line ──── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Section title="Daily Gross Revenue" sub="Bar chart of gross cents per day">
                <Card style={{ padding: 20 }}>
                  {loading ? (
                    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Loading…</div>
                  ) : barData.length === 0 ? (
                    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>No data</div>
                  ) : (
                    <BarChart data={barData} height={140} barColor="#1A6B45" />
                  )}
                </Card>
              </Section>
              <Section title="Cumulative Gross" sub="Running total across the period">
                <Card style={{ padding: 20 }}>
                  {loading ? (
                    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Loading…</div>
                  ) : cumData.length < 2 ? (
                    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Not enough data</div>
                  ) : (
                    <LineChart data={cumData} height={140} color="#0F172A" fillColor="rgba(15,23,42,0.06)" />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: 12, color: 'var(--portal-ink-soft, #9097A8)' }}>Total gross over period</span>
                    <span style={{ fontWeight: 700, color: 'var(--portal-ink, #0F172A)' }}>{fmtCents(totalGross, true)}</span>
                  </div>
                </Card>
              </Section>
            </div>

            {/* ── Split-line chart (net / payouts / refunds overlay) ────── */}
            <Section title="Revenue Composition" sub="Daily net (platform) · payouts (provider) · refunds — overlay">
              <Card style={{ padding: 20 }}>
                {loading ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Loading…</div>
                ) : dd.length < 2 ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Not enough daily data</div>
                ) : (
                  <>
                    <svg viewBox="0 0 100 80" preserveAspectRatio="none" style={{ width: '100%', height: 140 }}>
                      <path d={mkPath('net')}     fill="none" stroke="#0F172A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                      <path d={mkPath('payouts')} fill="none" stroke="#9A7B3B" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="2 2" />
                      <path d={mkPath('refunds')} fill="none" stroke="#8B1A1A" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeDasharray="4 2" />
                    </svg>
                    <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F2EFE9', flexWrap: 'wrap' }}>
                      <Legend color="#0F172A" label="Net (platform)" value={fmtCents(totalNet, true)} />
                      <Legend color="#9A7B3B" label="Payouts" value={fmtCents(totalPayouts, true)} dashed />
                      <Legend color="#8B1A1A" label="Refunds" value={fmtCents(totalRefunds, true)} dashed />
                    </div>
                  </>
                )}
              </Card>
            </Section>

            {/* ── Refund rate chart ─────────────────────────────────────── */}
            <Section title="Daily Refund Rate" sub="Refund cents as % of daily volume — spikes reveal problem orders">
              <Card style={{ padding: 20 }}>
                {loading ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>Loading…</div>
                ) : refundRateDays.length === 0 ? (
                  <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink-soft, #9097A8)', fontSize: 13 }}>No data</div>
                ) : (
                  <>
                    <BarChart data={refundRateDays.map(d => ({ label: d.date, value: d.rate, highlight: d.rate > 20 }))}
                      height={100} barColor="#8B1A1A" />
                    <div style={{ display: 'flex', gap: 18, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F2EFE9', flexWrap: 'wrap' }}>
                      <Legend color="#8B1A1A" label="Avg daily refund rate"
                        value={`${(refundRateDays.filter(r => r.rate > 0).reduce((s, r) => s + r.rate, 0) / Math.max(1, refundRateDays.filter(r => r.rate > 0).length)).toFixed(1)}%`} />
                      <Legend color="#0F172A" label="Days with refunds"
                        value={`${refundRateDays.filter(r => r.cents > 0).length} / ${refundRateDays.length}`} />
                    </div>
                  </>
                )}
              </Card>
            </Section>

            {/* ── Daily data table ──────────────────────────────────────── */}
            <Section title="Daily Series Table" sub="Every day in the selected range with gross · net · payouts · refunds">
              <DataTable
                cols={[
                  { key: 'date',    label: 'Date' },
                  { key: 'gross',   label: 'Gross', right: true, bold: true },
                  { key: 'net',     label: 'Net (Platform)', right: true },
                  { key: 'payouts', label: 'Provider Payouts', right: true },
                  { key: 'refunds', label: 'Refunds', right: true },
                  { key: 'take',    label: 'Take Rate', right: true, muted: true },
                ]}
                rows={dd.slice().reverse().map(d => ({
                  date:    d.date,
                  gross:   fmtCents(d.gross),
                  net:     fmtCents(d.net),
                  payouts: fmtCents(d.payouts),
                  refunds: fmtCents(d.refunds),
                  take:    d.gross > 0 ? `${((d.net / d.gross) * 100).toFixed(1)}%` : '—',
                }))}
                emptyMsg={loading ? 'Loading…' : 'No daily data for this range'}
              />
            </Section>
          </>
        )
      })()}

      {/* ── RISK ──────────────────────────────────────────────────────────────── */}
      {tab === 'risk' && (() => {
        // Live risk feed from the canonical ledger. All refund data across
        // student, attorney, and consultant flows is aggregated here.
        const rd = ledgerRisk.data || {}
        const trend = rd.refund_rate_trend || []

        return (
        <>
          <DataWarnings items={rd.data_warnings} />

          {/* Live operator KPIs */}
          <Section title="Live Risk Snapshot" sub="Disputed escrow + refund rate trend from order data">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <KpiCard label="Disputed / Frozen Orders" value={rd.disputed_count ?? 0}
                sub={`${fmtCents(rd.disputed_dollar_cents, true)} held`}
                accent={(rd.disputed_count || 0) > 0 ? 'var(--portal-brick, #8B1A1A)' : 'var(--portal-moss, #1A6B45)'} icon="⚠️" />
              <KpiCard label="Refund Rate (current month)"
                value={fmtPct(trend.length ? trend[trend.length - 1].refund_rate_pct : 0)}
                sub={trend.length ? `${trend[trend.length - 1].refunded} of ${trend[trend.length - 1].total_orders} orders` : 'no data'}
                accent={(trend.length && trend[trend.length - 1].refund_rate_pct > 10) ? 'var(--portal-brick, #8B1A1A)' : '#D97706'} icon="↩" />
              <KpiCard label="Open Payment Incidents" value={incidents.length}
                sub={incidents.length > 0 ? 'Money moved, follow-up failed — action needed' : 'All clear'}
                accent={incidents.length > 0 ? 'var(--portal-brick, #8B1A1A)' : 'var(--portal-moss, #1A6B45)'} icon="🚨" />
            </div>
          </Section>

          {/* Open payment incidents — the human-action queue. */}
          <Section title="Open Payment Incidents"
            sub="Recorded when a charge/debit succeeded but the follow-up write failed. Reconcile the money movement, then mark resolved."
            action={<Btn variant="ghost" size="sm" onClick={loadIncidents}>↻ Refresh</Btn>}>
            <DataTable
              cols={[
                { key: 'when',   label: 'When' },
                { key: 'kind',   label: 'Kind' },
                { key: 'who',    label: 'User' },
                { key: 'amount', label: 'Amount', right: true, bold: true },
                { key: 'txn',    label: 'Transaction' },
                { key: 'action', label: '' },
              ]}
              rows={incidents.map((i: any) => ({
                when:   new Date(i.created_at).toLocaleString(),
                kind:   String(i.kind || '').replace(/_/g, ' '),
                who:    i.profile_name || i.profile_email || i.profile_id || '—',
                amount: fmtCents(i.amount_cents),
                txn:    i.transaction_id || '—',
                action: <Btn variant="ghost" size="sm" onClick={() => resolveIncident(i.id)}>Resolve</Btn>,
              }))}
              emptyMsg={incidentsLoading ? 'Loading…' : 'No open incidents — payments and follow-up writes are healthy.'}
            />
          </Section>

          {/* Refund-rate trend over last 6 months */}
          <Section title="Refund Rate Trend (6 months)" sub="Refunded + cancelled orders divided by total orders per month"
            action={<Btn variant="ghost" size="sm" onClick={() => exportCSV(trend.map(t => ({ month: t.month, refund_rate_pct: t.refund_rate_pct.toFixed(2), total_orders: t.total_orders, refunded: t.refunded })), 'refund-rate-trend.csv')}>↓ CSV</Btn>}>
            <DataTable
              cols={[
                { key: 'month',  label: 'Month' },
                { key: 'total',  label: 'Orders', right: true },
                { key: 'refund', label: 'Refunded', right: true },
                { key: 'pct',    label: 'Refund Rate', right: true, bold: true },
              ]}
              rows={trend.map(t => ({
                month:  t.month,
                total:  t.total_orders,
                refund: t.refunded,
                pct:    fmtPct(t.refund_rate_pct),
              }))}                emptyMsg={ledgerRisk.loading ? 'Loading…' : 'No order history'}
            />
          </Section>

          {/* Note: Provider-level refund rate, auto-release overdue, and
              disputed order detail are now in the dedicated Escrow tab and
              the Payouts > Refunds tab, which query their own data sources.
              The Risk tab focuses on ledger-derived aggregate KPIs. */}

          <Section title="Risk Dashboard" sub="Financial exposure, concentration risk, and early-warning indicators">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              <KpiCard label="Revenue Concentration" value={`${concentrationRisk.toFixed(1)}%`}
                sub="Top 3 clients of gross revenue"
                accent={concentrationRisk > 60 ? 'var(--portal-brick, #8B1A1A)' : concentrationRisk > 40 ? '#D97706' : 'var(--portal-moss, #1A6B45)'}
                icon="⚡"
                chart={<RiskBadge level={concentrationRisk > 60 ? 'high' : concentrationRisk > 40 ? 'medium' : 'low'} />} />
              <KpiCard label="Provider Concentration" value={`${providerConcentration.toFixed(1)}%`}
                sub="Top provider of all payouts"
                accent={providerConcentration > 70 ? 'var(--portal-brick, #8B1A1A)' : providerConcentration > 50 ? '#D97706' : 'var(--portal-moss, #1A6B45)'}
                icon="👤"
                chart={<RiskBadge level={providerConcentration > 70 ? 'high' : providerConcentration > 50 ? 'medium' : 'low'} />} />
              <KpiCard label="Escrow Liability" value={fmt(heldEscrow, true)}
                sub={`${pct(heldEscrow, grossRevenue)} of gross revenue`}
                accent="#D97706" icon="🔒" />
              <KpiCard label="Churn-Risk Clients" value={churnRisk.length}
                sub="No order in 60+ days"
                accent={churnRisk.length > 5 ? 'var(--portal-brick, #8B1A1A)' : churnRisk.length > 2 ? '#D97706' : 'var(--portal-moss, #1A6B45)'}
                icon="📉" />
            </div>
          </Section>

          <Section title="Revenue Concentration Analysis" sub="How dependent is platform revenue on individual clients?">
            <DataTable
              cols={[
                { key: 'rank',   label: '#', muted: true },
                { key: 'client', label: 'Client' },
                { key: 'spent',  label: 'Total Spent', right: true, bold: true },
                { key: 'pct',    label: '% of Revenue', right: true },
                { key: 'orders', label: 'Orders', right: true },
                { key: 'risk',   label: 'Concentration Risk' },
              ]}
              rows={sortedStudents.slice(0, 10).map((u, i) => ({
                rank:   `#${i + 1}`,
                client: u.name,
                spent:  fmt(u.spent),
                pct:    pct(u.spent, grossRevenue),
                orders: u.orders,
                risk:   <RiskBadge level={u.spent / grossRevenue > 0.3 ? 'high' : u.spent / grossRevenue > 0.15 ? 'medium' : 'low'} />,
              }))}
              emptyMsg="No spending data"
            />
          </Section>

          <Section title="Churn Risk — Inactive Clients" sub="Clients with no activity in 60+ days">
            <DataTable
              cols={[
                { key: 'client',    label: 'Client' },
                { key: 'spent',     label: 'Lifetime Spend', right: true, bold: true },
                { key: 'orders',    label: 'Total Orders', right: true },
                { key: 'lastOrder', label: 'Last Order', muted: true },
                { key: 'daysSince', label: 'Days Inactive', right: true },
                { key: 'risk',      label: 'Risk Level' },
              ]}
              rows={churnRisk.sort((a, b) => b.spent - a.spent).map(u => {
                const days = u.lastOrder ? Math.floor((now - new Date(u.lastOrder).getTime()) / (1000 * 60 * 60 * 24)) : 9999
                return {
                  client:    u.name,
                  spent:     fmt(u.spent),
                  orders:    u.orders,
                  lastOrder: u.lastOrder ? new Date(u.lastOrder).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : 'Never',
                  daysSince: days === 9999 ? '—' : `${days}d`,
                  risk:      <RiskBadge level={days > 120 || !u.lastOrder ? 'high' : days > 60 ? 'medium' : 'low'} />,
                }
              })}
              emptyMsg="All clients are active — no churn risk detected"
            />
          </Section>

          <Section title="Provider Payout Risk" sub="Providers with high pending escrow exposure">
            <DataTable
              cols={[
                { key: 'provider', label: 'Provider' },
                { key: 'earned',   label: 'Total Earned', right: true, bold: true },
                { key: 'released', label: 'Paid Out', right: true },
                { key: 'pending',  label: 'Pending', right: true },
                { key: 'pctPending', label: '% Pending', right: true, muted: true },
                { key: 'risk',     label: 'Payout Risk' },
              ]}
              rows={sortedProviders.map(p => {
                const pctPend = p.earned > 0 ? (p.pending / p.earned) * 100 : 0
                return {
                  provider:   p.name,
                  earned:     fmt(p.earned),
                  released:   fmt(p.released),
                  pending:    fmt(p.pending),
                  pctPending: `${pctPend.toFixed(0)}%`,
                  risk:       <RiskBadge level={pctPend > 70 ? 'high' : pctPend > 40 ? 'medium' : 'low'} />,
                }
              })}
              emptyMsg="No provider payout data"
            />
          </Section>
        </>
        )
      })()}
    </div>
  )
}
