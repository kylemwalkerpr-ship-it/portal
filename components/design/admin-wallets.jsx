'use client'
import React from 'react'
import { C, Card, Badge, Btn } from './shared'

// ─── constants ────────────────────────────────────────────────────────────────
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans

// ─── helpers ──────────────────────────────────────────────────────────────────
const centsToDollars = c => (Number(c) || 0) / 100
const fmt = (cents, compact = false) => {
  const n = centsToDollars(cents)
  const abs = Math.abs(n)
  if (compact && abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (compact && abs >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n)
}
const fmtN = v => (Number(v) || 0).toLocaleString()
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'
const fmtDateTime = s => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// ─── small primitives (mirror admin-financials.jsx language) ──────────────────
function KpiCard({ label, value, sub, accent = '#0F172A', icon, onClick }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{
        background: '#fff',
        border: `1px solid ${hov && onClick ? '#0F172A' : '#DDD8CE'}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: '8px',
        padding: '18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: hov && onClick ? '0 4px 12px rgba(27,45,79,0.12)' : '0 1px 3px rgba(27,45,79,0.06)',
        transition: 'all 0.15s',
        display: 'flex', flexDirection: 'column', gap: '6px',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9097A8' }}>{label}</span>
        {icon && <span style={{ fontSize: '14px', opacity: 0.6 }}>{icon}</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: '26px', color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#9097A8', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

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

function DataTable({ cols, rows, emptyMsg = 'No data', onRowClick }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${cols.length * 120}px` }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} style={{
                  padding: '11px 14px', textAlign: c.right ? 'right' : 'left',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)',
                  background: '#0F172A', whiteSpace: 'nowrap',
                  borderBottom: '2px solid rgba(255,255,255,0.08)',
                }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '32px', textAlign: 'center', color: '#9097A8', fontSize: '14px' }}>{emptyMsg}</td></tr>
            ) : rows.map((row, ri) => (
              <tr key={row.__rowKey ?? ri}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    background: ri % 2 === 0 ? '#fff' : '#FAFAF8',
                    borderBottom: '1px solid #F2EFE9',
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}>
                {cols.map(c => (
                  <td key={c.key} style={{
                    padding: '11px 14px', fontSize: '13px',
                    textAlign: c.right ? 'right' : 'left',
                    color: c.muted ? '#9097A8' : '#1A1F2E',
                    fontWeight: c.bold ? 700 : 400,
                    whiteSpace: c.wrap ? 'normal' : 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}>{row[c.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Balance distribution horizontal bars ─────────────────────────────────────
function DistributionBars({ dist, totalWallets }) {
  const buckets = [
    { key: 'zero',     label: 'Zero balance',  color: '#9097A8' },
    { key: 'lt_50',    label: 'Under $50',     color: '#3D2B6B' },
    { key: 'lt_500',   label: '$50 – $500',    color: '#0F172A' },
    { key: 'lt_5000',  label: '$500 – $5,000', color: '#9A7B3B' },
    { key: 'gte_5000', label: '$5,000+',       color: '#1A6B45' },
  ]
  const max = Math.max(1, ...buckets.map(b => Number(dist?.[b.key] || 0)))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {buckets.map(b => {
        const n = Number(dist?.[b.key] || 0)
        const pct = totalWallets > 0 ? (n / totalWallets) * 100 : 0
        return (
          <div key={b.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px' }}>
              <span style={{ color: '#5C6070' }}>{b.label}</span>
              <span style={{ fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                {fmtN(n)} <span style={{ color: '#9097A8', fontWeight: 400 }}>({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div style={{ height: '8px', borderRadius: '4px', background: '#F2EFE9', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${(n / max) * 100}%`,
                background: b.color,
                borderRadius: '4px',
                transition: 'width 0.4s',
              }}/>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Transaction type badge ──────────────────────────────────────────────────
function TxnTypeBadge({ type }) {
  const map = {
    topup:      { bg: '#EAF5EE', color: '#1A6B45' },
    debit:      { bg: '#FAEAEA', color: '#8B1A1A' },
    refund:     { bg: '#E6EEF8', color: '#1B2D4F' },
    adjustment: { bg: '#FEF5E4', color: '#8B5E0A' },
    purchase:   { bg: '#EDE7F5', color: '#3D2B6B' },
  }
  const cfg = map[type] || { bg: '#F2EFE9', color: '#5C6070' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.04em', background: cfg.bg, color: cfg.color,
    }}>{type || 'unknown'}</span>
  )
}

// ─── Top-up modal ─────────────────────────────────────────────────────────────
const REASON_PRESETS = [
  'Goodwill credit',
  'Service make-good',
  'Promotional credit',
  'Refund correction',
  'Other',
]

function TopUpModal({ profileId, onClose, onSuccess }) {
  const [amount, setAmount] = React.useState('')
  const [memo, setMemo] = React.useState('')
  const [reasonChoice, setReasonChoice] = React.useState(REASON_PRESETS[0])
  const [reasonOther, setReasonOther] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState(null)

  // ESC closes the modal unless a request is in flight.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [submitting, onClose])

  const parsedDollars = parseFloat(amount)
  const amountCents = Number.isFinite(parsedDollars) ? Math.round(parsedDollars * 100) : 0
  const reasonValue = (reasonChoice === 'Other' ? reasonOther : reasonChoice).trim()
  const memoTrimmed = memo.trim()
  const canSubmit = (
    !submitting &&
    Number.isInteger(amountCents) && amountCents > 0 &&
    memoTrimmed.length > 0 && memoTrimmed.length <= 120 &&
    reasonValue.length > 0
  )

  const handleSubmit = async e => {
    e?.preventDefault?.()
    if (!canSubmit) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/admin/wallet/credit/${profileId}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents,
          memo: memoTrimmed,
          reason: reasonValue,
          metadata: { kind: 'admin_topup' },
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        const message = json?.error?.message || `Top-up failed (HTTP ${res.status})`
        setError(message)
        setSubmitting(false)
        return
      }
      const payload = json?.data || json || {}
      onSuccess({
        creditedCents: amountCents,
        balanceCents: Number(payload.balanceCents) || 0,
        transactionId: payload.transactionId || null,
      })
    } catch (err) {
      setError(String(err?.message || err))
      setSubmitting(false)
    }
  }

  const handleBackdrop = () => { if (!submitting) onClose() }

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.55)',
        zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: '#FAFAF8',
          border: '1px solid #DDD8CE',
          borderRadius: '12px',
          boxShadow: '0 24px 60px rgba(15,23,42,0.28)',
          fontFamily: sans,
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid #DDD8CE', background: '#fff' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9097A8', marginBottom: '4px' }}>Wallet adjustment</div>
          <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '22px', color: '#0F172A', margin: 0, letterSpacing: '-0.012em' }}>
            Top up wallet
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#9097A8', lineHeight: 1.4 }}>
            Credits the student&rsquo;s balance and writes a row to the ledger. Memo is visible to the student.
          </p>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Amount */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount (USD)</span>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                color: '#9097A8', fontSize: '14px', fontWeight: 600, pointerEvents: 'none',
              }}>$</span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="25.00"
                autoFocus
                disabled={submitting}
                style={{
                  width: '100%', padding: '10px 12px 10px 24px',
                  border: '1px solid #DDD8CE', borderRadius: '6px',
                  background: '#fff', fontSize: '14px', fontFamily: sans, color: '#1A1F2E',
                  fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
                  outline: 'none',
                }} />
            </div>
            {amount && amountCents <= 0 && (
              <span style={{ fontSize: '12px', color: '#8B1A1A' }}>Enter an amount greater than zero.</span>
            )}
          </label>

          {/* Memo */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Memo <span style={{ color: '#9097A8', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(ledger description)</span>
            </span>
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value.slice(0, 120))}
              placeholder="e.g. Make-good for delayed consultant response"
              maxLength={120}
              disabled={submitting}
              style={{
                padding: '10px 12px',
                border: '1px solid #DDD8CE', borderRadius: '6px',
                background: '#fff', fontSize: '14px', fontFamily: sans, color: '#1A1F2E',
                boxSizing: 'border-box', outline: 'none',
              }} />
            <span style={{ fontSize: '11px', color: '#9097A8', textAlign: 'right' }}>{memoTrimmed.length}/120</span>
          </label>

          {/* Reason */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Reason</span>
            <select
              value={reasonChoice}
              onChange={e => setReasonChoice(e.target.value)}
              disabled={submitting}
              style={{
                padding: '10px 12px',
                border: '1px solid #DDD8CE', borderRadius: '6px',
                background: '#fff', fontSize: '14px', fontFamily: sans, color: '#1A1F2E',
                boxSizing: 'border-box', outline: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
              }}>
              {REASON_PRESETS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            {reasonChoice === 'Other' && (
              <input
                type="text"
                value={reasonOther}
                onChange={e => setReasonOther(e.target.value)}
                placeholder="Describe the reason"
                disabled={submitting}
                style={{
                  marginTop: '4px',
                  padding: '10px 12px',
                  border: '1px solid #DDD8CE', borderRadius: '6px',
                  background: '#fff', fontSize: '14px', fontFamily: sans, color: '#1A1F2E',
                  boxSizing: 'border-box', outline: 'none',
                }} />
            )}
          </div>

          {error && (
            <div style={{
              padding: '10px 12px', background: '#FAEAEA', border: '1px solid #E5BFBF',
              borderRadius: '6px', color: '#8B1A1A', fontSize: '13px',
            }}>{error}</div>
          )}
        </div>

        <div style={{
          padding: '14px 22px', borderTop: '1px solid #DDD8CE', background: '#fff',
          display: 'flex', gap: '8px', justifyContent: 'flex-end',
        }}>
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={submitting} type="button">Cancel</Btn>
          <Btn variant="primary" size="sm" type="submit" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? 'Crediting…' : amountCents > 0 ? `Credit ${fmt(amountCents)}` : 'Credit'}
          </Btn>
        </div>
      </form>
    </div>
  )
}

// ─── Wallet detail drawer ────────────────────────────────────────────────────
function WalletDrawer({ profileId, onClose }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [typeFilter, setTypeFilter] = React.useState('all')
  const [reloadKey, setReloadKey] = React.useState(0)
  const [topUpOpen, setTopUpOpen] = React.useState(false)
  const [toast, setToast] = React.useState(null)

  React.useEffect(() => {
    if (!profileId) return
    setLoading(true); setError(null)
    const url = `/api/admin/users/${profileId}/wallet?page=1&page_size=50&type=${typeFilter}`
    fetch(url, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(j => {
        if (j?.error) setError(j.error.message || 'Failed to load')
        else setData(j?.data || null)
      })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [profileId, typeFilter, reloadKey])

  // Auto-dismiss toast after 5s
  React.useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  if (!profileId) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.45)',
        zIndex: 100,
        display: 'flex', justifyContent: 'flex-end',
      }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)',
          height: '100%',
          background: '#FAFAF8',
          boxShadow: '-8px 0 24px rgba(15,23,42,0.18)',
          display: 'flex', flexDirection: 'column',
          fontFamily: sans,
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDD8CE', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9097A8', marginBottom: '4px' }}>Wallet detail</div>
            <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '24px', color: '#0F172A', margin: 0, letterSpacing: '-0.012em' }}>
              {data?.profile?.full_name || data?.profile?.email || 'Loading…'}
            </h3>
            {data?.profile?.email && (
              <div style={{ fontSize: '12px', color: '#9097A8', marginTop: '2px' }}>{data.profile.email} · {data.profile.role || '—'}</div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid #DDD8CE', borderRadius: '4px',
            padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
            color: '#5C6070', fontFamily: sans,
          }}>Close</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {loading && <div style={{ color: '#9097A8', fontSize: '13px' }}>Loading wallet…</div>}
          {error && <div style={{ color: '#8B1A1A', fontSize: '13px' }}>Error: {error}</div>}

          {!loading && !error && data && (
            <>
              {/* Balance card + actions */}
              <Card style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: '#9097A8' }}>Current balance</div>
                    <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '36px', color: '#0F172A', letterSpacing: '-0.015em', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                      {fmt(data.wallet?.balance_cents || 0)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9097A8', marginTop: '2px' }}>
                      {data.wallet?.currency || 'USD'} · updated {fmtDateTime(data.wallet?.updated_at)}
                    </div>
                  </div>
                  <Btn variant="primary" size="sm" onClick={() => setTopUpOpen(true)}>
                    Top up
                  </Btn>
                </div>
                {toast && (
                  <div style={{
                    marginTop: '14px',
                    padding: '10px 12px',
                    background: '#EAF5EE',
                    border: '1px solid #BFD9C8',
                    borderRadius: '6px',
                    color: '#1A6B45',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}>{toast}</div>
                )}
              </Card>

              {/* Lifetime totals */}
              <Section title="Lifetime totals" sub="Cumulative volume by transaction type">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  {[
                    { label: 'Top-ups',     key: 'lifetime_topup_cents',      accent: '#1A6B45' },
                    { label: 'Debits',      key: 'lifetime_debit_cents',      accent: '#8B1A1A' },
                    { label: 'Refunds',     key: 'lifetime_refund_cents',     accent: '#1B2D4F' },
                    { label: 'Adjustments', key: 'lifetime_adjustment_cents', accent: '#8B5E0A' },
                    { label: 'Purchases',   key: 'lifetime_purchase_cents',   accent: '#3D2B6B' },
                  ].map(t => (
                    <KpiCard key={t.key} label={t.label} value={fmt(data.totals?.[t.key] || 0, true)} accent={t.accent} />
                  ))}
                </div>
              </Section>

              {/* Ledger */}
              <Section
                title="Transaction ledger"
                sub={`${fmtN(data.transactions_total)} transaction${data.transactions_total === 1 ? '' : 's'} on file`}
                action={
                  <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                    style={{
                      padding: '6px 10px', borderRadius: '5px', border: '1px solid #DDD8CE',
                      background: '#fff', fontSize: '12px', fontFamily: sans, color: '#1A1F2E',
                    }}>
                    <option value="all">All types</option>
                    <option value="topup">Top-ups</option>
                    <option value="debit">Debits</option>
                    <option value="refund">Refunds</option>
                    <option value="adjustment">Adjustments</option>
                    <option value="purchase">Purchases</option>
                  </select>
                }>
                <DataTable
                  cols={[
                    { key: 'when',    label: 'Date', muted: true },
                    { key: 'type',    label: 'Type' },
                    { key: 'amount',  label: 'Amount', right: true, bold: true },
                    { key: 'balance', label: 'Balance after', right: true },
                    { key: 'desc',    label: 'Description', wrap: true, muted: true },
                    { key: 'actions', label: 'Actions' },
                  ]}
                  rows={(data.transactions || []).map(t => {
                    // Refund is only offered on debit/purchase type entries
                    // and only if the transaction hasn't already been refunded (voided).
                    const alreadyRefunded = t.metadata?.refunded_at != null
                    const canRefund = (t.type === 'debit' || t.type === 'purchase') && !alreadyRefunded
                    return {
                    __rowKey: t.id,
                    when:    fmtDateTime(t.created_at),
                    type:    <TxnTypeBadge type={t.type} />,
                    amount: (
                      <span style={{ color: Number(t.signed_cents) < 0 ? '#8B1A1A' : '#1A6B45', fontWeight: 700 }}>
                        {Number(t.signed_cents) < 0 ? '−' : '+'}{fmt(Math.abs(Number(t.signed_cents || t.amount_cents || 0)))}
                      </span>
                    ),
                    balance: fmt(t.balance_after_cents),
                    desc:    t.description || '—',
                    actions: canRefund ? (
                      <button
                        onClick={async () => {
                          const reason = prompt('Refund reason:')
                          if (!reason) return
                          const maxDollars = Math.abs(Number(t.signed_cents || t.amount_cents || 0)) / 100
                          const amtInput = prompt(`Refund amount in dollars (max $${maxDollars.toFixed(2)}):`, maxDollars.toFixed(2))
                          if (!amtInput) return
                          const parsedDollars = parseFloat(amtInput)
                          const amountCents = Math.round(parsedDollars * 100)
                          if (!Number.isFinite(amountCents) || amountCents <= 0) {
                            alert('Invalid amount.')
                            return
                          }
                          try {
                            const res = await fetch('/api/admin/ledger/refund', {
                              method: 'POST',
                              credentials: 'same-origin',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                profile_id: profileId,
                                amount_cents: amountCents,
                                order_id: t.reference || null,
                                source_table: 'wallet_transactions',
                                source_id: t.id,
                                reason,
                                method: 'wallet',
                              }),
                            })
                            const json = await res.json()
                            if (!res.ok) throw new Error(json?.error || 'Refund failed')
                            setReloadKey(k => k + 1)
                            setToast(`Refunded ${fmt(amountCents)} — ${json.data?.warnings?.length ? json.data.warnings.join('; ') : 'done'}`)
                          } catch (err) {
                            alert(String(err))
                          }
                        }}
                        style={{
                          padding: '3px 8px', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
                          background: '#FEE2E2', color: '#991B1B', border: 'none', borderRadius: '4px',
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        Refund
                      </button>
                    ) : null,
                  }})}
                  emptyMsg="No transactions for this filter"
                />
              </Section>
            </>
          )}
        </div>

        {topUpOpen && (
          <TopUpModal
            profileId={profileId}
            onClose={() => setTopUpOpen(false)}
            onSuccess={({ creditedCents, balanceCents }) => {
              setTopUpOpen(false)
              setToast(`Credited ${fmt(creditedCents)} · new balance ${fmt(balanceCents)}`)
              setReloadKey(k => k + 1)
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminWallets() {
  const [stats, setStats] = React.useState(null)
  const [statsLoading, setStatsLoading] = React.useState(true)
  const [walletList, setWalletList] = React.useState({ wallets: [], total: 0, page: 1, page_size: 25, total_pages: 0 })
  const [listLoading, setListLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState('balance_desc')
  const [page, setPage] = React.useState(1)
  const [drawerProfileId, setDrawerProfileId] = React.useState(null)
  const [exportMsg, setExportMsg] = React.useState('')

  // Debounced search
  const searchDebounced = React.useRef(search)
  const [searchKey, setSearchKey] = React.useState('')
  React.useEffect(() => {
    searchDebounced.current = search
    const t = setTimeout(() => setSearchKey(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Load stats
  React.useEffect(() => {
    setStatsLoading(true)
    fetch('/api/admin/wallets/stats', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(j => {
        if (j?.error) setError(j.error.message)
        else setStats(j?.data || null)
      })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setStatsLoading(false))
  }, [])

  // Load wallet list
  React.useEffect(() => {
    setListLoading(true)
    const params = new URLSearchParams({
      page: String(page),
      page_size: '25',
      sort,
    })
    if (searchKey) params.set('q', searchKey)
    fetch(`/api/admin/wallets?${params.toString()}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(j => {
        if (j?.error) setError(j.error.message)
        else setWalletList(j?.data || { wallets: [], total: 0, page: 1, page_size: 25, total_pages: 0 })
      })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setListLoading(false))
  }, [page, sort, searchKey])

  const distribution = stats?.balance_distribution || { zero: 0, lt_50: 0, lt_500: 0, lt_5000: 0, gte_5000: 0 }
  const topBalances  = stats?.top_balances || []

  // CSV export — mirrors admin-financials.jsx
  const exportCSV = (rows, filename) => {
    if (!rows.length) return
    const keys = Object.keys(rows[0])
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = filename
    a.click()
    setExportMsg(`${filename} downloaded`)
    setTimeout(() => setExportMsg(''), 3000)
  }

  const v30 = stats?.transaction_volume_30d || { topup_cents: 0, debit_cents: 0, refund_cents: 0, adjustment_cents: 0, purchase_cents: 0 }
  const volume30Total = (v30.topup_cents || 0) + (v30.debit_cents || 0) + (v30.refund_cents || 0) + (v30.adjustment_cents || 0) + (v30.purchase_cents || 0)

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: sans }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9097A8', marginBottom: '4px' }}>Wallets</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '34px', color: '#0F172A', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>Wallet Oversight</h2>
          <p style={{ color: '#9097A8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5 }}>
            Aggregate platform liability, balance distribution, and full per-wallet ledgers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {exportMsg && <span style={{ fontSize: '12px', color: '#1A6B45', fontWeight: 600 }}>{exportMsg}</span>}
          <Btn variant="ghost" size="sm" onClick={() => exportCSV(
            (walletList.wallets || []).map(w => ({
              profile_id: w.profile_id,
              full_name: w.full_name,
              email: w.email,
              role: w.role,
              balance_cents: w.balance_cents,
              balance_usd: centsToDollars(w.balance_cents).toFixed(2),
              currency: w.currency,
              last_txn_at: w.last_txn_at,
              txn_count_30d: w.txn_count_30d,
              updated_at: w.updated_at,
            })),
            'wallets-export.csv'
          )}>
            ↓ Export Wallets CSV
          </Btn>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 14px', background: '#FAEAEA', border: '1px solid #E5BFBF', borderRadius: '6px', color: '#8B1A1A', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Metric cards */}
      <Section title="Platform liability" sub="Total cents we hold on behalf of students across every wallet">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
          <KpiCard
            label="Total Liability"
            value={statsLoading ? '…' : fmt(stats?.total_balance_cents || 0, true)}
            sub="Outstanding wallet balances"
            accent="#0F172A"
          />
          <KpiCard
            label="Total Wallets"
            value={statsLoading ? '…' : fmtN(stats?.total_wallets || 0)}
            sub="Provisioned student wallets"
            accent="#1B2D4F"
          />
          <KpiCard
            label="Active 30d"
            value={statsLoading ? '…' : fmtN(stats?.active_wallets_30d || 0)}
            sub="Wallets with txns this month"
            accent="#1A6B45"
          />
          <KpiCard
            label="Volume 30d"
            value={statsLoading ? '…' : fmt(volume30Total, true)}
            sub={`${fmt(v30.topup_cents, true)} top-ups · ${fmt(v30.purchase_cents, true)} purchases`}
            accent="#9A7B3B"
          />
        </div>
      </Section>

      {/* Distribution + Top balances side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '16px' }}>
        <Card style={{ padding: '20px' }}>
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '14px' }}>Balance distribution</div>
          {statsLoading
            ? <div style={{ color: '#9097A8', fontSize: '13px' }}>Loading…</div>
            : <DistributionBars dist={distribution} totalWallets={stats?.total_wallets || 0} />}
        </Card>

        <Card style={{ padding: '20px' }}>
          <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '14px' }}>Top balances</div>
          <DataTable
            cols={[
              { key: 'rank',    label: '#', muted: true },
              { key: 'name',    label: 'Student' },
              { key: 'email',   label: 'Email', muted: true },
              { key: 'balance', label: 'Balance', right: true, bold: true },
            ]}
            rows={topBalances.map((w, i) => ({
              __rowKey: w.profile_id,
              rank: `#${i + 1}`,
              name: w.full_name || '—',
              email: w.email || '—',
              balance: fmt(w.balance_cents),
            }))}
            emptyMsg={statsLoading ? 'Loading…' : 'No wallets yet'}
            onRowClick={row => {
              const w = topBalances[Number(String(row.rank).replace('#', '')) - 1]
              if (w?.profile_id) setDrawerProfileId(w.profile_id)
            }}
          />
        </Card>
      </div>

      {/* All wallets */}
      <Section
        title="All wallets"
        sub={`${fmtN(walletList.total)} total · page ${walletList.page} of ${Math.max(1, walletList.total_pages || 1)}`}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search name or email…"
              style={{
                padding: '7px 10px', borderRadius: '5px', border: '1px solid #DDD8CE',
                background: '#fff', fontSize: '13px', fontFamily: sans, color: '#1A1F2E',
                minWidth: '220px',
              }}/>
            <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}
              style={{
                padding: '7px 10px', borderRadius: '5px', border: '1px solid #DDD8CE',
                background: '#fff', fontSize: '13px', fontFamily: sans, color: '#1A1F2E',
              }}>
              <option value="balance_desc">Balance (high → low)</option>
              <option value="balance_asc">Balance (low → high)</option>
              <option value="recent_activity">Recent activity</option>
              <option value="name">Name (A → Z)</option>
            </select>
          </div>
        }>
        <DataTable
          cols={[
            { key: 'name',     label: 'Student' },
            { key: 'email',    label: 'Email', muted: true },
            { key: 'role',     label: 'Role', muted: true },
            { key: 'balance',  label: 'Balance', right: true, bold: true },
            { key: 'txn30',    label: 'Txns 30d', right: true },
            { key: 'lastTxn',  label: 'Last activity', muted: true },
          ]}
          rows={(walletList.wallets || []).map(w => ({
            __rowKey: w.profile_id,
            name:    w.full_name || '—',
            email:   w.email || '—',
            role:    w.role || '—',
            balance: fmt(w.balance_cents),
            txn30:   fmtN(w.txn_count_30d || 0),
            lastTxn: fmtDate(w.last_txn_at),
            _w: w,
          }))}
          emptyMsg={listLoading ? 'Loading wallets…' : 'No wallets match this filter'}
          onRowClick={row => row._w?.profile_id && setDrawerProfileId(row._w.profile_id)}
        />

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
          <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
          <span style={{ fontSize: '12px', color: '#9097A8', minWidth: '70px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {walletList.page} / {Math.max(1, walletList.total_pages || 1)}
          </span>
          <Btn variant="ghost" size="sm" disabled={page >= (walletList.total_pages || 1)} onClick={() => setPage(p => p + 1)}>Next →</Btn>
        </div>
      </Section>

      {/* Drawer */}
      {drawerProfileId && (
        <WalletDrawer profileId={drawerProfileId} onClose={() => setDrawerProfileId(null)} />
      )}
    </div>
  )
}
