'use client'
import React from 'react'
import { C } from './shared'

// ─────────────────────────────────────────────────────────────────────────────
// Admin Orders — Kanban edition
//
// Mirrors the quality bar of admin-financials.jsx:
//   • Top metric strip — in-flight count + gross, disputed $ + count, avg
//     time-in-status, overdue past expected completion.
//   • Filter chips — provider role + date window.
//   • Kanban columns by status with graceful "Other" column for unmapped
//     values; status changes via dropdown on each card.
//   • Click-through opens an EscrowDrawer-style detail drawer with timeline,
//     scope changes, and milestones via the already-shipped endpoints.
//   • Mobile (<800px) collapses columns into vertical accordions.
//   • CSV export for visible/filtered orders.
//   • All money handled in cents end-to-end. The API ships dollars (legacy
//     numeric(18,2) columns), so we lift to cents on ingest in one place.
//   • Self-heal: data_warnings surface as a banner; query failures never 500.
// ─────────────────────────────────────────────────────────────────────────────

const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY   = '#0F172A'
const GOLD   = '#9A7B3B'
const GREEN  = '#1A6B45'
const AMBER  = '#8B5E0A'
const RED    = '#8B1A1A'
const PURPLE = '#3D2B6B'
const CYAN   = '#0891B2'
const SURFACE = '#F7F5F0'
const BORDER  = '#DDD8CE'

// ── Money helpers (cents-first) ──────────────────────────────────────────────
// fmtCents accepts a cents integer and returns a USD string. Compact form
// switches to K/M past $1k and $1M.
const fmtCents = (cents, compact = false) => {
  const dollars = (Number(cents) || 0) / 100
  const abs = Math.abs(dollars)
  if (compact && abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (compact && abs >= 1_000)     return `$${(abs / 1_000).toFixed(1)}K`
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(dollars)
}
const fmtN = v => (Number(v) || 0).toLocaleString()

// Days between an ISO timestamp and now.
const daysSince = iso => {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return null
  return Math.max(0, Math.floor(ms / 86400000))
}
const ago = iso => {
  const d = daysSince(iso)
  if (d == null) return '—'
  if (d === 0)   return 'Today'
  if (d === 1)   return 'Yesterday'
  if (d < 30)    return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}
const fmtDateTime = iso => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'

// ── Status column model ──────────────────────────────────────────────────────
// Seven canonical columns + a defensive "Other" bucket. The mapping table
// lifts every DB status variant we have ever seen onto one of these keys; an
// unknown status flows into OTHER so the board never silently hides rows.
const COLUMNS = [
  { key: 'new',             label: 'New',             accent: PURPLE, hint: 'Just created / queued' },
  { key: 'in_progress',     label: 'In Progress',     accent: CYAN,   hint: 'Active work' },
  { key: 'awaiting_client', label: 'Awaiting Client', accent: GOLD,   hint: 'Waiting on client' },
  { key: 'in_review',       label: 'In Review',       accent: AMBER,  hint: 'Under review or revision' },
  { key: 'completed',       label: 'Completed',       accent: GREEN,  hint: 'Closed and delivered' },
  { key: 'refunded',        label: 'Refunded',        accent: RED,    hint: 'Funds returned' },
  { key: 'disputed',        label: 'Disputed',        accent: RED,    hint: 'Flagged for review' },
  { key: 'other',           label: 'Other',           accent: '#5C6070', hint: 'Unmapped status' },
]

// DB status string → kanban column key. Anything not here lands in `other`.
const STATUS_TO_COLUMN = {
  pending:            'new',
  queued:             'new',
  created:            'new',
  new:                'new',
  active:             'in_progress',
  in_progress:        'in_progress',
  working:            'in_progress',
  delivered:          'awaiting_client',
  awaiting_client:    'awaiting_client',
  client_review:      'awaiting_client',
  revision_requested: 'in_review',
  under_review:       'in_review',
  in_review:          'in_review',
  approved:           'completed',
  completed:          'completed',
  released:           'completed',
  closed:             'completed',
  paid:               'completed',
  refunded:           'refunded',
  cancelled:          'refunded',
  canceled:           'refunded',
  disputed:           'disputed',
  chargeback:         'disputed',
  frozen:             'disputed',
}

// Canonical → preferred DB write status. Used when an admin drops a card to a
// column; we POST that target value to /status. Matches the existing PATCH
// semantics so downstream listeners keep working.
const COLUMN_TO_STATUS = {
  new:             'queued',
  in_progress:     'in_progress',
  awaiting_client: 'delivered',
  in_review:       'under_review',
  completed:       'completed',
  refunded:        'cancelled',   // refunded itself is forbidden via /status — admin must use /refund
  disputed:        'under_review', // dispute is escrow-level; we keep order status realistic
}

const columnFor = status => STATUS_TO_COLUMN[String(status || '').toLowerCase()] || 'other'

// ── Escrow pill ──────────────────────────────────────────────────────────────
const ESCROW_CFG = {
  held:             { text: AMBER,  bg: '#FEF5E4', label: 'Held' },
  partial_released: { text: GOLD,   bg: '#F5EDD6', label: 'Partial' },
  released:         { text: GREEN,  bg: '#EAF5EE', label: 'Released' },
  refunded:         { text: RED,    bg: '#FAEAEA', label: 'Refunded' },
  disputed:         { text: RED,    bg: '#FAEAEA', label: 'Disputed' },
  frozen:           { text: PURPLE, bg: '#F5F3FF', label: 'Frozen' },
}
function EscrowPill({ status }) {
  const cfg = ESCROW_CFG[status] || ESCROW_CFG.held
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  )
}

