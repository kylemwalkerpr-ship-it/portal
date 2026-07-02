'use client'
import React from 'react'
import { C } from './shared'
import ManualCreditModal from './admin-manual-credit-modal'

/**
 * AdminStudentFinancialDrawer
 *
 * Side-drawer for the admin Financials -> Users tab. Opens when the
 * super-admin clicks a row in the "Student / Client Spending" table.
 * Mirrors the EscrowDrawer pattern in admin-escrow.jsx — slides in from
 * the right, dimmed backdrop, ESC to close, full-screen on narrow
 * viewports, tab strip across {Overview, Orders, Refunds, Wallet
 * Activity, Event Log}. CSV export button on every tab.
 *
 * Data is loaded via GET /api/admin/users/[id]/financials. That endpoint
 * is the single source of truth for the student's financial picture
 * (profile, wallet, orders w/ provider hydration, refund-typed wallet
 * transactions, full ledger, lifetime totals, recent order_events).
 *
 * Props:
 *   - studentId: profile_id of the student to drill into. Falsy hides the
 *     drawer entirely; the parent toggles by setting null.
 *   - onClose:   () => void. Fired on backdrop click, ESC, or the X.
 */

const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY  = '#0F172A'
const GOLD  = '#9A7B3B'
const GREEN = '#1A6B45'
const AMBER = '#8B5E0A'
const RED   = '#8B1A1A'
const PURPLE = '#3D2B6B'
const CYAN  = '#0E7C8E'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders',   label: 'Orders'   },
  { id: 'refunds',  label: 'Refunds'  },
  { id: 'wallet',   label: 'Wallet'   },
  { id: 'events',   label: 'Events'   },
]

// ─── money / date helpers ──────────────────────────────────────────────────
const fmtCents = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((Number(c) || 0) / 100)
const fmtDollars = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(n) || 0)
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) }
const fmtDateTime = s => { if (!s) return '—'; const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }

// ─── status / type badge colours ───────────────────────────────────────────
const ESCROW_CFG = {
  held:             { bg: '#FEF5E4', color: AMBER,  label: 'Held' },
  partial_released: { bg: '#E0F3F7', color: CYAN,   label: 'Partial' },
  released:         { bg: '#EAF5EE', color: GREEN,  label: 'Released' },
  disputed:         { bg: '#FAEAEA', color: RED,    label: 'Disputed' },
  frozen:           { bg: '#F5F3FF', color: PURPLE, label: 'Frozen' },
  refunded:         { bg: '#F2EFE9', color: '#9097A8', label: 'Refunded' },
}
function EscrowPill({ status }) {
  const c = ESCROW_CFG[status] || ESCROW_CFG.held
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

const TX_TYPE_CFG = {
  topup:         { bg: '#EAF5EE', color: GREEN,   label: 'Top-up' },
  debit:         { bg: '#FEF5E4', color: AMBER,   label: 'Debit' },
  purchase:      { bg: '#E0F3F7', color: CYAN,    label: 'Purchase' },
  refund:        { bg: '#F5F3FF', color: PURPLE,  label: 'Refund' },
  adjustment:    { bg: '#F2EFE9', color: '#5C6070', label: 'Adjustment' },
  manual_credit: { bg: '#F0E6FF', color: '#6B21A8', label: 'Manual Credit' },
}
function TxTypeBadge({ type }) {
  const c = TX_TYPE_CFG[type] || { bg: '#F2EFE9', color: '#5C6070', label: type || '—' }
  return (
    <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: c.bg, color: c.color }}>
      {c.label}
    </span>
  )
}

