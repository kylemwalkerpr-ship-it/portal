'use client'
import React from 'react'
import { C, Card, Btn } from './shared'

/**
 * Admin Loyalty Ledger.
 *
 * Rule of thumb the admin is enforcing here:
 *   for every $1,000 lifetime spend, a student earns $10 wallet credit
 *   that the admin can choose to award. The credit is never auto-issued;
 *   the rule is the cap, not a trigger.
 *
 * Layout follows admin-financials / admin-wallets language:
 *   - 4 metric cards at the top (platform-wide totals)
 *   - paginated DataTable of students with available credit
 *   - row-click → side drawer with per-student detail + Award action
 *   - CSV export
 */

const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans

// ─── helpers ──────────────────────────────────────────────────────────────────
const centsToDollars = c => (Number(c) || 0) / 100
const fmtCents = (cents, compact = false) => {
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
const fmtDateTime = s => s ? new Date(s).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', year: '2-digit',
  hour: '2-digit', minute: '2-digit',
}) : '—'

// ─── primitives (mirrors admin-financials.jsx) ────────────────────────────────
function KpiCard({ label, value, sub, accent = '#0F172A', icon }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #DDD8CE',
      borderTop: `3px solid ${accent}`,
      borderRadius: '8px',
      padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(27,45,79,0.06)',
      display: 'flex', flexDirection: 'column', gap: '6px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9097A8' }}>{label}</span>
        {icon && <span style={{ fontSize: '14px', opacity: 0.55 }}>{icon}</span>}
      </div>
      <div style={{ fontWeight: 800, fontSize: '26px', color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#9097A8', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, sub, action, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${cols.length * 130}px` }}>
          <thead>
            <tr>
              {cols.map(c => (
                <th key={c.key} onClick={c.sortable ? c.onSort : undefined} style={{
                  padding: '11px 14px', textAlign: c.right ? 'right' : 'left',
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.70)',
                  background: '#0F172A', whiteSpace: 'nowrap',
                  borderBottom: '2px solid rgba(255,255,255,0.08)',
                  cursor: c.sortable ? 'pointer' : 'default',
                }}>{c.label}{c.sortIndicator || ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={cols.length} style={{ padding: '40px 24px', textAlign: 'center', color: '#9097A8', fontSize: '14px', lineHeight: 1.55 }}>{emptyMsg}</td></tr>
            ) : rows.map((row, ri) => (
              <tr key={row.__rowKey ?? ri}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    background: ri % 2 === 0 ? '#fff' : '#FAFAF8',
                    borderBottom: '1px solid #F2EFE9',
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                  onMouseEnter={onRowClick ? e => { e.currentTarget.style.background = '#F2EFE9' } : undefined}
                  onMouseLeave={onRowClick ? e => { e.currentTarget.style.background = ri % 2 === 0 ? '#fff' : '#FAFAF8' } : undefined}
              >
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

// ─── Loyalty detail drawer ───────────────────────────────────────────────────
function LoyaltyDrawer({ profileId, onClose, onAwarded }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [awardDollars, setAwardDollars] = React.useState('')
  const [awardReason, setAwardReason] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [notice, setNotice] = React.useState({ kind: '', msg: '' })

  const load = React.useCallback(() => {
    if (!profileId) return
    setLoading(true); setError('')
    fetch(`/api/admin/wallet/loyalty/${profileId}`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(json => {
        if (json?.error) throw new Error(json.error.message || 'Failed to load')
        setData(json?.data || null)
      })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [profileId])

  React.useEffect(() => { load() }, [load])

  // Default the award input to the full available amount once data loads.
  React.useEffect(() => {
    if (data?.state?.available_credit_cents > 0 && awardDollars === '') {
      setAwardDollars((data.state.available_credit_cents / 100).toFixed(2))
    }
  }, [data, awardDollars])

  const submitAward = async () => {
    if (submitting) return
    const cents = Math.round(Number(awardDollars) * 100)
    const available = data?.state?.available_credit_cents || 0
    if (!Number.isInteger(cents) || cents <= 0) {
      setNotice({ kind: 'err', msg: 'Enter a positive dollar amount.' })
      return
    }
    if (cents > available) {
      setNotice({ kind: 'err', msg: `Capped at ${fmtCents(available)} — the available loyalty balance.` })
      return
    }
    if (!awardReason.trim()) {
      setNotice({ kind: 'err', msg: 'A reason note is required for the audit trail.' })
      return
    }
    setSubmitting(true); setNotice({ kind: '', msg: '' })
    try {
      const res = await fetch(`/api/admin/wallet/loyalty/${profileId}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: cents, reason: awardReason.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json?.error) {
        throw new Error(json?.error?.message || 'Award failed.')
      }
      setNotice({ kind: 'ok', msg: `Awarded ${fmtCents(cents)} to wallet.` })
      setAwardReason('')
      setAwardDollars('')
      load()
      onAwarded?.()
    } catch (e) {
      setNotice({ kind: 'err', msg: String(e?.message || e) })
    } finally {
      setSubmitting(false)
    }
  }

  // ESC to close + lock body scroll behind the drawer
  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!profileId) return null

  const state = data?.state || {}
  const available = state.available_credit_cents || 0
  const history = data?.history || []

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0,
      background: 'rgba(15,23,42,0.45)',
      zIndex: 300,
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(680px, 100%)',
        height: '100%',
        background: '#FAFAF8',
        boxShadow: '-8px 0 24px rgba(15,23,42,0.18)',
        display: 'flex', flexDirection: 'column',
        fontFamily: sans,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDD8CE', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9097A8', marginBottom: '4px' }}>Loyalty ledger</div>
            <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '24px', color: '#0F172A', margin: 0, letterSpacing: '-0.012em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {data?.profile?.full_name || data?.profile?.email || (loading ? 'Loading…' : 'Student')}
            </h3>
            {data?.profile?.email && (
              <div style={{ fontSize: '12px', color: '#9097A8', marginTop: '2px' }}>
                {data.profile.email}{data.profile.role ? ` · ${data.profile.role}` : ''}
              </div>
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
          {loading && <div style={{ color: '#9097A8', fontSize: '13px' }}>Loading loyalty position…</div>}
          {error && <div style={{ color: '#8B1A1A', fontSize: '13px' }}>Error: {error}</div>}

          {!loading && !error && data && (
            <>
              {/* Position breakdown */}
              <Card style={{ padding: '20px' }}>
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '14px' }}>
                  Loyalty position
                </div>
                {[
                  { l: 'Lifetime spend',         v: fmtCents(state.lifetime_spent_cents),   c: '#0F172A', muted: true },
                  { l: 'Total credit earned',    v: fmtCents(state.earned_credit_cents),    c: '#1A6B45' },
                  { l: 'Already awarded',        v: fmtCents(state.awarded_credit_cents),   c: '#8B5E0A' },
                  { l: 'Available to award',     v: fmtCents(available),                    c: '#0F172A', bold: true },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F2EFE9' }}>
                    <span style={{ fontSize: '13px', color: '#5C6070' }}>{r.l}</span>
                    <span style={{
                      fontSize: r.bold ? '15px' : '13px',
                      fontWeight: r.bold ? 800 : 600,
                      color: r.c,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ fontSize: '11px', color: '#9097A8', marginTop: '10px', lineHeight: 1.5 }}>
                  Earned tier: $10 per every $1,000 of lifetime spend (floored). Current wallet balance: {fmtCents(data?.wallet_balance_cents || 0)}.
                </div>
              </Card>

              {/* Award action */}
              <Card style={{ padding: '20px' }}>
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#0F172A', marginBottom: '6px' }}>
                  Award loyalty credit
                </div>
                <p style={{ fontSize: '12px', color: '#9097A8', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Posts a wallet adjustment tagged <code style={{ background: '#F2EFE9', padding: '0 4px', borderRadius: '3px' }}>kind: loyalty_credit</code>.
                  Bounded by the available balance above. Capped server-side; you cannot over-issue from this form.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px', alignItems: 'start' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Amount (USD)</span>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '13px', color: '#9097A8' }}>$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={awardDollars}
                        onChange={e => setAwardDollars(e.target.value)}
                        disabled={available <= 0 || submitting}
                        placeholder={(available / 100).toFixed(2)}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '9px 12px 9px 22px', borderRadius: '6px',
                          border: '1px solid #DDD8CE', fontSize: '13px',
                          fontFamily: sans, outline: 'none',
                          fontVariantNumeric: 'tabular-nums',
                          background: available <= 0 ? '#F7F5F0' : '#fff',
                        }}/>
                    </div>
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason / note *</span>
                    <textarea
                      rows={2}
                      value={awardReason}
                      onChange={e => setAwardReason(e.target.value)}
                      disabled={available <= 0 || submitting}
                      placeholder="e.g. Q2 loyalty recognition — $10 of $30 earned tier 3"
                      style={{
                        width: '100%', boxSizing: 'border-box',
                        padding: '9px 12px', borderRadius: '6px',
                        border: '1px solid #DDD8CE', fontSize: '13px',
                        fontFamily: sans, outline: 'none', resize: 'vertical',
                        background: available <= 0 ? '#F7F5F0' : '#fff',
                      }}/>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '12px', color: notice.kind === 'err' ? '#8B1A1A' : notice.kind === 'ok' ? '#1A6B45' : '#9097A8' }}>
                    {notice.msg || (available > 0 ? `Bounded by available ${fmtCents(available)}.` : 'No loyalty credit available to award.')}
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setAwardDollars((available / 100).toFixed(2))}
                      disabled={available <= 0 || submitting}
                      style={{
                        padding: '8px 14px', borderRadius: '6px',
                        border: '1px solid #DDD8CE', background: '#fff',
                        color: '#5C6070', cursor: available > 0 ? 'pointer' : 'not-allowed',
                        fontSize: '12px', fontWeight: 600, fontFamily: sans,
                      }}>Max</button>
                    <button
                      onClick={submitAward}
                      disabled={available <= 0 || submitting}
                      style={{
                        padding: '8px 18px', borderRadius: '6px', border: 'none',
                        background: available > 0 ? '#0F172A' : '#9097A8',
                        color: '#fff',
                        cursor: available > 0 && !submitting ? 'pointer' : 'not-allowed',
                        fontSize: '13px', fontWeight: 700, fontFamily: sans,
                        opacity: submitting ? 0.7 : 1,
                      }}>{submitting ? 'Awarding…' : 'Award credit'}</button>
                  </div>
                </div>
              </Card>

              {/* History */}
              <Section title="Award history" sub={`${fmtN(history.length)} loyalty credit${history.length === 1 ? '' : 's'} on file`}>
                <DataTable
                  cols={[
                    { key: 'when',    label: 'Date', muted: true },
                    { key: 'amount',  label: 'Amount', right: true, bold: true },
                    { key: 'balance', label: 'Balance after', right: true },
                    { key: 'reason',  label: 'Reason', wrap: true, muted: true },
                  ]}
                  rows={history.map(t => ({
                    __rowKey: t.id,
                    when:    fmtDateTime(t.created_at),
                    amount:  <span style={{ color: '#1A6B45', fontWeight: 700 }}>+{fmtCents(t.amount_cents)}</span>,
                    balance: fmtCents(t.balance_after_cents),
                    reason:  t.description || (t.metadata && t.metadata.reason) || '—',
                  }))}
                  emptyMsg="No loyalty credit awarded to this student yet."
                />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AdminWalletLoyalty() {
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(25)
  const [sort, setSort] = React.useState('available_desc')
  const [q, setQ] = React.useState('')
  const [debouncedQ, setDebouncedQ] = React.useState('')
  const [includeAll, setIncludeAll] = React.useState(false)
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openProfileId, setOpenProfileId] = React.useState(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [exportMsg, setExportMsg] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 280)
    return () => clearTimeout(t)
  }, [q])

  React.useEffect(() => {
    setLoading(true); setError('')
    const url = `/api/admin/wallet/loyalty?page=${page}&page_size=${pageSize}&sort=${sort}&q=${encodeURIComponent(debouncedQ)}${includeAll ? '&include_all=1' : ''}`
    fetch(url, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(json => {
        if (json?.error) throw new Error(json.error.message || 'Failed to load')
        setData(json?.data || null)
      })
      .catch(e => setError(String(e?.message || e)))
      .finally(() => setLoading(false))
  }, [page, pageSize, sort, debouncedQ, includeAll, reloadKey])

  const summary  = data?.summary || {}
  const rows     = data?.rows || []
  const total    = data?.total || 0
  const totalPages = data?.total_pages || 1

  const exportCSV = () => {
    if (!rows.length) return
    const csvRows = rows.map(r => ({
      profile_id:              r.profile_id,
      full_name:               r.full_name || '',
      email:                   r.email || '',
      lifetime_spent_dollars:  (r.lifetime_spent_cents / 100).toFixed(2),
      earned_credit_dollars:   (r.earned_credit_cents / 100).toFixed(2),
      awarded_credit_dollars:  (r.awarded_credit_cents / 100).toFixed(2),
      available_credit_dollars:(r.available_credit_cents / 100).toFixed(2),
    }))
    const keys = Object.keys(csvRows[0])
    const csv  = [keys.join(','), ...csvRows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `loyalty-ledger-page-${page}.csv`
    a.click()
    setExportMsg('CSV downloaded')
    setTimeout(() => setExportMsg(''), 3000)
  }

  // Sort header click — toggles between available_desc and available_asc on
  // the available column; clicks on other columns just set the sort.
  const sortClick = key => {
    if (key === 'available') {
      setSort(s => s === 'available_desc' ? 'available_asc' : 'available_desc')
    } else if (key === 'earned')   setSort('earned_desc')
    else if (key === 'spent')      setSort('spent_desc')
    else if (key === 'name')       setSort('name')
    setPage(1)
  }
  const sortInd = key => {
    if (key === 'available') return sort === 'available_asc' ? ' ↑' : sort === 'available_desc' ? ' ↓' : ''
    if (key === 'earned' && sort === 'earned_desc') return ' ↓'
    if (key === 'spent'  && sort === 'spent_desc')  return ' ↓'
    if (key === 'name'   && sort === 'name')        return ' ·'
    return ''
  }

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: sans }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9097A8', marginBottom: '4px' }}>Wallet</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '34px', color: '#0F172A', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>Loyalty Ledger</h2>
          <p style={{ color: '#9097A8', fontSize: '13px', margin: '6px 0 0', lineHeight: 1.5, maxWidth: '70ch' }}>
            For every $1,000 a student spends across non-refunded orders, they earn $10 of wallet credit you can award.
            The rule is the cap, not an auto-issue — every award here is a discretionary admin action.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {exportMsg && <span style={{ fontSize: '12px', color: '#1A6B45', fontWeight: 600 }}>{exportMsg}</span>}
          <Btn variant="ghost" size="sm" onClick={exportCSV}>↓ Export CSV</Btn>
        </div>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        <KpiCard
          label="Total lifetime spend"
          value={fmtCents(summary.total_lifetime_spent_cents, true)}
          sub="Across all students, non-refunded"
          accent="#0F172A"
        />
        <KpiCard
          label="Total loyalty credit earned"
          value={fmtCents(summary.total_earned_credit_cents, true)}
          sub="At $10 per $1,000 spent"
          accent="#1A6B45"
        />
        <KpiCard
          label="Total credit awarded"
          value={fmtCents(summary.total_awarded_credit_cents, true)}
          sub="Through the wallet ledger"
          accent="#8B5E0A"
        />
        <KpiCard
          label="Total outstanding"
          value={fmtCents(summary.total_outstanding_credit_cents, true)}
          sub={`${fmtN(summary.students_with_available_credit)} students with available credit`}
          accent="#3D2B6B"
        />
      </div>

      {/* Toolbar */}
      <Section
        title={includeAll ? 'All students' : 'Students with available loyalty credit'}
        sub={`${fmtN(total)} student${total === 1 ? '' : 's'} · page ${page} of ${totalPages}`}
        action={
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search name or email"
              style={{
                padding: '7px 11px', borderRadius: '6px',
                border: '1px solid #DDD8CE', background: '#fff',
                fontSize: '12px', fontFamily: sans, color: '#1A1F2E',
                minWidth: '220px',
              }}/>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#5C6070' }}>
              <input type="checkbox" checked={includeAll} onChange={e => { setIncludeAll(e.target.checked); setPage(1) }} />
              Show all students
            </label>
          </div>
        }>
        {error && <div style={{ color: '#8B1A1A', fontSize: '13px' }}>Error: {error}</div>}
        {loading && !data && <div style={{ color: '#9097A8', fontSize: '13px' }}>Loading…</div>}

        <DataTable
          cols={[
            { key: 'name',      label: 'Student',           sortable: true, onSort: () => sortClick('name'),      sortIndicator: sortInd('name') },
            { key: 'email',     label: 'Email',             muted: true },
            { key: 'spent',     label: 'Lifetime spend',    right: true, sortable: true, onSort: () => sortClick('spent'),     sortIndicator: sortInd('spent') },
            { key: 'earned',    label: 'Credit earned',     right: true, sortable: true, onSort: () => sortClick('earned'),    sortIndicator: sortInd('earned') },
            { key: 'awarded',   label: 'Already awarded',   right: true },
            { key: 'available', label: 'Available',         right: true, bold: true, sortable: true, onSort: () => sortClick('available'), sortIndicator: sortInd('available') },
          ]}
          rows={rows.map(r => ({
            __rowKey:  r.profile_id,
            __profile: r.profile_id,
            name:      r.full_name || <span style={{ color: '#9097A8', fontStyle: 'italic' }}>Unnamed student</span>,
            email:     r.email || '—',
            spent:     fmtCents(r.lifetime_spent_cents),
            earned:    fmtCents(r.earned_credit_cents),
            awarded:   fmtCents(r.awarded_credit_cents),
            available: <span style={{ color: r.available_credit_cents > 0 ? '#1A6B45' : '#9097A8' }}>{fmtCents(r.available_credit_cents)}</span>,
          }))}
          onRowClick={row => setOpenProfileId(row.__profile)}
          emptyMsg={
            includeAll
              ? 'No students on file yet.'
              : 'No students currently have unawarded loyalty credit. As soon as someone crosses the next $1,000 spend tier, they will appear here.'
          }
        />

        {/* Pager */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
          <div style={{ fontSize: '12px', color: '#9097A8' }}>
            {data?.meta?.data_warnings?.length ? `Note: ${data.meta.data_warnings.join(' · ')}` : ' '}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Btn>
            <span style={{ fontSize: '12px', color: '#5C6070', alignSelf: 'center', minWidth: '70px', textAlign: 'center' }}>{page} / {totalPages}</span>
            <Btn variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</Btn>
          </div>
        </div>
      </Section>

      {/* Drawer */}
      {openProfileId && (
        <LoyaltyDrawer
          profileId={openProfileId}
          onClose={() => setOpenProfileId(null)}
          onAwarded={() => setReloadKey(k => k + 1)}
        />
      )}
    </div>
  )
}
