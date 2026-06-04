'use client'
import React from 'react'
import { C, Card, Btn } from './shared'

// ─── constants ────────────────────────────────────────────────────────────────
// Mirrors admin-financials.jsx — Cormorant serif + Inter sans, navy KPI cards,
// dark DataTable header, gold sort glyph, filter chips with counts. Mirrors
// admin-escrow.jsx — full-height side drawer, dark header, tabbed body, ESC
// closes, body-scroll lock.
const serif = "'Cormorant Garamond', 'Garamond', Georgia, serif"
const sans  = C.sans
const NAVY   = '#0F172A'
const GOLD   = '#C4A45A'
const GREEN  = '#1A6B45'
const AMBER  = '#8B5E0A'
const RED    = '#8B1A1A'
const PURPLE = '#3D2B6B'

// The underlying API speaks the escrow-decision vocabulary
// (pending / approved / denied / cancelled). The product spec asks for a
// support-tone vocabulary on the UI (open / pending / resolved / closed).
// These maps reconcile the two without touching the API.
//   open     → pending  (admin needs to act now)
//   pending  → pending  (same view, kept for clarity)
//   resolved → approved + denied (any final decision)
//   closed   → cancelled (withdrawn without action)
//   all      → no filter
const STATUS_FILTERS = ['open', 'pending', 'resolved', 'closed', 'all']
const FILTER_TO_API = {
  open:     ['pending'],
  pending:  ['pending'],
  resolved: ['approved', 'denied'],
  closed:   ['cancelled'],
  all:      [],
}

const STATUS_CFG = {
  pending:   { dot:'#9A7B3B',  text:AMBER,   bg:'#FEF5E4', label:'Pending'   },
  approved:  { dot:GREEN,      text:GREEN,   bg:'#EAF5EE', label:'Approved'  },
  denied:    { dot:RED,        text:RED,     bg:'#FAEAEA', label:'Denied'    },
  cancelled: { dot:'#64748B',  text:'#64748B', bg:'#F2EFE9', label:'Cancelled' },
}

const KIND_LABEL = {
  void:           'Void · full refund',
  refund_partial: 'Partial refund',
  release_hold:   'Release escrow early',
  other:          'Other action',
}

// Sort columns mapped to API sort keys. "last_activity" sorts by decided_at
// server-side (the API treats null/recent the same), but locally we tie-break
// on updated_at when present.
const SORT_COLS = [
  { key:'priority',      label:'Priority',     sortable:true },
  { key:'kind',          label:'Subject',      sortable:false },
  { key:'order',         label:'Order',        sortable:false },
  { key:'raised_by',     label:'Raised by',    sortable:false },
  { key:'client',        label:'Client',       sortable:false },
  { key:'status',        label:'Status',       sortable:true },
  { key:'amount',        label:'Amount',       sortable:false, right:true },
  { key:'created_at',    label:'Created',      sortable:true },
  { key:'last_activity', label:'Last activity', sortable:true },
]

// ─── formatters ───────────────────────────────────────────────────────────────
const usdFmt = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:2 })
const fmtMoneyCents = cents => cents == null || isNaN(cents) ? '—' : usdFmt.format(Number(cents) / 100)
const fmtMoney      = amt   => usdFmt.format(Number(amt) || 0)
const fmtN          = n     => (Number(n) || 0).toLocaleString()
const ago = iso => {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'2-digit' })
}
const fmtDateTime = iso => iso
  ? new Date(iso).toLocaleString('en-GB', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })
  : '—'
const fmtHours = h => {
  if (h == null || !Number.isFinite(h)) return '—'
  if (h < 1)  return `${Math.round(h * 60)}m`
  if (h < 24) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

// ─── small primitives ─────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
  const c = STATUS_CFG[status] || STATUS_CFG.pending
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:'4px', padding:'3px 8px 3px 6px', borderRadius:'4px', fontSize:'11px', fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase', background:c.bg, color:c.text }}>
      <span style={{ width:'5px', height:'5px', borderRadius:'50%', background:c.dot, display:'inline-block', flexShrink:0 }} />
      {c.label}
    </span>
  )
}