// ─── inline mini DataTable, scoped to the drawer ──────────────────────────
function MiniTable({ cols, rows, emptyMsg = 'No data' }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${cols.length * 110}px` }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '9px 12px', textAlign: c.right ? 'right' : 'left', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)', background: NAVY, whiteSpace: 'nowrap', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '24px', textAlign: 'center', color: '#9097A8', fontSize: '13px' }}>{emptyMsg}</td></tr>
            ) : rows.map((row, ri) => (
              <tr key={row._key || ri} style={{ background: ri % 2 === 0 ? '#fff' : '#FAFAF8', borderBottom: '1px solid #F2EFE9' }}>
                {cols.map(c => (
                  <td key={c.key} style={{ padding: '9px 12px', fontSize: '12.5px', textAlign: c.right ? 'right' : 'left', color: c.muted ? '#9097A8' : '#1A1F2E', fontWeight: c.bold ? 700 : 400, whiteSpace: c.wrap ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
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

// ─── CSV download (drawer-local helper) ────────────────────────────────────
function downloadCSV(rows, filename) {
  if (!rows || !rows.length) return
  const keys = Object.keys(rows[0])
  const csv  = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  a.download = filename
  a.click()
}

// ─── Header metric card (matches admin-financials Section/Card vibe) ───────
function MetricCard({ label, value, sub, accent = NAVY }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderTop: `3px solid ${accent}`, borderRadius: '8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
      <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9097A8' }}>{label}</span>
      <span style={{ fontWeight: 800, fontSize: '20px', color: NAVY, letterSpacing: '-0.01em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>{value}</span>
      {sub && <span style={{ fontSize: '11px', color: '#9097A8' }}>{sub}</span>}
    </div>
  )
}

// ─── Main drawer ───────────────────────────────────────────────────────────
export default function AdminStudentFinancialDrawer({ studentId, onClose }) {
  const [section, setSection] = React.useState('overview')
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [creditModalOpen, setCreditModalOpen] = React.useState(false)
  const [creditToast, setCreditToast] = React.useState(null)

  // Reset to overview each time a different student is opened
  React.useEffect(() => {
    if (studentId) setSection('overview')
  }, [studentId])

  // Fetch on open
  React.useEffect(() => {
    if (!studentId) return
    let cancelled = false
    setLoading(true); setError(''); setData(null)
    fetch(`/api/admin/users/${encodeURIComponent(studentId)}/financials`, { credentials: 'same-origin' })
      .then(async r => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(json?.error?.message || json?.error || 'Failed to load')
        return json?.data ?? json
      })
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message || 'Failed'); setLoading(false) } })
    return () => { cancelled = true }
  }, [studentId])

  // ESC closes
  React.useEffect(() => {
    if (!studentId) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [studentId, onClose])

  if (!studentId) return null

  const profile  = data?.profile  || {}
  const wallet   = data?.wallet   || {}
  const totals   = data?.totals   || {}
  const orders   = data?.orders   || []
  const refunds  = data?.refunds  || []
  const ledger   = data?.wallet_ledger || []
  const events   = data?.recent_events || []

  // Auto-dismiss toast after 6s
  React.useEffect(() => {
    if (!creditToast) return
    const t = setTimeout(() => setCreditToast(null), 6000)
    return () => clearTimeout(t)
  }, [creditToast])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end', fontFamily: sans }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)' }} />
      <div role="dialog" aria-modal="true" aria-label={`Financial profile for ${profile.full_name || profile.email || 'student'}`}
        style={{ position: 'relative', width: 'min(760px, 100vw)', height: '100vh', background: '#fff', boxShadow: '-4px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ background: NAVY, padding: '18px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.50)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: '3px' }}>Client Financial Profile</div>
              <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '22px', color: '#fff', margin: 0, lineHeight: 1.2, wordBreak: 'break-word' }}>
                {profile.full_name || profile.email || 'Loading…'}
              </h2>
              {profile.email && profile.full_name && (
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.70)', marginTop: '2px' }}>{profile.email}</div>
              )}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '15px', padding: '4px 10px', flexShrink: 0, lineHeight: 1 }}>
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
            {profile.role && (
              <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(196,164,90,0.20)', color: '#C4A45A', border: '1px solid rgba(196,164,90,0.30)' }}>
                {profile.role}
              </span>
            )}
            {profile.status && (
              <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: profile.status === 'active' ? 'rgba(26,107,69,0.20)' : 'rgba(139,26,26,0.22)', color: profile.status === 'active' ? '#A8E0C0' : '#F2B5B5' }}>
                {profile.status}
              </span>
            )}
            {profile.country && (
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.60)' }}>· {profile.country}</span>
            )}
          </div>
          {/* Tab strip */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
            {SECTIONS.map(s => (
              <button key={s.id} onClick={() => setSection(s.id)} style={{
                padding: '7px 14px', fontSize: '11.5px',
                fontWeight: section === s.id ? 600 : 400,
                color: section === s.id ? '#fff' : 'rgba(255,255,255,0.45)',
                background: 'none', border: 'none',
                borderBottom: section === s.id ? '2px solid #C4A45A' : '2px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize', fontFamily: sans,
              }}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px', background: '#FAFAF8' }}>
          {loading && (
            <p style={{ color: '#9097A8', fontSize: '13px', padding: '24px', textAlign: 'center' }}>Loading financial profile…</p>
          )}
          {error && !loading && (
            <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.22)', borderRadius: '8px', padding: '14px 16px', color: RED, fontSize: '13px' }}>
              {error}
            </div>
          )}
          {!loading && !error && data && (
            <>
              {/* Top metric row — always visible */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                <MetricCard label="Wallet Balance" value={fmtCents(totals.current_wallet_balance_cents)} sub={wallet.updated_at ? `as of ${fmtDate(wallet.updated_at)}` : ''} accent={GREEN} />
                <MetricCard label="Lifetime Spent" value={fmtCents(totals.lifetime_spent_cents)} sub={`${totals.total_orders || 0} orders`} accent={NAVY} />
                <MetricCard label="Lifetime Refunded" value={fmtCents(totals.lifetime_refunded_cents)} sub={`${refunds.length} refund(s)`} accent={RED} />
                <MetricCard label="Open Escrow" value={fmtCents(totals.open_escrow_cents)} sub="Held + disputed + frozen" accent={AMBER} />
              </div>

              {/* Global toast — visible on any tab */}
              {creditToast && (
                <div style={{
                  marginBottom: '12px',
                  padding: '10px 14px',
                  background: '#EAF5EE',
                  border: '1px solid #BFD9C8',
                  borderRadius: '6px',
                  color: '#1A6B45',
                  fontSize: '13px',
                  fontWeight: 600,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>{creditToast}</span>
                  <button onClick={() => setCreditToast(null)}
                    style={{ background: 'none', border: 'none', color: '#1A6B45', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 4px' }}>✕</button>
                </div>
              )}

              {/* Credit wallet action bar — visible on Overview and Wallet tabs */}
              {(section === 'overview' || section === 'wallet') && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '12px' }}>
                  <button
                    onClick={() => setCreditModalOpen(true)}
                    disabled={!data}
                    style={{
                      padding: '8px 16px', borderRadius: '6px',
                      border: 'none', background: '#0F172A',
                      color: '#fff', cursor: 'pointer',
                      fontSize: '12px', fontWeight: 600, fontFamily: sans, lineHeight: 1,
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      transition: 'opacity 0.12s', opacity: data ? 1 : 0.5,
                    }}>
                    <span>+</span> Credit Wallet (Off-Platform)
                  </button>
                </div>
              )}

              {/* OVERVIEW */}
              {section === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: NAVY, marginBottom: '10px' }}>Order Counts</div>
                    {[
                      { l: 'Total orders',       v: totals.total_orders || 0 },
                      { l: 'Completed',          v: totals.completed_orders || 0 },
                      { l: 'Refunded / cancelled', v: totals.refunded_orders || 0 },
                      { l: 'Escrow-held orders', v: orders.filter(o => ['held','partial_released','disputed','frozen'].includes(o.escrow_status)).length },
                    ].map(row => (
                      <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F2EFE9' }}>
                        <span style={{ fontSize: '13px', color: '#5C6070' }}>{row.l}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: NAVY }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: NAVY, marginBottom: '10px' }}>Money Summary</div>
                    {[
                      { l: 'Lifetime spent',      v: fmtCents(totals.lifetime_spent_cents) },
                      { l: 'Lifetime refunded',   v: fmtCents(totals.lifetime_refunded_cents), color: RED },
                      { l: 'Wallet balance',      v: fmtCents(totals.current_wallet_balance_cents), color: GREEN },
                      { l: 'Wallet top-ups',      v: fmtCents(totals.lifetime_wallet_topup_cents) },
                      { l: 'Manual credits',      v: fmtCents(totals.lifetime_manual_credit_cents), color: '#6B21A8' },
                      { l: 'Pending refund',      v: fmtCents(totals.pending_refund_cents), color: AMBER },
                    ].map(row => (
                      <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F2EFE9' }}>
                        <span style={{ fontSize: '13px', color: '#5C6070' }}>{row.l}</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: row.color || NAVY }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ORDERS */}
              {section === 'orders' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button onClick={() => downloadCSV(
                      orders.map(o => ({
                        order_number: o.order_number || o.id,
                        service: o.service_title || '',
                        provider: o.provider_name || '',
                        provider_role: o.provider_role || '',
                        gross: o.total_amount,
                        platform_fee: o.platform_fee_amount,
                        provider_pay: o.consultant_payout_amount,
                        escrow_status: o.escrow_status,
                        status: o.status,
                        date: o.created_at,
                      })),
                      `student-${studentId}-orders.csv`,
                    )} style={{ padding: '5px 11px', borderRadius: '5px', border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>↓ CSV</button>
                  </div>
                  <MiniTable
                    cols={[
                      { key: 'order',   label: 'Order' },
                      { key: 'service', label: 'Service', wrap: true },
                      { key: 'provider', label: 'Provider', muted: true },
                      { key: 'gross',   label: 'Gross', right: true, bold: true },
                      { key: 'fee',     label: 'Fee', right: true, muted: true },
                      { key: 'pay',     label: 'Provider', right: true },
                      { key: 'escrow',  label: 'Escrow' },
                      { key: 'status',  label: 'Status' },
                      { key: 'date',    label: 'Date', muted: true },
                    ]}
                    rows={orders.map(o => ({
                      _key: o.id,
                      order:   o.order_number || (o.id ? o.id.slice(0, 8) + '…' : '—'),
                      service: o.service_title || '—',
                      provider: o.provider_name || '—',
                      gross:   fmtDollars(o.total_amount),
                      fee:     fmtDollars(o.platform_fee_amount),
                      pay:     fmtDollars(o.consultant_payout_amount),
                      escrow:  <EscrowPill status={o.escrow_status} />,
                      status:  o.status,
                      date:    fmtDate(o.created_at),
                    }))}
                    emptyMsg="No orders on file"
                  />
                </>
              )}

              {/* REFUNDS */}
              {section === 'refunds' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button onClick={() => downloadCSV(
                      refunds.map(r => ({
                        date: r.created_at,
                        amount_cents: r.amount_cents,
                        description: r.description,
                        reference: r.reference || '',
                        order_id: r.order_id || '',
                      })),
                      `student-${studentId}-refunds.csv`,
                    )} style={{ padding: '5px 11px', borderRadius: '5px', border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>↓ CSV</button>
                  </div>
                  <MiniTable
                    cols={[
                      { key: 'date',        label: 'Date' },
                      { key: 'amount',      label: 'Amount', right: true, bold: true },
                      { key: 'description', label: 'Description', wrap: true },
                      { key: 'reference',   label: 'Reference', muted: true },
                      { key: 'order',       label: 'Order', muted: true },
                    ]}
                    rows={refunds.map(r => ({
                      _key:        r.id,
                      date:        fmtDate(r.created_at),
                      amount:      fmtCents(r.amount_cents),
                      description: r.description || '—',
                      reference:   r.reference || '—',
                      order:       r.order_id ? (r.order_id.slice(0, 8) + '…') : '—',
                    }))}
                    emptyMsg="No refunds on this account"
                  />
                </>
              )}

              {/* WALLET ACTIVITY */}
              {section === 'wallet' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '8px' }}>
                    <button
                      onClick={() => setCreditModalOpen(true)}
                      style={{
                        padding: '6px 12px', borderRadius: '5px',
                        border: 'none', background: '#0F172A',
                        color: '#fff', cursor: 'pointer',
                        fontSize: '11px', fontWeight: 600, fontFamily: sans, lineHeight: 1,
                      }}>
                      + Record Off-Platform Payment
                    </button>
                    <button onClick={() => downloadCSV(
                      ledger.map(t => ({
                        date: t.created_at,
                        type: t.type,
                        amount_cents: t.amount_cents,
                        signed_cents: t.signed_cents,
                        balance_after_cents: t.balance_after_cents,
                        description: t.description,
                        reference: t.reference || '',
                      })),
                      `student-${studentId}-wallet-ledger.csv`,
                    )} style={{ padding: '5px 11px', borderRadius: '5px', border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>↓ CSV</button>
                  </div>
                  <MiniTable
                    cols={[
                      { key: 'date',    label: 'Date' },
                      { key: 'type',    label: 'Type' },
                      { key: 'amount',  label: 'Amount', right: true, bold: true },
                      { key: 'balance', label: 'Balance After', right: true },
                      { key: 'description', label: 'Description', wrap: true },
                      { key: 'reference',   label: 'Reference', muted: true },
                    ]}
                    rows={ledger.map(t => {
                      const signed = Number(t.signed_cents || 0)
                      const positive = signed >= 0
                      const effectiveType = t.display_type || t.type
                      return {
                        _key:        t.id,
                        date:        fmtDate(t.created_at),
                        type:        <TxTypeBadge type={effectiveType} />,
                        amount:      <span style={{ color: positive ? GREEN : RED }}>{positive ? '+' : ''}{fmtCents(signed)}</span>,
                        balance:     fmtCents(t.balance_after_cents),
                        description: t.description || '—',
                        reference:   t.reference || '—',
                      }
                    })}
                    emptyMsg="No wallet activity"
                  />
                </>
              )}

              {/* EVENT LOG */}
              {section === 'events' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <button onClick={() => downloadCSV(
                      events.map(e => ({
                        date: e.created_at,
                        order_id: e.order_id,
                        from_status: e.from_status || '',
                        to_status: e.to_status || '',
                        actor_role: e.actor_role || '',
                        note: e.note || '',
                      })),
                      `student-${studentId}-events.csv`,
                    )} style={{ padding: '5px 11px', borderRadius: '5px', border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: '12px', fontWeight: 600, fontFamily: sans }}>↓ CSV</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ fontSize: '12px', color: '#9097A8' }}>Recent order state changes across every order this client has placed.</div>
                    {events.length === 0 ? (
                      <p style={{ color: '#9097A8', fontSize: '13px', padding: '16px', textAlign: 'center', background: '#fff', borderRadius: '8px', border: '1px solid #DDD8CE' }}>No events.</p>
                    ) : events.map(e => (
                      <div key={e.id} style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '7px', padding: '10px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: NAVY }}>
                            {e.from_status ? `${e.from_status} → ${e.to_status}` : (e.to_status || 'event')}
                          </span>
                          <span style={{ fontSize: '11px', color: '#9097A8' }}>{fmtDateTime(e.created_at)}</span>
                        </div>
                        {e.note && <div style={{ fontSize: '12px', color: '#5C6070', lineHeight: 1.5, marginTop: '2px' }}>{e.note}</div>}
                        <div style={{ fontSize: '10px', color: '#9097A8', marginTop: '4px' }}>
                          Order {e.order_id ? e.order_id.slice(0, 8) + '…' : '—'} · {e.actor_role || 'system'}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Manual Credit Modal */}
      {creditModalOpen && (
        <ManualCreditModal
          profileId={studentId}
          currentBalance={totals.current_wallet_balance_cents}
          profileName={profile.full_name}
          profileEmail={profile.email}
          onClose={() => setCreditModalOpen(false)}
          onSuccess={({ creditedCents, balanceCents }) => {
            setCreditModalOpen(false)
            setCreditToast(`✓ Credited $${(creditedCents / 100).toFixed(2)} · New balance $${(balanceCents / 100).toFixed(2)}`)
          }}
        />
      )}
    </div>
  )
}
