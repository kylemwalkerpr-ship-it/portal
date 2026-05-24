'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'

// ─── constants ────────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans

const TABS = [
  { id: 'overview',     label: 'Overview',       icon: '📊' },
  { id: 'revenue',      label: 'Revenue',         icon: '💰' },
  { id: 'users',        label: 'User Profiles',   icon: '👤' },
  { id: 'liabilities',  label: 'Liabilities',     icon: '⚖️' },
  { id: 'projections',  label: 'Projections',     icon: '📈' },
  { id: 'risk',         label: 'Risk',            icon: '🔴' },
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
const monthKey = dateStr => { const d = new Date(dateStr); return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = key => { if (!key) return ''; const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' }) }

// ─── SVG chart primitives ─────────────────────────────────────────────────────
function BarChart({ data, height = 120, barColor = '#0F172A', labelColor = '#9097A8' }) {
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

function LineChart({ data, height = 100, color = '#0F172A', fillColor = 'rgba(27,45,79,0.08)' }) {
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

function DonutChart({ segments, size = 80 }) {
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

function MiniSparkline({ values, color = '#0F172A' }) {
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
function KpiCard({ label, value, sub, delta, icon, accent = '#0F172A', onClick, chart }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{ background: '#fff', border: `1px solid ${hov && onClick ? '#0F172A' : '#DDD8CE'}`, borderTop: `3px solid ${accent}`, borderRadius: '8px', padding: '18px 20px', cursor: onClick ? 'pointer' : 'default', boxShadow: hov && onClick ? '0 4px 12px rgba(27,45,79,0.12)' : '0 1px 3px rgba(27,45,79,0.06)', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9097A8' }}>{label}</span>
        <span style={{ fontSize: '16px', opacity: 0.5 }}>{icon}</span>
      </div>
      <div style={{ fontWeight: 800, fontSize: '26px', color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#9097A8', lineHeight: 1.4 }}>{sub}</div>}
      {delta !== undefined && (
        <div style={{ fontSize: '12px', fontWeight: 700, color: delta >= 0 ? '#1A6B45' : '#8B1A1A' }}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs last period
        </div>
      )}
      {chart && <div style={{ marginTop: '4px' }}>{chart}</div>}
    </div>
  )
}

// ─── Section shell ─────────────────────────────────────────────────────────────
function Section({ title, sub, action, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '20px', color: '#0F172A', margin: 0, letterSpacing: '-0.01em' }}>{title}</h3>
          {sub && <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#9097A8', lineHeight: 1.4 }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Table shell ──────────────────────────────────────────────────────────────
function DataTable({ cols, rows, emptyMsg = 'No data' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${cols.length * 120}px` }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '11px 14px', textAlign: c.right ? 'right' : 'left', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)', background: '#0F172A', whiteSpace: 'nowrap', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '32px', textAlign: 'center', color: '#9097A8', fontSize: '14px' }}>{emptyMsg}</td></tr>
            ) : rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAF8', borderBottom: '1px solid #F2EFE9' }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: '11px 14px', fontSize: '13px', textAlign: c.right ? 'right' : 'left', color: c.muted ? '#9097A8' : '#1A1F2E', fontWeight: c.bold ? 700 : 400, whiteSpace: c.wrap ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Risk badge ───────────────────────────────────────────────────────────────
function RiskBadge({ level }) {
  const map = { low: { bg: '#EAF5EE', color: '#1A6B45', label: 'Low' }, medium: { bg: '#FEF5E4', color: '#8B5E0A', label: 'Medium' }, high: { bg: '#FAEAEA', color: '#8B1A1A', label: 'High' } }
  const cfg = map[level] || map.low
  return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function AdminFinancials({ orders = [], users = [], settings = {}, setPage }) {
  const [tab, setTab] = React.useState('overview')
  const [userSort, setUserSort] = React.useState('spent')
  const [exportMsg, setExportMsg] = React.useState('')

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const consultantPct = Number(settings.consultant_fee_percent || 70)
  const platformPct   = 100 - consultantPct

  const allOrders     = orders
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
    const studentMap = {}
    const providerMap = {}

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
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9097A8', marginBottom: '4px' }}>Finance</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '34px', color: '#0F172A', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>Financial Intelligence</h2>
          <p style={{ color: '#9097A8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
            Full financial visibility across all users, transactions, liabilities, and projections.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {exportMsg && <span style={{ fontSize: '12px', color: '#1A6B45', fontWeight: 600 }}>{exportMsg}</span>}
          <Btn variant="ghost" size="sm" onClick={() => exportCSV(allOrders.map(o => ({ id: o.id, service: o.service, student: o.student, consultant: o.consultant, amount: o.amountValue, platform_fee: mv(o.adminCut), consultant_pay: mv(o.consultantPay), escrow: o.escrow, status: o.status, date: o.createdAt })), 'orders-export.csv')}>
            ↓ Export Orders CSV
          </Btn>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #DDD8CE', gap: 0, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '10px 18px',
            fontSize: '13px', fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? '#0F172A' : '#9097A8',
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
      {tab === 'overview' && (
        <>
          <Section title="Revenue Summary" sub={`${allOrders.length} total orders · ${activeOrders.length} active · ${cancelled.length} cancelled`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              <KpiCard label="Gross Revenue" value={fmt(grossRevenue, true)} sub={`${activeOrders.length} paid orders`} accent="#1A6B45"
                chart={<MiniSparkline values={last6.map(k => monthlyMap[k].gross)} color="#1A6B45" />} />
              <KpiCard label="Net Revenue (Platform)" value={fmt(netRevenue, true)} sub={`${platformPct}% platform cut`} delta={growthRate} accent="#0F172A"
                chart={<MiniSparkline values={last6.map(k => monthlyMap[k].net)} />} />
              <KpiCard label="Total Paid Out" value={fmt(totalPayouts, true)} sub={`${consultantPct}% provider share`} accent="#9A7B3B"
                chart={<MiniSparkline values={last6.map(k => monthlyMap[k].payouts)} color="#9A7B3B" />} />
              <KpiCard label="Escrow Held (Liability)" value={fmt(heldEscrow, true)} sub={`${held.length} orders pending release`} accent="#D97706" />
              <KpiCard label="Pending Net Revenue" value={fmt(pendingRevenue, true)} sub="Awaiting delivery approval" accent="#3D2B6B" />
              <KpiCard label="Cancelled / Refunded" value={fmt(cancelledValue, true)} sub={`${cancellationRate.toFixed(1)}% cancellation rate`} accent="#8B1A1A" />
            </div>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Revenue split donut */}
            <Card style={{ padding: '20px' }}>
              <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '16px' }}>Revenue Split</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <DonutChart size={100} segments={[
                  { label: `Platform (${platformPct}%)`, value: netRevenue, color: '#0F172A' },
                  { label: `Providers (${consultantPct}%)`, value: totalPayouts, color: '#9A7B3B' },
                  { label: 'Escrow Held', value: heldEscrow, color: '#D97706' },
                ]} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {[
                    { label: `Platform Revenue (${platformPct}%)`, value: netRevenue, color: '#0F172A' },
                    { label: `Provider Payouts (${consultantPct}%)`, value: totalPayouts, color: '#9A7B3B' },
                    { label: 'In Escrow', value: heldEscrow, color: '#D97706' },
                    { label: 'Cancelled', value: cancelledValue, color: '#8B1A1A' },
                  ].map(row => (
                    <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: row.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: '#5C6070', flex: 1 }}>{row.label}</span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{fmt(row.value, true)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Key ratios */}
            <Card style={{ padding: '20px' }}>
              <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '16px' }}>Key Ratios</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: 'Avg. Order Value',       value: fmt(avgOrderValue) },
                  { label: 'Order Completion Rate',  value: `${completionRate.toFixed(1)}%` },
                  { label: 'Cancellation Rate',      value: `${cancellationRate.toFixed(1)}%` },
                  { label: 'Platform Take Rate',     value: pct(netRevenue, grossRevenue) },
                  { label: 'Escrow Liability Ratio', value: pct(heldEscrow, grossRevenue) },
                  { label: 'MRR (trailing 6m avg)',  value: fmt(mrr, true) },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: '13px', color: '#5C6070' }}>{row.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ── REVENUE ───────────────────────────────────────────────────────────── */}
      {tab === 'revenue' && (
        <>
          <Section title="Monthly Revenue" sub="Gross revenue collected per month (last 6 months)">
            <Card style={{ padding: '20px' }}>
              <BarChart data={monthlyBarData} height={140} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #F2EFE9' }}>
                {last3.map(k => (
                  <div key={k} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#9097A8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{monthLabel(k)}</div>
                    <div style={{ fontWeight: 700, fontSize: '18px', color: '#0F172A', marginTop: '4px' }}>{fmt(monthlyMap[k].gross, true)}</div>
                    <div style={{ fontSize: '11px', color: '#1A6B45', marginTop: '2px' }}>{fmt(monthlyMap[k].net, true)} net</div>
                  </div>
                ))}
              </div>
            </Card>
          </Section>

          <Section title="Cumulative Revenue" sub="All-time collected total">
            <Card style={{ padding: '20px' }}>
              <LineChart data={cumulativeData} height={120} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F2EFE9' }}>
                <span style={{ fontSize: '13px', color: '#9097A8' }}>All-time gross</span>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>{fmt(grossRevenue)}</span>
              </div>
            </Card>
          </Section>

          <Section title="Monthly Breakdown Table" sub="Gross · Net (platform) · Payouts · Order count">
            <DataTable
              cols={[
                { key: 'month',   label: 'Month' },
                { key: 'gross',   label: 'Gross Revenue', right: true, bold: true },
                { key: 'net',     label: 'Net (Platform)', right: true },
                { key: 'payouts', label: 'Provider Payouts', right: true },
                { key: 'count',   label: 'Orders', right: true },
                { key: 'aov',     label: 'Avg Order Value', right: true },
                { key: 'takeRate',label: 'Take Rate', right: true, muted: true },
              ]}
              rows={months.slice().reverse().map(k => ({
                month:    monthLabel(k),
                gross:    fmt(monthlyMap[k].gross),
                net:      fmt(monthlyMap[k].net),
                payouts:  fmt(monthlyMap[k].payouts),
                count:    monthlyMap[k].count,
                aov:      fmt(monthlyMap[k].count ? monthlyMap[k].gross / monthlyMap[k].count : 0),
                takeRate: pct(monthlyMap[k].net, monthlyMap[k].gross),
              }))}
              emptyMsg="No orders yet"
            />
          </Section>
        </>
      )}

      {/* ── USER PROFILES ─────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <>
          <Section title="Student / Client Spending"
            sub={`${userFinancials.students.length} clients with paid orders`}
            action={
              <div style={{ display: 'flex', gap: '6px' }}>
                {['spent', 'orders'].map(s => (
                  <button key={s} onClick={() => setUserSort(s)} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: sans, border: `1px solid ${userSort === s ? '#0F172A' : '#DDD8CE'}`, background: userSort === s ? '#0F172A' : '#fff', color: userSort === s ? '#fff' : '#5C6070' }}>
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
              ]}
              rows={[...allOrders].reverse().map(o => ({
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
              }))}
              emptyMsg="No transactions yet"
            />
          </Section>
        </>
      )}

      {/* ── LIABILITIES ───────────────────────────────────────────────────────── */}
      {tab === 'liabilities' && (
        <>
          <Section title="Liability Overview" sub="Current financial obligations and exposure">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              <KpiCard label="Escrow Held" value={fmt(heldEscrow, true)} sub={`${held.length} orders locked`} accent="#D97706" icon="🔒" />
              <KpiCard label="Pending Provider Payouts" value={fmt(pendingRevenue, true)} sub="Platform cut from held orders" accent="#3D2B6B" icon="⏳" />
              <KpiCard label="Cancelled/Refund Exposure" value={fmt(cancelledValue, true)} sub={`${cancelled.length} cancelled orders`} accent="#8B1A1A" icon="⚠️" />
              <KpiCard label="Total Liability" value={fmt(heldEscrow + cancelledValue, true)} sub="Max exposure if all fail" accent="#0F172A" icon="⚖️" />
            </div>
          </Section>

          <Section title="Escrow Ledger" sub="All orders with funds currently locked in escrow">
            <DataTable
              cols={[
                { key: 'service',  label: 'Service' },
                { key: 'client',   label: 'Client' },
                { key: 'provider', label: 'Provider' },
                { key: 'amount',   label: 'Gross Held', right: true, bold: true },
                { key: 'platform', label: 'Platform Share', right: true },
                { key: 'provider_share', label: 'Provider Share', right: true },
                { key: 'status',   label: 'Order Status' },
                { key: 'date',     label: 'Created', muted: true },
              ]}
              rows={held.map(o => ({
                service:  o.service,
                client:   o.student,
                provider: o.consultant || '—',
                amount:   fmt(o.amountValue),
                platform: fmt(mv(o.adminCut)),
                provider_share: fmt(mv(o.consultantPay)),
                status:   o.status,
                date:     o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—',
              }))}
              emptyMsg="No funds currently in escrow"
            />
          </Section>

          <Section title="Cancelled & Refunded Orders" sub="Historical cancellations and revenue lost">
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
      )}

      {/* ── PROJECTIONS ───────────────────────────────────────────────────────── */}
      {tab === 'projections' && (
        <>
          <Section title="Revenue Projections" sub={`Based on ${last6.length}-month trailing average. ${roiNote}.`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              <KpiCard label="MRR (trailing avg)" value={fmt(mrr, true)} sub={`${last6.length}-month average`} accent="#0F172A" icon="📅" />
              <KpiCard label="Projected 3-Month" value={fmt(proj3m, true)} sub="Next 3 months at current pace" accent="#1A6B45" delta={growthRate} icon="📊" />
              <KpiCard label="Projected 6-Month" value={fmt(proj6m, true)} sub="Next 6 months at current pace" accent="#9A7B3B" icon="📈" />
              <KpiCard label="ARR (Annual Run Rate)" value={fmt(arr, true)} sub="12 × monthly average" accent="#3D2B6B" icon="🎯" />
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
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '14px' }}>Platform Economics</div>
                {[
                  { label: 'Gross Revenue Collected', value: fmt(grossRevenue) },
                  { label: `Platform Fee (${platformPct}%)`, value: fmt(netRevenue) },
                  { label: `Provider Payouts (${consultantPct}%)`, value: fmt(totalPayouts) },
                  { label: 'Effective Take Rate', value: pct(netRevenue, grossRevenue) },
                  { label: 'Revenue Per Order', value: fmt(avgOrderValue) },
                  { label: 'Net Revenue Per Order', value: fmt(activeOrders.length ? netRevenue / activeOrders.length : 0) },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: '13px', color: '#5C6070' }}>{row.label}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A' }}>{row.value}</span>
                  </div>
                ))}
              </Card>
              <Card style={{ padding: '20px' }}>
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '14px' }}>Provider Economics</div>
                {sortedProviders.slice(0, 6).map(p => (
                  <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: '13px', color: '#5C6070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{p.name}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1A6B45' }}>{fmt(p.earned, true)}</div>
                      <div style={{ fontSize: '11px', color: '#9097A8' }}>{fmt(p.pending, true)} pending</div>
                    </div>
                  </div>
                ))}
                {sortedProviders.length === 0 && <p style={{ color: '#9097A8', fontSize: '13px' }}>No provider data yet</p>}
              </Card>
            </div>
          </Section>
        </>
      )}

      {/* ── RISK ──────────────────────────────────────────────────────────────── */}
      {tab === 'risk' && (
        <>
          <Section title="Risk Dashboard" sub="Financial exposure, concentration risk, and early-warning indicators">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
              <KpiCard label="Revenue Concentration" value={`${concentrationRisk.toFixed(1)}%`}
                sub="Top 3 clients of gross revenue"
                accent={concentrationRisk > 60 ? '#8B1A1A' : concentrationRisk > 40 ? '#D97706' : '#1A6B45'}
                icon="⚡"
                chart={<RiskBadge level={concentrationRisk > 60 ? 'high' : concentrationRisk > 40 ? 'medium' : 'low'} />} />
              <KpiCard label="Provider Concentration" value={`${providerConcentration.toFixed(1)}%`}
                sub="Top provider of all payouts"
                accent={providerConcentration > 70 ? '#8B1A1A' : providerConcentration > 50 ? '#D97706' : '#1A6B45'}
                icon="👤"
                chart={<RiskBadge level={providerConcentration > 70 ? 'high' : providerConcentration > 50 ? 'medium' : 'low'} />} />
              <KpiCard label="Escrow Liability" value={fmt(heldEscrow, true)}
                sub={`${pct(heldEscrow, grossRevenue)} of gross revenue`}
                accent="#D97706" icon="🔒" />
              <KpiCard label="Churn-Risk Clients" value={churnRisk.length}
                sub="No order in 60+ days"
                accent={churnRisk.length > 5 ? '#8B1A1A' : churnRisk.length > 2 ? '#D97706' : '#1A6B45'}
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
      )}
    </div>
  )
}