// ── DataWarnings (mirrors admin-financials) ──────────────────────────────────
function DataWarnings({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{
      background: '#FEF5E4', border: '1px solid #F0E2C0', borderRadius: 6,
      padding: '8px 12px', fontSize: 12, color: AMBER, lineHeight: 1.45,
    }}>
      <strong style={{ marginRight: 4 }}>Partial data:</strong>
      {items.slice(0, 3).join(' · ')}{items.length > 3 ? ` · +${items.length - 3} more` : ''}
    </div>
  )
}

// ── KPI card (mirrors admin-financials KpiCard) ──────────────────────────────
function KpiCard({ label, value, sub, accent = NAVY }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff', border: `1px solid ${BORDER}`,
        borderTop: `3px solid ${accent}`, borderRadius: 8,
        padding: '16px 18px',
        boxShadow: hov ? '0 4px 12px rgba(27,45,79,0.10)' : '0 1px 3px rgba(27,45,79,0.05)',
        transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 5,
      }}>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#9097A8' }}>{label}</span>
      <div style={{ fontWeight: 800, fontSize: 24, color: NAVY, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#9097A8', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

// ── Filter chip ──────────────────────────────────────────────────────────────
function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999,
        border: `1px solid ${active ? NAVY : BORDER}`,
        background: active ? NAVY : '#fff',
        color: active ? '#fff' : '#5C6070',
        fontSize: 12, fontWeight: 600, fontFamily: sans, cursor: 'pointer',
        whiteSpace: 'nowrap', transition: 'all 80ms',
      }}>
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Order detail drawer — reuses the EscrowDrawer endpoints (timeline,
// scope-changes, milestones, events) so we don't duplicate plumbing.
// ─────────────────────────────────────────────────────────────────────────────
function OrderDrawer({ order, onClose, onStatusChange }) {
  const [section, setSection]         = React.useState('overview')
  const [timeline, setTimeline]       = React.useState(null)
  const [milestones, setMilestones]   = React.useState(null)
  const [scopeChanges, setScopeChanges] = React.useState(null)

  React.useEffect(() => {
    if (!order?.id) return
    if (section === 'timeline' && !timeline) {
      fetch(`/api/admin/orders/${order.id}/timeline`, { credentials: 'same-origin' })
        .then(r => r.json()).then(d => setTimeline(d?.data?.timeline || d?.timeline || []))
        .catch(() => setTimeline([]))
    }
    if (section === 'milestones' && !milestones) {
      fetch(`/api/admin/escrow/${order.id}/milestones`, { credentials: 'same-origin' })
        .then(r => r.json()).then(d => setMilestones(d?.data?.milestones || d?.milestones || []))
        .catch(() => setMilestones([]))
    }
    if (section === 'scope' && !scopeChanges) {
      fetch(`/api/admin/escrow/${order.id}/scope-changes`, { credentials: 'same-origin' })
        .then(r => r.json()).then(d => setScopeChanges(d?.data?.scope_changes || d?.scope_changes || []))
        .catch(() => setScopeChanges([]))
    }
  }, [section, order?.id, timeline, milestones, scopeChanges])

  if (!order) return null
  const SECTIONS = ['overview', 'timeline', 'milestones', 'scope']
  const col = columnFor(order.status)
  const colCfg = COLUMNS.find(c => c.key === col)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.40)' }} />
      <div style={{ position: 'relative', width: 'min(620px, 100vw)', height: '100vh', background: '#fff', boxShadow: '-4px 0 40px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', fontFamily: sans }}>

        {/* Header */}
        <div style={{ background: NAVY, padding: '18px 24px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.50)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>
                Order {order.order_number || order.id?.slice(0, 8)}
              </div>
              <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: 19, color: '#fff', margin: 0, lineHeight: 1.25 }}>
                {order.service_title || 'Service Order'}
              </h2>
            </div>
            <button onClick={onClose}
              style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: 15, padding: '4px 10px', flexShrink: 0 }}>
              ×
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.10)', color: '#fff' }}>
              {colCfg?.label || order.status}
            </span>
            <EscrowPill status={order.escrow_status || 'held'} />
            {order.is_late && (
              <span style={{ padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: 'rgba(139,26,26,0.30)', color: '#FECACA' }}>OVERDUE</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.08)', overflowX: 'auto' }}>
            {SECTIONS.map(s => (
              <button key={s} onClick={() => setSection(s)}
                style={{
                  padding: '7px 14px', fontSize: 11,
                  fontWeight: section === s ? 600 : 400,
                  color: section === s ? '#fff' : 'rgba(255,255,255,0.45)',
                  background: 'none', border: 'none',
                  borderBottom: section === s ? '2px solid #C4A45A' : '2px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap', textTransform: 'capitalize', fontFamily: sans,
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {section === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Status changer */}
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Change Status</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={col}
                    onChange={e => onStatusChange(order, e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: sans, background: '#fff', cursor: 'pointer' }}
                  >
                    {COLUMNS.filter(c => c.key !== 'other').map(c => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11, color: '#9097A8' }}>Audited via order_events</span>
                </div>
              </div>

              {/* Money breakdown — cents based */}
              <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16 }}>
                <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 16, color: NAVY, marginBottom: 10 }}>Revenue Breakdown</div>
                {[
                  { l: 'Gross',           v: fmtCents(order.gross_cents),   c: NAVY,   bold: true },
                  { l: 'Platform Fee',    v: fmtCents(order.fee_cents),     c: '#9097A8' },
                  { l: 'Provider Payout', v: fmtCents(order.payout_cents),  c: GREEN,  bold: true },
                ].map(r => (
                  <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #E8E4DC' }}>
                    <span style={{ fontSize: 13, color: '#5C6070' }}>{r.l}</span>
                    <span style={{ fontSize: 13, fontWeight: r.bold ? 700 : 500, color: r.c, fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
                  </div>
                ))}
              </div>

              {/* Counterparties */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Client</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{order.client_name || '—'}</div>
                  <div style={{ fontSize: 11, color: '#9097A8' }}>{order.client_email || '—'}</div>
                </div>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Provider</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: order.provider_id ? NAVY : '#9097A8', fontStyle: order.provider_id ? 'normal' : 'italic' }}>
                    {order.provider_name || 'Unassigned'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9097A8' }}>{order.provider_email || order.provider_role || '—'}</div>
                </div>
              </div>

              {/* Key facts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Created',           ago(order.created_at)],
                  ['Days in column',    order.days_in_status != null ? `${order.days_in_status}d` : '—'],
                  ['Deadline',          order.deadline ? fmtDateTime(order.deadline) : 'Not set'],
                  ['Days open',         order.days_open != null ? `${order.days_open}d` : '—'],
                  ['Events',            fmtN(order.event_count)],
                  ['Messages',          fmtN(order.message_count)],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 7, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>

              {order.revision_reason && (
                <div style={{ background: '#FEF5E4', border: `1px solid rgba(139,94,10,0.22)`, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Revision Reason</div>
                  <div style={{ fontSize: 13, color: '#5C6070', lineHeight: 1.55 }}>{order.revision_reason}</div>
                </div>
              )}
            </div>
          )}

          {section === 'timeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, color: '#9097A8', marginBottom: 4 }}>Chronological event + message history.</div>
              {timeline === null && <p style={{ color: '#9097A8', fontSize: 13, padding: 16, textAlign: 'center' }}>Loading…</p>}
              {timeline?.length === 0 && <p style={{ color: '#9097A8', fontSize: 13, padding: 16, textAlign: 'center', background: SURFACE, borderRadius: 8 }}>No timeline events yet.</p>}
              {(timeline || []).map((e, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 8, borderBottom: '1px solid #F2EFE9' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: e.type === 'message' ? GOLD : NAVY, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>
                        {e.type === 'message' ? `${e.actor_role || 'user'} message` : e.to_status ? `→ ${String(e.to_status).replace(/_/g, ' ')}` : 'note'}
                      </span>
                      <span style={{ fontSize: 11, color: '#9097A8', flexShrink: 0 }}>{ago(e.timestamp || e.created_at)}</span>
                    </div>
                    {e.content && <div style={{ fontSize: 12, color: '#5C6070', lineHeight: 1.5 }}>{e.content}</div>}
                    {e.note && !e.content && <div style={{ fontSize: 12, color: '#5C6070', lineHeight: 1.5 }}>{e.note}</div>}
                    <div style={{ fontSize: 10, color: '#9097A8', marginTop: 2 }}>{e.actor_name || e.actor_role || 'system'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {section === 'milestones' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {milestones === null && <p style={{ color: '#9097A8', fontSize: 13, padding: 16, textAlign: 'center' }}>Loading milestones…</p>}
              {milestones?.length === 0 && (
                <div style={{ background: SURFACE, border: `1px dashed #C8C2B6`, borderRadius: 8, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 16, color: NAVY }}>No milestones</div>
                  <p style={{ fontSize: 12, color: '#9097A8', margin: '4px 0 0', lineHeight: 1.5 }}>Milestones split escrow into staged releases. This order has none configured.</p>
                </div>
              )}
              {(milestones || []).map(m => (
                <div key={m.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Milestone {m.sequence}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{m.title}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
                        {fmtCents(Math.round(Number(m.amount || 0) * 100))}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: m.status === 'released' ? GREEN : m.status === 'approved' ? CYAN : m.status === 'rejected' ? RED : '#9097A8' }}>
                        {String(m.status || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                  {m.description && <div style={{ fontSize: 12, color: '#5C6070', lineHeight: 1.55 }}>{m.description}</div>}
                  {m.due_date && <div style={{ fontSize: 11, color: '#9097A8', marginTop: 4 }}>Due {new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</div>}
                </div>
              ))}
            </div>
          )}

          {section === 'scope' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {scopeChanges === null && <p style={{ color: '#9097A8', fontSize: 13, padding: 16, textAlign: 'center' }}>Loading scope changes…</p>}
              {scopeChanges?.length === 0 && (
                <div style={{ background: SURFACE, border: `1px dashed #C8C2B6`, borderRadius: 8, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 16, color: NAVY }}>No scope changes</div>
                  <p style={{ fontSize: 12, color: '#9097A8', margin: '4px 0 0', lineHeight: 1.5 }}>No scope-change requests have been logged on this order.</p>
                </div>
              )}
              {(scopeChanges || []).map(sc => (
                <div key={sc.id} style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {String(sc.change_type || '').replace(/_/g, ' ')} · {sc.requested_by_role}
                      </span>
                      <div style={{ fontWeight: 700, fontSize: 14, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
                        {Number(sc.amount_delta) >= 0 ? '+' : ''}{fmtCents(Math.round(Number(sc.amount_delta || 0) * 100))}
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: sc.status === 'approved' ? GREEN : sc.status === 'rejected' ? RED : sc.status === 'expired' ? '#9097A8' : AMBER }}>
                      {sc.status}
                    </span>
                  </div>
                  {sc.reason && <div style={{ fontSize: 12, color: '#5C6070', lineHeight: 1.55 }}>{sc.reason}</div>}
                  <div style={{ fontSize: 11, color: '#9097A8', marginTop: 4 }}>Requested {ago(sc.created_at)}</div>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Order card
// ─────────────────────────────────────────────────────────────────────────────
function OrderCard({ order, onOpen, onStatusChange }) {
  const [hov, setHov] = React.useState(false)
  const col = columnFor(order.status)
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hov ? NAVY : BORDER}`,
        borderRadius: 8, padding: '11px 12px',
        cursor: 'pointer',
        boxShadow: hov ? '0 4px 10px rgba(27,45,79,0.10)' : '0 1px 2px rgba(27,45,79,0.04)',
        transition: 'all 0.12s',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#5C6070', fontWeight: 600 }}>
          {order.order_number || order.id?.slice(0, 8)}
        </span>
        <span style={{ fontWeight: 800, fontSize: 13, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
          {fmtCents(order.gross_cents, true)}
        </span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: NAVY, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
        title={order.service_title || ''}>
        {order.service_title || '—'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, color: '#5C6070' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={order.client_name || ''}>
          C: {order.client_name || '—'}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={order.provider_name || ''}>
          P: {order.provider_name || 'Unassigned'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <EscrowPill status={order.escrow_status || 'held'} />
        <span style={{ fontSize: 10, color: order.is_late ? RED : '#9097A8', fontWeight: order.is_late ? 700 : 500 }}>
          {order.is_late ? 'OVERDUE' : (order.days_in_status != null ? `${order.days_in_status}d here` : '—')}
        </span>
      </div>
      <select
        onClick={e => e.stopPropagation()}
        onChange={e => onStatusChange(order, e.target.value)}
        value={col}
        style={{
          padding: '5px 8px', borderRadius: 5, border: `1px solid ${BORDER}`,
          background: SURFACE, fontSize: 11, fontFamily: sans, color: '#5C6070', cursor: 'pointer',
        }}>
        {COLUMNS.filter(c => c.key !== 'other').map(c => (
          <option key={c.key} value={c.key}>Move to: {c.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Kanban column — desktop. Doubles as the panel inside the mobile accordion.
// ─────────────────────────────────────────────────────────────────────────────
function Column({ cfg, orders, totalCents, onOpenOrder, onStatusChange }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 0,
    }}>
      <div style={{
        background: '#fff', border: `1px solid ${BORDER}`,
        borderTop: `3px solid ${cfg.accent}`,
        borderRadius: 8, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cfg.label}</span>
          <span style={{ fontSize: 11, color: '#9097A8', fontWeight: 600 }}>{orders.length}</span>
        </div>
        <div style={{ fontSize: 11, color: '#9097A8', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
          {fmtCents(totalCents, true)}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 80 }}>
        {orders.length === 0 ? (
          <div style={{
            background: '#FAFAF8', border: `1px dashed ${BORDER}`,
            borderRadius: 8, padding: '20px 12px',
            fontSize: 11, color: '#9097A8', textAlign: 'center',
          }}>
            No orders in this state
          </div>
        ) : orders.map(o => (
          <OrderCard key={o.id} order={o} onOpen={() => onOpenOrder(o)} onStatusChange={onStatusChange} />
        ))}
      </div>
    </div>
  )
}

// Mobile accordion — collapses a column into a section users can toggle.
function MobileSection({ cfg, orders, totalCents, open, onToggle, onOpenOrder, onStatusChange }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderLeft: `3px solid ${cfg.accent}`, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: sans, textAlign: 'left',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cfg.label}</span>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9097A8', fontVariantNumeric: 'tabular-nums' }}>{fmtCents(totalCents, true)}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#5C6070' }}>{orders.length}</span>
          <span style={{ fontSize: 13, color: '#9097A8' }}>{open ? '−' : '+'}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {orders.length === 0 ? (
            <div style={{ fontSize: 11, color: '#9097A8', textAlign: 'center', padding: '8px 0' }}>No orders</div>
          ) : orders.map(o => (
            <OrderCard key={o.id} order={o} onOpen={() => onOpenOrder(o)} onStatusChange={onStatusChange} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminOrders({ consultants = [], formatPrimary, refreshAdminData }) {
  // Filters
  const [roleFilter, setRoleFilter]   = React.useState('all')   // all | consultant | attorney
  const [rangeFilter, setRangeFilter] = React.useState('30d')   // 7d | 30d | 90d | all
  const [searchQ, setSearchQ]         = React.useState('')
  const [debouncedQ, setDebouncedQ]   = React.useState('')

  // Data
  const [orders, setOrders]   = React.useState([])
  const [summary, setSummary] = React.useState(null)
  const [warnings, setWarnings] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState('')

  // UI
  const [drawerOrder, setDrawerOrder] = React.useState(null)
  const [notice, setNotice]   = React.useState({ type: '', msg: '' })
  const [isMobile, setIsMobile] = React.useState(false)
  const [openSection, setOpenSection] = React.useState('new')

  const flash = React.useCallback((type, msg) => {
    setNotice({ type, msg })
    window.setTimeout(() => setNotice({ type: '', msg: '' }), 5000)
  }, [])

  // Viewport breakpoint (matches the brief: 800px collapses to vertical).
  React.useEffect(() => {
    const mq = window.matchMedia('(max-width: 799px)')
    const handler = e => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  // Debounce search.
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchQ), 300)
    return () => window.clearTimeout(t)
  }, [searchQ])

  // Compute the ISO `from` date for the range filter. `all` → undefined.
  const fromDate = React.useMemo(() => {
    if (rangeFilter === 'all') return null
    const days = rangeFilter === '7d' ? 7 : rangeFilter === '90d' ? 90 : 30
    const d = new Date()
    d.setDate(d.getDate() - days)
    return d.toISOString()
  }, [rangeFilter])

  // Load orders. We pull a generous page (200) — kanban is intentionally not
  // paginated; instead the date range filter caps the working set.
  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('page_size', '200')
      params.set('sort', 'created_at')
      params.set('dir', 'desc')
      if (roleFilter !== 'all') params.set('provider_type', roleFilter)
      if (fromDate)             params.set('from', fromDate)
      if (debouncedQ.trim())    params.set('q', debouncedQ.trim())

      const res = await fetch(`/api/admin/orders?${params.toString()}`, { credentials: 'same-origin' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Failed to load orders')

      const d = data?.data ?? data
      // Lift to cents in one place. Legacy API ships numeric dollars; we never
      // touch dollar values past this boundary.
      const lifted = (d?.orders || []).map(o => {
        const statusAge = daysSince(o.status_updated_at || o.updated_at || o.created_at)
        return {
          ...o,
          gross_cents:  Math.round(Number(o.gross  || 0) * 100),
          fee_cents:    Math.round(Number(o.fee    || 0) * 100),
          payout_cents: Math.round(Number(o.payout || 0) * 100),
          days_in_status: statusAge,
        }
      })
      setOrders(lifted)
      setSummary(d?.summary || null)
      const meta = data?.meta || {}
      setWarnings(meta.data_warnings || d?.data_warnings || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      // Self-heal — don't blank the board on transient errors.
      setOrders(prev => prev)
    } finally {
      setLoading(false)
    }
  }, [roleFilter, fromDate, debouncedQ])

  React.useEffect(() => { load() }, [load])

  // Status change handler — POST /api/admin/orders/[id]/status with audit.
  const handleStatusChange = async (order, columnKey) => {
    const toStatus = COLUMN_TO_STATUS[columnKey]
    if (!toStatus) return
    if (toStatus === order.status) return
    const reason = window.prompt(`Change "${order.order_number || order.id?.slice(0, 8)}" to ${COLUMNS.find(c => c.key === columnKey)?.label}?\n\nOptional reason (logged to order_events):`)
    if (reason === null) return
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_status: toStatus, reason: reason || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d?.error?.message || d?.error || 'Failed')
      flash('ok', `Status updated → ${COLUMNS.find(c => c.key === columnKey)?.label}.`)
      await load()
      if (typeof refreshAdminData === 'function') refreshAdminData()
    } catch (e) {
      flash('err', e instanceof Error ? e.message : String(e))
    }
  }

  // Group orders by column.
  const grouped = React.useMemo(() => {
    const buckets = Object.fromEntries(COLUMNS.map(c => [c.key, []]))
    for (const o of orders) buckets[columnFor(o.status)].push(o)
    return buckets
  }, [orders])

  const columnTotals = React.useMemo(() => {
    const t = {}
    for (const c of COLUMNS) {
      t[c.key] = grouped[c.key].reduce((s, o) => s + (o.gross_cents || 0), 0)
    }
    return t
  }, [grouped])

  // Metric strip values (cents-based, derived from the loaded set).
  const inFlightCols = ['new', 'in_progress', 'awaiting_client', 'in_review']
  const metrics = React.useMemo(() => {
    let inFlightCount = 0
    let inFlightCents = 0
    let disputedCount = 0
    let disputedCents = 0
    let statusAgeSum = 0
    let statusAgeN = 0
    let overdueCount = 0
    for (const c of inFlightCols) {
      for (const o of grouped[c] || []) {
        inFlightCount += 1
        inFlightCents += o.gross_cents || 0
      }
    }
    for (const o of grouped.disputed || []) {
      disputedCount += 1
      disputedCents += o.gross_cents || 0
    }
    for (const o of orders) {
      if (typeof o.days_in_status === 'number') {
        statusAgeSum += o.days_in_status
        statusAgeN  += 1
      }
      if (o.is_late) overdueCount += 1
    }
    return {
      inFlightCount, inFlightCents,
      disputedCount, disputedCents,
      avgStatusAge: statusAgeN ? (statusAgeSum / statusAgeN) : null,
      overdueCount,
    }
  }, [grouped, orders])

  // CSV export — visible / filtered orders only.
  const exportCSV = () => {
    if (orders.length === 0) return
    const rows = orders.map(o => ({
      order_number:    o.order_number || '',
      id:              o.id,
      status:          o.status || '',
      column:          columnFor(o.status),
      escrow_status:   o.escrow_status || '',
      gross_cents:     o.gross_cents || 0,
      fee_cents:       o.fee_cents   || 0,
      payout_cents:    o.payout_cents || 0,
      client_name:     o.client_name || '',
      client_email:    o.client_email || '',
      provider_name:   o.provider_name || '',
      provider_role:   o.provider_role || '',
      service_title:   o.service_title || '',
      created_at:      o.created_at || '',
      deadline:        o.deadline || '',
      days_in_status:  o.days_in_status ?? '',
      is_late:         o.is_late ? 1 : 0,
    }))
    const keys = Object.keys(rows[0])
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `admin-orders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    flash('ok', 'CSV exported.')
  }

  // Suppress unused-var lint for the legacy props we keep for shape parity.
  void consultants; void formatPrimary

  return (
    <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 22, fontFamily: sans, background: SURFACE, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9097A8', marginBottom: 4 }}>Engagements</div>
          <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: 32, color: NAVY, margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>
            Orders Board
          </h2>
          <p style={{ color: '#9097A8', fontSize: 13, margin: '5px 0 0' }}>
            Kanban view by status — click any card for the full timeline, milestones, and scope history.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={exportCSV}
            style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: sans }}>
            Export CSV
          </button>
          <button onClick={load}
            style={{ padding: '8px 14px', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#fff', color: NAVY, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: sans }}>
            Refresh
          </button>
        </div>
      </div>

      {notice.msg && (
        <div style={{
          padding: '10px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600,
          background: notice.type === 'ok' ? '#EAF5EE' : '#FAEAEA',
          color:      notice.type === 'ok' ? GREEN     : RED,
          border:     `1px solid ${notice.type === 'ok' ? 'rgba(26,107,69,0.20)' : 'rgba(139,26,26,0.20)'}`,
        }}>{notice.msg}</div>
      )}

      <DataWarnings items={warnings} />

      {/* Top metric strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <KpiCard
          label="In Flight"
          value={loading ? '—' : `${fmtN(metrics.inFlightCount)} · ${fmtCents(metrics.inFlightCents, true)}`}
          sub="Open work across New / In Progress / Awaiting / Review"
          accent={CYAN}
        />
        <KpiCard
          label="Disputed"
          value={loading ? '—' : `${fmtN(metrics.disputedCount)} · ${fmtCents(metrics.disputedCents, true)}`}
          sub="Orders flagged or frozen"
          accent={metrics.disputedCount > 0 ? RED : GREEN}
        />
        <KpiCard
          label="Avg Time in Status"
          value={loading ? '—' : metrics.avgStatusAge == null ? '—' : `${metrics.avgStatusAge.toFixed(1)}d`}
          sub="Mean days since last status change"
          accent={GOLD}
        />
        <KpiCard
          label="Overdue"
          value={loading ? '—' : fmtN(metrics.overdueCount)}
          sub="Past expected completion deadline"
          accent={metrics.overdueCount > 0 ? RED : GREEN}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role</span>
        <Chip active={roleFilter === 'all'}        onClick={() => setRoleFilter('all')}>All</Chip>
        <Chip active={roleFilter === 'consultant'} onClick={() => setRoleFilter('consultant')}>Consultant</Chip>
        <Chip active={roleFilter === 'attorney'}   onClick={() => setRoleFilter('attorney')}>Attorney</Chip>

        <span style={{ width: 1, height: 22, background: BORDER, margin: '0 4px' }} />

        <span style={{ fontSize: 11, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Range</span>
        <Chip active={rangeFilter === '7d'}  onClick={() => setRangeFilter('7d')}>7d</Chip>
        <Chip active={rangeFilter === '30d'} onClick={() => setRangeFilter('30d')}>30d</Chip>
        <Chip active={rangeFilter === '90d'} onClick={() => setRangeFilter('90d')}>90d</Chip>
        <Chip active={rangeFilter === 'all'} onClick={() => setRangeFilter('all')}>All</Chip>

        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="Search order #, client, provider, service…"
          style={{
            flex: '1 1 220px', maxWidth: 360, marginLeft: 'auto',
            padding: '7px 12px', borderRadius: 7, border: `1px solid ${BORDER}`,
            fontSize: 13, fontFamily: sans, outline: 'none',
          }}
        />
      </div>

      {error && (
        <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.20)', borderRadius: 8, padding: 16, fontSize: 13, color: RED }}>
          {error} — <button onClick={load} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}>Retry</button>
        </div>
      )}

      {/* Board */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {COLUMNS.map(cfg => (
            (cfg.key === 'other' && grouped[cfg.key].length === 0) ? null : (
              <MobileSection
                key={cfg.key}
                cfg={cfg}
                orders={grouped[cfg.key]}
                totalCents={columnTotals[cfg.key]}
                open={openSection === cfg.key}
                onToggle={() => setOpenSection(openSection === cfg.key ? '' : cfg.key)}
                onOpenOrder={setDrawerOrder}
                onStatusChange={handleStatusChange}
              />
            )
          ))}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLUMNS.filter(c => c.key !== 'other' || grouped.other.length > 0).length}, minmax(220px, 1fr))`,
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
        }}>
          {COLUMNS.map(cfg => (
            (cfg.key === 'other' && grouped[cfg.key].length === 0) ? null : (
              <Column
                key={cfg.key}
                cfg={cfg}
                orders={grouped[cfg.key]}
                totalCents={columnTotals[cfg.key]}
                onOpenOrder={setDrawerOrder}
                onStatusChange={handleStatusChange}
              />
            )
          ))}
        </div>
      )}

      {loading && orders.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9097A8', fontSize: 13 }}>Loading orders…</div>
      )}
      {!loading && orders.length === 0 && !error && (
        <div style={{ padding: 32, textAlign: 'center', color: '#9097A8', fontSize: 13, background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
          No orders match the current filters.
        </div>
      )}

      {/* Footer hint about summary (when supplied) */}
      {summary && (
        <div style={{ fontSize: 11, color: '#9097A8', textAlign: 'right' }}>
          Server snapshot: {summary?.total_count != null ? `${fmtN(summary.total_count)} orders` : '—'}
          {summary?.escrow_held_count != null ? ` · ${fmtN(summary.escrow_held_count)} escrow held` : ''}
        </div>
      )}

      {drawerOrder && (
        <OrderDrawer
          order={drawerOrder}
          onClose={() => setDrawerOrder(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