const SlaBadge = ({ hours, status }) => {
  if (status !== 'pending') return null
  const level = hours > 48 ? 'high' : hours > 24 ? 'medium' : 'low'
  const cfg = level === 'high'
    ? { bg:'#FAEAEA', color:RED,   label:`SLA · ${fmtHours(hours)} late` }
    : level === 'medium'
      ? { bg:'#FEF5E4', color:AMBER, label:`SLA · ${fmtHours(hours)} over` }
      : { bg:'#EAF5EE', color:GREEN, label:`${fmtHours(hours)} open` }
  return (
    <span style={{ display:'inline-block', padding:'2px 6px', borderRadius:'3px', fontSize:'10px', fontWeight:700, background:cfg.bg, color:cfg.color, whiteSpace:'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function DataWarnings({ items }) {
  if (!items?.length) return null
  return (
    <div style={{
      background:'#FEF5E4', border:'1px solid #F0E2C0', borderRadius:6,
      padding:'8px 12px', fontSize:12, color:AMBER, lineHeight:1.45,
    }}>
      <strong style={{ marginRight:4 }}>Partial data:</strong>
      {items.slice(0, 3).join(' · ')}{items.length > 3 ? ` · +${items.length - 3} more` : ''}
    </div>
  )
}

// KPI card — visually identical to admin-financials KpiCard.
function KpiCard({ label, value, sub, accent = NAVY, icon, onClick }) {
  const [hov, setHov] = React.useState(false)
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} onClick={onClick}
      style={{
        background:'#fff',
        border:`1px solid ${hov && onClick ? NAVY : '#DDD8CE'}`,
        borderTop:`3px solid ${accent}`,
        borderRadius:'8px', padding:'18px 20px',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: hov && onClick ? '0 4px 12px rgba(27,45,79,0.12)' : '0 1px 3px rgba(27,45,79,0.06)',
        transition:'all 0.15s',
        display:'flex', flexDirection:'column', gap:'6px',
      }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#9097A8' }}>{label}</span>
        <span style={{ fontSize:'16px', opacity:0.5 }}>{icon}</span>
      </div>
      <div style={{ fontWeight:800, fontSize:'26px', color:NAVY, letterSpacing:'-0.02em', lineHeight:1, fontVariantNumeric:'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize:'12px', color:'#9097A8', lineHeight:1.4 }}>{sub}</div>}
    </div>
  )
}

// Section header — matches financials Section primitive.
function Section({ title, sub, action, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
        <div>
          <h3 style={{ fontFamily:serif, fontWeight:600, fontSize:'20px', color:NAVY, margin:0, letterSpacing:'-0.01em' }}>{title}</h3>
          {sub && <p style={{ margin:'3px 0 0', fontSize:'13px', color:'#9097A8', lineHeight:1.4 }}>{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ─── Detail drawer ────────────────────────────────────────────────────────────
// Mirrors EscrowDrawer: full-height right-side, dark header with tabs,
// click-outside + ESC close, body-scroll lock. Tabs: overview · thread ·
// actions. Actions tab consolidates Reply, Assign, Change status, Close.
function TicketDrawer({ ticket, onClose, onDecide, onReply, onAssign, admins, busy }) {
  const [tab, setTab]                       = React.useState('overview')
  const [thread, setThread]                 = React.useState(null)
  const [replyBody, setReplyBody]           = React.useState('')
  const [decisionNotes, setDecisionNotes]   = React.useState('')
  const [assigneeId, setAssigneeId]         = React.useState('')
  const TABS = ['overview', 'thread', 'actions']

  // ESC closes — matches EscrowDrawer
  React.useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Body-scroll lock while open — drawer dictates the scroll, the page
  // beneath should freeze. We restore the previous overflow on unmount.
  React.useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Reset state on ticket change
  React.useEffect(() => {
    setTab('overview')
    setThread(null)
    setReplyBody('')
    setDecisionNotes('')
    setAssigneeId('')
  }, [ticket?.id])

  // Lazy-load the thread the first time the user lands on it.
  React.useEffect(() => {
    if (!ticket?.id) return
    if (tab !== 'thread' || thread !== null) return
    fetch(`/api/admin/tickets/${ticket.id}/thread`, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(j => setThread(j?.data || j || { messages: [], decision_events: [] }))
      .catch(() => setThread({ messages: [], decision_events: [] }))
  }, [tab, ticket?.id, thread])

  if (!ticket) return null
  const cfg = STATUS_CFG[ticket.status] || STATUS_CFG.pending
  const canDecide = ticket.status === 'pending'

  // Thread render: merge decision events with conversation messages, sort by
  // created_at. Each event records a sender role + timestamp.
  const events = React.useMemo(() => {
    if (!thread) return []
    const ev = [
      ...(thread.decision_events || []).map(e => ({ ...e, _kind: 'system' })),
      ...(thread.messages || []).map(m => ({
        ...m,
        _kind: 'message',
        actor_name: m.sender_name,
        actor_role: m.sender_role,
        body: m.body,
      })),
    ]
    ev.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return ev
  }, [thread])

  return (
    <div role="dialog" aria-modal="true" aria-label="Ticket detail" style={{ position:'fixed', inset:0, zIndex:300, display:'flex', justifyContent:'flex-end' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.40)' }} />
      <div style={{ position:'relative', width:'min(640px, 100vw)', height:'100vh', background:'#fff', boxShadow:'-4px 0 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column', fontFamily:sans }}>

        {/* Header */}
        <div style={{ background:NAVY, padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px', marginBottom:'12px' }}>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:'10px', color:'rgba(255,255,255,0.50)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:'4px' }}>
                Ticket · #{ticket.order_number || ticket.order_id?.slice(0, 8)}
              </div>
              <h2 style={{ fontFamily:serif, fontWeight:600, fontSize:'19px', color:'#fff', margin:0, lineHeight:1.25, overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                {KIND_LABEL[ticket.kind] || ticket.kind}
              </h2>
              <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.65)', marginTop:'6px', lineHeight:1.4 }}>
                {ticket.raised_by_name || 'Unknown'}{ticket.raised_by_email ? ` · ${ticket.raised_by_email}` : ''}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background:'rgba(255,255,255,0.10)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'6px', color:'#fff', cursor:'pointer', fontSize:'16px', padding:'5px 10px', flexShrink:0 }}>✕</button>
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center', marginBottom:'12px' }}>
            <StatusPill status={ticket.status} />
            <SlaBadge hours={ticket.age_hours} status={ticket.status} />
            {ticket.amount_cents != null && (
              <span style={{ padding:'3px 8px', borderRadius:'4px', fontSize:'11px', fontWeight:700, background:'rgba(255,255,255,0.10)', color:'rgba(255,255,255,0.80)' }}>
                {fmtMoneyCents(ticket.amount_cents)}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:0, borderBottom:'1px solid rgba(255,255,255,0.08)', overflowX:'auto' }}>
            {TABS.map(s => (
              <button key={s} onClick={() => setTab(s)} style={{
                padding:'7px 14px', fontSize:'11px',
                fontWeight: tab === s ? 600 : 400,
                color: tab === s ? '#fff' : 'rgba(255,255,255,0.45)',
                background:'none', border:'none',
                borderBottom: tab === s ? `2px solid ${GOLD}` : '2px solid transparent',
                cursor:'pointer', whiteSpace:'nowrap', textTransform:'capitalize', fontFamily:sans,
              }}>{s}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px 24px' }}>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
              <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'14px 16px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Subject</div>
                <div style={{ fontSize:'13px', color:NAVY, lineHeight:1.55, whiteSpace:'pre-wrap' }}>{ticket.reason || '—'}</div>
              </div>
              {ticket.detail && (
                <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'14px 16px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Internal notes</div>
                  <div style={{ fontSize:'13px', color:'#5C6070', lineHeight:1.55, whiteSpace:'pre-wrap' }}>{ticket.detail}</div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Raised by</div>
                  <div style={{ fontWeight:600, fontSize:'13px', color:NAVY }}>{ticket.raised_by_name || '—'}</div>
                  <div style={{ fontSize:'11px', color:'#9097A8' }}>{ticket.raised_by_email || ticket.raised_by_role || ''}</div>
                </div>
                <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Decided by</div>
                  <div style={{ fontWeight:600, fontSize:'13px', color: ticket.decided_by ? NAVY : '#9097A8' }}>{ticket.decided_by_name || 'Pending decision'}</div>
                  <div style={{ fontSize:'11px', color:'#9097A8' }}>{ticket.decided_at ? fmtDateTime(ticket.decided_at) : ''}</div>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Client</div>
                  <div style={{ fontWeight:600, fontSize:'13px', color:NAVY }}>{ticket.client_name || '—'}</div>
                  <div style={{ fontSize:'11px', color:'#9097A8' }}>{ticket.client_email || ''}</div>
                </div>
                <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Provider</div>
                  <div style={{ fontWeight:600, fontSize:'13px', color: ticket.provider_id ? NAVY : '#9097A8' }}>{ticket.provider_name || 'Unassigned'}</div>
                  <div style={{ fontSize:'11px', color:'#9097A8' }}>{ticket.provider_email || ticket.provider_role || ''}</div>
                </div>
              </div>
              <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'14px 16px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Order</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'8px' }}>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'13px', color:NAVY }}>#{ticket.order_number || ticket.order_id?.slice(0, 8)}</div>
                    <div style={{ fontSize:'11px', color:'#9097A8', textTransform:'capitalize' }}>{ticket.order_status?.replace(/_/g, ' ') || '—'} · escrow {ticket.order_escrow || '—'}</div>
                  </div>
                  <div style={{ fontWeight:700, fontSize:'15px', color:NAVY, fontVariantNumeric:'tabular-nums' }}>{fmtMoney(ticket.order_amount)}</div>
                </div>
              </div>
              {ticket.decision_notes && (
                <div style={{ background:'#EAF5EE', border:'1px solid rgba(26,107,69,0.22)', borderRadius:'8px', padding:'12px 14px' }}>
                  <div style={{ fontSize:'10px', fontWeight:700, color:GREEN, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px' }}>Decision notes</div>
                  <div style={{ fontSize:'13px', color:'#1A1F2E', lineHeight:1.55, whiteSpace:'pre-wrap' }}>{ticket.decision_notes}</div>
                </div>
              )}
            </div>
          )}

          {/* THREAD — chronological events with sender, role, timestamp */}
          {tab === 'thread' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
              <div style={{ fontSize:'12px', color:'#9097A8' }}>
                Decision events + the order conversation, oldest first.
              </div>
              {thread === null && (
                <p style={{ color:'#9097A8', fontSize:'13px', padding:'16px', textAlign:'center' }}>Loading thread…</p>
              )}
              {thread && events.length === 0 && (
                <div style={{ padding:'16px', textAlign:'center', color:'#9097A8', fontSize:'13px', background:'#F7F5F0', borderRadius:'8px' }}>
                  No conversation messages or decision events yet.
                </div>
              )}
              {events.map((evt, i) => {
                const isSystem = evt._kind === 'system' || /^ticket_/.test(evt.type || '')
                return (
                  <div key={`${evt.id || evt.type}-${i}`} style={{
                    background: isSystem ? '#FEF5E4' : '#F7F5F0',
                    border:`1px solid ${isSystem ? 'rgba(139,94,10,0.20)' : '#DDD8CE'}`,
                    borderRadius:'8px',
                    padding:'10px 14px',
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:'8px', marginBottom:'4px' }}>
                      <span style={{ fontWeight:700, fontSize:'12px', color: isSystem ? AMBER : NAVY, textTransform:'capitalize' }}>
                        {evt.actor_name || 'Unknown'}
                        {evt.actor_role && !isSystem ? ` · ${evt.actor_role}` : ''}
                        {isSystem && evt.type ? ` · ${String(evt.type).replace('ticket_', '')}` : ''}
                      </span>
                      <span style={{ fontSize:'11px', color:'#9097A8' }} title={fmtDateTime(evt.created_at)}>{ago(evt.created_at)}</span>
                    </div>
                    {evt.body && (
                      <div style={{ fontSize:'13px', color:'#5C6070', lineHeight:1.55, whiteSpace:'pre-wrap' }}>{evt.body}</div>
                    )}
                  </div>
                )
              })}

              {/* Inline reply composer — sits under the thread for context */}
              <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'12px 14px', marginTop:'4px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Reply</div>
                <textarea
                  rows={3}
                  maxLength={8000}
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  placeholder="Reply to the client and provider in the order conversation…"
                  style={{ width:'100%', boxSizing:'border-box', border:'1px solid #DDD8CE', borderRadius:'7px', padding:'10px 12px', fontSize:'13px', fontFamily:sans, lineHeight:1.55, resize:'vertical', outline:'none' }}
                />
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:'8px' }}>
                  <button
                    disabled={busy || !replyBody.trim()}
                    onClick={async () => {
                      const sent = await onReply(ticket, replyBody.trim())
                      if (sent) { setReplyBody(''); setThread(null) /* force re-fetch */ }
                    }}
                    style={{ padding:'8px 16px', borderRadius:'7px', border:'1px solid rgba(15,23,42,0.20)', background:NAVY, color:'#fff', cursor: (busy || !replyBody.trim()) ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:700, fontFamily:sans, opacity: (busy || !replyBody.trim()) ? 0.55 : 1 }}>
                    Send reply
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIONS */}
          {tab === 'actions' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* Assign — visible whether the ticket is open or closed; admins
                  may need to hand a resolved ticket to a colleague for review. */}
              <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'14px 16px' }}>
                <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Assign</div>
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
                  <select
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                    style={{ flex:'1 1 200px', padding:'9px 12px', borderRadius:'7px', border:'1px solid #DDD8CE', fontSize:'13px', fontFamily:sans, background:'#fff', cursor:'pointer' }}>
                    <option value="">Select an admin…</option>
                    {(admins || []).map(a => (
                      <option key={a.id} value={a.id}>{a.name}{a.email ? ` · ${a.email}` : ''}</option>
                    ))}
                  </select>
                  <button
                    disabled={busy || !assigneeId}
                    onClick={async () => {
                      const ok = await onAssign(ticket, assigneeId)
                      if (ok) setAssigneeId('')
                    }}
                    style={{ padding:'9px 14px', borderRadius:'7px', border:'1px solid #DDD8CE', background:'#fff', color:NAVY, cursor: (busy || !assigneeId) ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:700, fontFamily:sans, opacity: (busy || !assigneeId) ? 0.55 : 1 }}>
                    Assign
                  </button>
                </div>
                {!admins?.length && (
                  <div style={{ fontSize:'11px', color:'#9097A8', marginTop:'6px' }}>No assignable admins available.</div>
                )}
              </div>

              {/* Change status / decide. The API only accepts status changes
                  on pending tickets — once decided, this whole block is a
                  read-only confirmation. */}
              {!canDecide ? (
                <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'14px 16px' }}>
                  <div style={{ fontSize:'13px', color:'#5C6070', lineHeight:1.55 }}>
                    This ticket is already <strong style={{ color:cfg.text }}>{cfg.label.toLowerCase()}</strong>. Status changes are locked.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ background:'#F7F5F0', border:'1px solid #DDD8CE', borderRadius:'8px', padding:'14px 16px' }}>
                    <div style={{ fontSize:'10px', fontWeight:700, color:'#9097A8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'6px' }}>Decision notes <span style={{ fontWeight:400 }}>· optional, admin-private</span></div>
                    <textarea
                      rows={4}
                      maxLength={4000}
                      value={decisionNotes}
                      onChange={e => setDecisionNotes(e.target.value)}
                      placeholder="What tipped the call. Reference policy section, evidence file, etc."
                      style={{ width:'100%', boxSizing:'border-box', border:'1px solid #DDD8CE', borderRadius:'7px', padding:'10px 12px', fontSize:'13px', fontFamily:sans, lineHeight:1.55, resize:'vertical', outline:'none' }}
                    />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                    <button
                      disabled={busy}
                      onClick={() => onDecide('approved', ticket, decisionNotes)}
                      style={{ padding:'10px 16px', borderRadius:'7px', border:'1px solid rgba(26,107,69,0.30)', background:'#EAF5EE', color:GREEN, cursor: busy ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:700, fontFamily:sans, textAlign:'left' }}>
                      Approve — fire escrow action ({KIND_LABEL[ticket.kind] || ticket.kind})
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDecide('denied', ticket, decisionNotes)}
                      style={{ padding:'10px 16px', borderRadius:'7px', border:'1px solid rgba(139,26,26,0.25)', background:'#FAEAEA', color:RED, cursor: busy ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:700, fontFamily:sans, textAlign:'left' }}>
                      Deny — leave the order untouched
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDecide('cancelled', ticket, decisionNotes)}
                      style={{ padding:'10px 16px', borderRadius:'7px', border:'1px solid #DDD8CE', background:'#fff', color:'#5C6070', cursor: busy ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:600, fontFamily:sans, textAlign:'left' }}>
                      Close ticket — withdraw without action
                    </button>
                  </div>
                  <p style={{ fontSize:'11px', color:'#9097A8', lineHeight:1.55, margin:0 }}>
                    Approving void → 100% refund. refund_partial → {fmtMoneyCents(ticket.amount_cents)} refund. release_hold → balance to provider now. other → no escrow change, just a system message.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function AdminTickets() {
  const [tickets, setTickets]   = React.useState([])
  const [summary, setSummary]   = React.useState({ counts:{}, sla_breached:0, decided_this_week:0, avg_decision_hours:null })
  const [warnings, setWarnings] = React.useState([])
  const [loading, setLoading]   = React.useState(true)
  const [error, setError]       = React.useState('')
  const [busy, setBusy]         = React.useState(false)
  const [notice, setNotice]     = React.useState({ type:'', msg:'' })
  const [admins, setAdmins]     = React.useState([])

  const [statusFilter, setStatusFilter] = React.useState('open')
  const [kindFilter, setKindFilter]     = React.useState('all')
  const [searchQ, setSearchQ]   = React.useState('')
  const [debouncedQ, setDebQ]   = React.useState('')
  const [sortCol, setSortCol]   = React.useState('priority')
  const [sortDir, setSortDir]   = React.useState('desc')
  const [page, setPage]         = React.useState(1)
  const [total, setTotal]       = React.useState(0)
  const [openTicket, setOpenTicket] = React.useState(null)
  const PER_PAGE = 25

  // ── Notice / flash ─────────────────────────────────────────────────────────
  const flash = React.useCallback((type, msg) => {
    setNotice({ type, msg })
    window.setTimeout(() => setNotice({ type:'', msg:'' }), 5000)
  }, [])

  // ── Debounce search ────────────────────────────────────────────────────────
  React.useEffect(() => {
    const t = setTimeout(() => { setDebQ(searchQ); setPage(1) }, 280)
    return () => clearTimeout(t)
  }, [searchQ])

  // ── Load tickets list ──────────────────────────────────────────────────────
  // The UI filter chips don't map 1:1 to API statuses, so for "resolved"
  // (approved + denied) we fire two requests and merge. For everything else
  // it's a single request, just remapped to the API vocabulary.
  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const apiStatuses = FILTER_TO_API[statusFilter] ?? []
      const buildParams = (apiStatus) => {
        const p = new URLSearchParams()
        if (apiStatus) p.set('status', apiStatus)
        if (kindFilter !== 'all') p.set('kind', kindFilter)
        if (debouncedQ.trim()) p.set('q', debouncedQ.trim())
        p.set('page', String(page))
        p.set('page_size', String(PER_PAGE))
        // Map UI sort key → API sort key. `last_activity` → decided_at;
        // others pass through.
        p.set('sort', sortCol === 'last_activity' ? 'decided_at' : sortCol)
        p.set('dir', sortDir)
        return p
      }
      const fetchOne = async (apiStatus) => {
        const res = await fetch(`/api/admin/tickets?${buildParams(apiStatus)}`, { credentials:'same-origin' })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(j?.error?.message || j?.error || 'Failed to load tickets')
        return j
      }

      if (apiStatuses.length <= 1) {
        const j = await fetchOne(apiStatuses[0])
        const d = j?.data ?? j
        setTickets(d?.tickets || [])
        setTotal(d?.total || 0)
        setSummary(d?.summary || { counts:{}, sla_breached:0, decided_this_week:0, avg_decision_hours:null })
        setWarnings(j?.meta?.data_warnings || [])
      } else {
        // Compound filter (resolved = approved ∪ denied). Fetch both,
        // merge, sort locally and slice to page_size.
        const results = await Promise.all(apiStatuses.map(fetchOne))
        const merged = []
        let mergedTotal = 0
        const mergedWarnings = []
        let baseSummary = null
        for (const j of results) {
          const d = j?.data ?? j
          merged.push(...(d?.tickets || []))
          mergedTotal += d?.total || 0
          if (Array.isArray(j?.meta?.data_warnings)) mergedWarnings.push(...j.meta.data_warnings)
          if (!baseSummary) baseSummary = d?.summary || null
        }
        // Local sort to honour sortCol/sortDir across the merged set.
        merged.sort((a, b) => {
          const av = pickSortValue(a, sortCol)
          const bv = pickSortValue(b, sortCol)
          if (av < bv) return sortDir === 'asc' ? -1 : 1
          if (av > bv) return sortDir === 'asc' ? 1 : -1
          return 0
        })
        setTickets(merged.slice(0, PER_PAGE))
        setTotal(mergedTotal)
        setSummary(baseSummary || { counts:{}, sla_breached:0, decided_this_week:0, avg_decision_hours:null })
        setWarnings(mergedWarnings)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, kindFilter, debouncedQ, page, sortCol, sortDir])

  React.useEffect(() => { load() }, [load])

  // ── Load admins for the assign dropdown (best-effort) ──────────────────────
  React.useEffect(() => {
    let cancelled = false
    fetch('/api/admin/tickets/admins', { credentials:'same-origin' })
      .then(r => r.json()).then(j => {
        if (cancelled) return
        const list = j?.data?.admins || j?.admins || []
        setAdmins(list)
      })
      .catch(() => { if (!cancelled) setAdmins([]) })
    return () => { cancelled = true }
  }, [])

  // ── Decide action (Approve / Deny / Close) ─────────────────────────────────
  const handleDecide = async (decision, ticket, notes) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json' },
        credentials:'same-origin',
        body: JSON.stringify({ status: decision, decision_notes: notes?.trim() || null }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message || j?.error || `Could not ${decision} ticket.`)
      flash('ok', `Ticket ${decision}.`)
      setOpenTicket(null)
      await load()
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  // ── Reply (drawer thread tab) ──────────────────────────────────────────────
  // Returns true on success so the drawer can clear its textarea + refresh.
  const handleReply = async (ticket, body) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/reply`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        credentials:'same-origin',
        body: JSON.stringify({ body }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message || j?.error || 'Reply failed.')
      flash('ok', 'Reply sent.')
      return true
    } catch (e) {
      flash('err', e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // ── Assign (drawer actions tab) ────────────────────────────────────────────
  const handleAssign = async (ticket, assigneeId) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/assign`, {
        method:'PATCH',
        headers:{ 'Content-Type':'application/json' },
        credentials:'same-origin',
        body: JSON.stringify({ assignee_id: assigneeId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j?.error?.message || j?.error || 'Assign failed.')
      flash('ok', `Assigned to ${j?.data?.assignee_name || 'admin'}.`)
      await load()
      return true
    } catch (e) {
      flash('err', e.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  // ── CSV export — matches financials exportCSV pattern. ─────────────────────
  const exportCSV = () => {
    if (!tickets.length) return
    const rows = tickets.map(t => ({
      id: t.id,
      order_number: t.order_number || '',
      kind: t.kind,
      status: t.status,
      reason: t.reason,
      amount_cents: t.amount_cents ?? '',
      raised_by: t.raised_by_name || '',
      raised_by_email: t.raised_by_email || '',
      decided_by: t.decided_by_name || '',
      client: t.client_name || '',
      client_email: t.client_email || '',
      provider: t.provider_name || '',
      provider_email: t.provider_email || '',
      age_hours: t.age_hours,
      sla_breached: t.sla_breached ? 'yes' : 'no',
      created_at: t.created_at,
      decided_at: t.decided_at || '',
    }))
    const keys = Object.keys(rows[0])
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv' }))
    a.download = `tickets-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    flash('ok', 'CSV downloaded')
  }

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  // ── Top metric strip ───────────────────────────────────────────────────────
  // Maps the spec exactly:
  //   Open count             ← summary.counts.pending
  //   Avg first-response (h) ← summary.avg_decision_hours
  //   SLA breaches (>24h)    ← summary.sla_breached
  //   Resolved this week     ← summary.decided_this_week
  const openCount    = summary?.counts?.pending || 0
  const avgRespHours = summary?.avg_decision_hours
  const slaBreached  = summary?.sla_breached || 0
  const resolvedWeek = summary?.decided_this_week || 0

  const SortArrow = ({ col }) => sortCol !== col
    ? <span style={{ opacity:.25, marginLeft:'3px', fontSize:'10px' }}>⇅</span>
    : <span style={{ color:GOLD, marginLeft:'3px', fontSize:'10px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>

  // ── Count by filter chip ───────────────────────────────────────────────────
  const filterCount = (s) => {
    const c = summary?.counts || {}
    if (s === 'all') return Object.values(c).reduce((a, b) => a + b, 0)
    return FILTER_TO_API[s].reduce((sum, st) => sum + (c[st] || 0), 0)
  }

  return (
    <div style={{ padding:'28px', display:'flex', flexDirection:'column', gap:'24px', fontFamily:sans, background:'#F7F5F0', minHeight:'100vh' }}>

      {/* Page header */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.14em', color:'#9097A8', marginBottom:'4px' }}>Support</div>
          <h2 style={{ fontFamily:serif, fontWeight:600, fontSize:'34px', color:NAVY, margin:0, letterSpacing:'-0.015em', lineHeight:1.1 }}>Support Tickets</h2>
          <p style={{ color:'#9097A8', fontSize:'13px', margin:'6px 0 0', lineHeight:1.5 }}>
            Two-person decision queue. Approving fires the escrow action; denying leaves the order untouched.
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          {notice.msg && (
            <span style={{ fontSize:'12px', color: notice.type === 'ok' ? GREEN : RED, fontWeight:600 }}>{notice.msg}</span>
          )}
          <Btn variant="ghost" size="sm" onClick={exportCSV} disabled={tickets.length === 0}>↓ Export CSV</Btn>
          <Btn variant="ghost" size="sm" onClick={load}>↻ Refresh</Btn>
        </div>
      </div>

      <DataWarnings items={warnings} />

      {/* KPI strip — top metric requirements per spec */}
      <Section title="Queue Health" sub="Live across all tickets — not just the page below.">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'12px' }}>
          <KpiCard label="Open" value={fmtN(openCount)} sub="Awaiting admin decision" accent={openCount > 0 ? AMBER : GREEN} icon="🗂" />
          <KpiCard label="Avg first response" value={fmtHours(avgRespHours)} sub="Mean ticket → decision time" accent={NAVY} icon="⏱" />
          <KpiCard label="SLA breaches" value={fmtN(slaBreached)} sub="Pending more than 24h" accent={slaBreached > 0 ? RED : GREEN} icon="⚠" />
          <KpiCard label="Resolved this week" value={fmtN(resolvedWeek)} sub="Approved · denied · closed" accent={GREEN} icon="✓" />
        </div>
      </Section>

      {/* Filter + search + kind */}
      <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', alignItems:'center' }}>
          {STATUS_FILTERS.map(s => {
            const active = statusFilter === s
            return (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(1) }}
                style={{
                  padding:'6px 14px', borderRadius:'999px',
                  border:`1px solid ${active ? NAVY : '#DDD8CE'}`,
                  background: active ? NAVY : '#fff',
                  color: active ? '#fff' : '#5C6070',
                  cursor:'pointer', fontSize:'12px', fontWeight:600,
                  textTransform:'capitalize', fontFamily:sans,
                  display:'inline-flex', alignItems:'center', gap:'6px',
                }}>
                {s}
                <span style={{
                  fontSize:'10px', fontWeight:700,
                  padding:'1px 6px', borderRadius:'999px',
                  background: active ? 'rgba(255,255,255,0.18)' : '#F2EFE9',
                  color: active ? '#fff' : '#9097A8',
                }}>{filterCount(s)}</span>
              </button>
            )
          })}
        </div>

        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search subject, user name or email…"
            aria-label="Search tickets"
            style={{
              flex:'1 1 280px', maxWidth:'440px',
              padding:'9px 12px', borderRadius:'7px',
              border:'1px solid #DDD8CE', fontSize:'13px',
              fontFamily:sans, outline:'none', background:'#fff',
            }}
          />
          <select
            value={kindFilter}
            onChange={e => { setKindFilter(e.target.value); setPage(1) }}
            aria-label="Filter by ticket kind"
            style={{ padding:'9px 12px', borderRadius:'7px', border:'1px solid #DDD8CE', fontSize:'13px', fontFamily:sans, background:'#fff', cursor:'pointer' }}>
            <option value="all">All kinds</option>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <span style={{ marginLeft:'auto', fontSize:'12px', color:'#9097A8' }}>
            {total.toLocaleString()} ticket{total === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* List */}
      {error ? (
        <Card style={{ background:'#FAEAEA', border:'1px solid rgba(139,26,26,0.20)', borderRadius:'8px', padding:'20px', fontSize:'14px', color:RED }}>
          {error} — <button onClick={load} style={{ background:'none', border:'none', color:RED, cursor:'pointer', textDecoration:'underline', fontSize:'13px' }}>Retry</button>
        </Card>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #DDD8CE', borderRadius:'8px', overflow:'hidden', boxShadow:'0 1px 4px rgba(27,45,79,0.06)' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'1000px' }}>
              <thead>
                <tr>
                  {SORT_COLS.map(c => (
                    <th key={c.key}
                      onClick={c.sortable ? () => handleSort(c.key) : undefined}
                      style={{
                        padding:'11px 14px', textAlign: c.right ? 'right' : 'left',
                        fontSize:'11px', fontWeight:700, letterSpacing:'0.06em',
                        textTransform:'uppercase',
                        color: sortCol === c.key ? GOLD : 'rgba(255,255,255,0.70)',
                        background:NAVY, whiteSpace:'nowrap',
                        borderBottom:'2px solid rgba(255,255,255,0.08)',
                        cursor: c.sortable ? 'pointer' : 'default',
                        userSelect:'none',
                      }}>
                      {c.label}{c.sortable && <SortArrow col={c.key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                      {Array.from({ length: SORT_COLS.length }).map((__, j) => (
                        <td key={j} style={{ padding:'13px' }}>
                          <div style={{ height:'12px', background:'#F2EFE9', borderRadius:'3px', width: j === 1 ? '80%' : '55%' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tickets.length === 0 ? (
                  <tr><td colSpan={SORT_COLS.length} style={{ padding:'48px', textAlign:'center', color:'#9097A8', fontSize:'14px' }}>
                    No tickets in this filter.
                  </td></tr>
                ) : tickets.map((t, i) => (
                  <tr key={t.id}
                    onClick={() => setOpenTicket(t)}
                    style={{
                      background: i % 2 === 0 ? '#fff' : '#FAFAF8',
                      borderBottom:'1px solid #F2EFE9',
                      cursor:'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#F2EFE9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                    <td style={{ padding:'11px 14px', whiteSpace:'nowrap' }}>
                      <SlaBadge hours={t.age_hours} status={t.status} />
                      {t.status !== 'pending' && <span style={{ color:'#9097A8', fontSize:'12px' }}>—</span>}
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ fontWeight:600, fontSize:'13px', color:NAVY, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'260px' }} title={t.reason}>
                        {KIND_LABEL[t.kind] || t.kind}
                      </div>
                      <div style={{ fontSize:'12px', color:'#9097A8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'260px' }}>{t.reason}</div>
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:'12px', color:NAVY, fontFamily:'monospace', whiteSpace:'nowrap' }}>
                      #{t.order_number || t.order_id?.slice(0, 8)}
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ fontSize:'13px', color:NAVY, whiteSpace:'nowrap' }}>{t.raised_by_name || '—'}</div>
                      <div style={{ fontSize:'11px', color:'#9097A8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'180px' }}>{t.raised_by_email || ''}</div>
                    </td>
                    <td style={{ padding:'11px 14px' }}>
                      <div style={{ fontSize:'13px', color:NAVY, whiteSpace:'nowrap' }}>{t.client_name || '—'}</div>
                      <div style={{ fontSize:'11px', color:'#9097A8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'180px' }}>{t.client_email || ''}</div>
                    </td>
                    <td style={{ padding:'11px 14px' }}><StatusPill status={t.status} /></td>
                    <td style={{ padding:'11px 14px', textAlign:'right', fontWeight:600, fontSize:'13px', color:NAVY, fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>
                      {t.amount_cents != null ? fmtMoneyCents(t.amount_cents) : fmtMoney(t.order_amount)}
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:'12px', color:'#9097A8', whiteSpace:'nowrap' }} title={fmtDateTime(t.created_at)}>{ago(t.created_at)}</td>
                    <td style={{ padding:'11px 14px', fontSize:'12px', color:'#9097A8', whiteSpace:'nowrap' }} title={fmtDateTime(t.decided_at || t.updated_at || t.created_at)}>{ago(t.decided_at || t.updated_at || t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:'1px solid #F2EFE9', background:'#FAFAF8' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #DDD8CE', background: page === 1 ? '#F7F5F0' : '#fff', color: page === 1 ? '#9097A8' : NAVY, cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:600, fontFamily:sans }}>
                ← Prev
              </button>
              <span style={{ fontSize:'12px', color:'#9097A8' }}>Page {page} of {totalPages} · {total.toLocaleString()} total</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                style={{ padding:'6px 14px', borderRadius:'6px', border:'1px solid #DDD8CE', background: page === totalPages ? '#F7F5F0' : '#fff', color: page === totalPages ? '#9097A8' : NAVY, cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize:'13px', fontWeight:600, fontFamily:sans }}>
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {openTicket && (
        <TicketDrawer
          ticket={openTicket}
          onClose={() => setOpenTicket(null)}
          onDecide={handleDecide}
          onReply={handleReply}
          onAssign={handleAssign}
          admins={admins}
          busy={busy}
        />
      )}
    </div>
  )
}

// Picks a comparable value for a ticket given the UI sort column. Used only
// when we have to merge multi-status fetches (resolved chip) and re-sort
// locally. Falls back to created_at for any unknown column.
function pickSortValue(t, col) {
  if (col === 'created_at')    return new Date(t.created_at || 0).getTime()
  if (col === 'last_activity') return new Date(t.decided_at || t.updated_at || t.created_at || 0).getTime()
  if (col === 'priority')      return Number(t.priority || 0)
  if (col === 'status')        return String(t.status || '')
  return new Date(t.created_at || 0).getTime()
}
