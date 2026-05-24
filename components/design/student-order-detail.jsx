'use client'
import React from 'react'
import { Card, Btn, Badge, StatusBadge, ProgressBar, Avatar } from './shared'
import OrderRatingPrompt from './order-rating-prompt'

/**
 * Student → Order Detail (Fiverr-grade).
 *
 * Loads everything for one order from /api/student/orders/[id] — no reliance
 * on parent state. 4 tabs: Overview, Activity, Files, Receipt.
 *
 * Props:
 *   orderId — string
 *   onBack  — callback to return to list
 *   currency — display currency for money formatting
 */

const NAVY='#0F172A', GOLD='#9A7B3B', GREEN='#1A6B45', RED='#8B1A1A', AMBER='#8B5E0A', CYAN='#0E7C8E', PURPLE='#3D2B6B'
const BG='#F7F5F0', SURFACE='#FFFFFF', SURFACE2='#FAFAF7', BORDER='#DDD8CE', BORDER2='#F2EFE9', TEXT='#1A1F2E', MUTED='#5C6070', DIM='#9097A8'
const SERIF=`'Cormorant Garamond', Georgia, serif`
const SANS=`-apple-system, BlinkMacSystemFont, 'Inter', sans-serif`
const MONO=`'SF Mono', Menlo, Consolas, monospace`

const fmtMoneyCents = (cents, code = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: String(code || 'USD').toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .format(Number(cents || 0) / 100)
const fmtDate = s => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDateShort = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
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
  { id: 'overview', label: 'Overview', icon: '📋' },
  { id: 'activity', label: 'Activity', icon: '💬' },
  { id: 'files',    label: 'Files', icon: '📎' },
  { id: 'receipt',  label: 'Receipt', icon: '🧾' },
]

function StatChip({ label, value, accent = NAVY, sub }) {
  return (
    <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 18, color: accent, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: MUTED, fontFamily: MONO }}>{sub}</div>}
    </div>
  )
}

function EscrowBadge({ status }) {
  const cfg = {
    held:     { bg: `${AMBER}15`, color: AMBER,  label: 'Held' },
    released: { bg: `${GREEN}15`, color: GREEN,  label: 'Released' },
    refunded: { bg: `${RED}15`,   color: RED,    label: 'Refunded' },
    disputed: { bg: `${RED}15`,   color: RED,    label: 'Disputed' },
    frozen:   { bg: `${PURPLE}15`,color: PURPLE, label: 'Frozen' },
  }[status] || { bg: '#F2EFE9', color: MUTED, label: status || '—' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', background: cfg.bg, color: cfg.color }}>
      🔒 Escrow {cfg.label}
    </span>
  )
}

function Section({ title, right, children }) {
  return (
    <section style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
      {(title || right) && (
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          {title && <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: TEXT, letterSpacing: '-.01em' }}>{title}</div>}
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export default function StudentOrderDetail({ orderId, onBack, currency = 'usd' }) {
  const [tab, setTab] = React.useState('overview')
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState(null)
  const flash = (type, msg) => { setNotice({ type, msg }); setTimeout(() => setNotice(null), 4000) }

  const load = React.useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch(`/api/student/orders/${orderId}`, { credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `Failed (${r.status})`)
      setData(d)
    } catch (e) {
      setError(e.message || 'Failed to load order.')
    } finally {
      setLoading(false)
    }
  }, [orderId])

  React.useEffect(() => { load() }, [load])

  if (loading && !data) {
    return (
      <div style={{ padding: 28, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
        <div style={{ color: MUTED, fontSize: 13 }}>Loading order…</div>
      </div>
    )
  }
  if (error && !data) {
    return (
      <div style={{ padding: 28, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
        <button onClick={onBack} style={backLinkStyle}>← Back to orders</button>
        <div style={{ background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 10, padding: 18, marginTop: 14 }}>
          <div style={{ color: RED, fontWeight: 700, marginBottom: 6 }}>Couldn't load this order</div>
          <div style={{ color: MUTED, fontSize: 13, marginBottom: 12 }}>{error}</div>
          <Btn variant="secondary" size="sm" onClick={load}>Retry</Btn>
        </div>
      </div>
    )
  }
  if (!data) return null

  const order = data.order
  const { files, messages, events, milestones, scopeChanges } = data

  return (
    <div style={{ padding: '24px 28px 60px', display: 'flex', flexDirection: 'column', gap: 18, fontFamily: SANS, background: BG, minHeight: '100vh' }}>
      {/* Back */}
      <button onClick={onBack} style={backLinkStyle}>← Back to orders</button>

      {/* Header strip */}
      <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 22px', display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
            <StatusBadge status={order.status} />
            <EscrowBadge status={order.escrowStatus} />
            {order.productType === 'template' && <Badge color="purple" style={{ fontSize: 10 }}>Template</Badge>}
            {order.status === 'review' && <Badge color="orange" style={{ fontSize: 10, fontWeight: 700 }}>⚠ Action needed</Badge>}
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, color: TEXT, margin: 0, letterSpacing: '-.012em', lineHeight: 1.15 }}>{order.service}</h1>
          <div style={{ color: MUTED, fontSize: 12, marginTop: 4, fontFamily: MONO }}>
            {order.orderNumber || order.id.slice(0, 8)} · started {fmtRelative(order.createdAt)}
            {order.deadlineAt && order.status !== 'completed' && <> · due {fmtDateShort(order.deadlineAt)}</>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatChip label="Total"     value={fmtMoneyCents(order.totalCents, currency)} accent={NAVY} />
          <StatChip label="Progress"  value={`${order.progress}%`}                       accent={CYAN} sub={order.status === 'completed' ? 'completed' : 'in progress'} />
          <StatChip label="Escrow"    value={fmtMoneyCents(order.escrowAmount, currency)} accent={AMBER} sub={`${order.escrowStatus}`} />
          {order.deadlineAt && <StatChip label="Deadline" value={fmtDateShort(order.deadlineAt)} accent={order.status === 'completed' ? GREEN : NAVY} />}
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: notice.type === 'ok' ? `${GREEN}10` : `${RED}10`, color: notice.type === 'ok' ? GREEN : RED, border: `1px solid ${notice.type === 'ok' ? GREEN : RED}33` }}>
          {notice.msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${BORDER}`, marginBottom: -2 }}>
        {TABS.map(t => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', fontSize: 13, fontFamily: SANS, fontWeight: active ? 700 : 500,
              border: 'none', background: 'transparent',
              borderBottom: `2px solid ${active ? CYAN : 'transparent'}`,
              color: active ? TEXT : MUTED, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span>{t.icon}</span>{t.label}
              {t.id === 'files' && files?.length > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: DIM }}>({files.length})</span>}
              {t.id === 'activity' && (messages?.length || events?.length) > 0 && <span style={{ fontFamily: MONO, fontSize: 11, color: DIM }}>({(messages?.length || 0) + (events?.length || 0)})</span>}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className="yousafe-mobile-stack" style={{ display: 'grid', gridTemplateColumns: tab === 'overview' ? '1fr 320px' : '1fr', gap: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'overview' && <OverviewTab order={order} milestones={milestones} scopeChanges={scopeChanges} currency={currency} onAction={load} flash={flash} />}
          {tab === 'activity' && <ActivityTab orderId={order.id} messages={messages} events={events} onRefresh={load} flash={flash} />}
          {tab === 'files'    && <FilesTab orderId={order.id} files={files} onRefresh={load} flash={flash} />}
          {tab === 'receipt'  && <ReceiptTab order={order} items={data.items} services={data.services} currency={currency} />}
        </div>

        {/* Right rail — only on Overview */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {order.consultantId && (
              <Section title="Your consultant">
                <div style={{ padding: '16px 18px', display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Avatar name={order.consultant} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: TEXT, fontSize: 14 }}>{order.consultant}</div>
                    <div style={{ color: MUTED, fontSize: 11, fontFamily: MONO }}>{order.consultantEmail || 'Senior Consultant'}</div>
                  </div>
                </div>
                <div style={{ padding: '0 18px 18px' }}>
                  <Btn variant="secondary" fullWidth size="sm" onClick={() => setTab('activity')}>Open chat</Btn>
                </div>
              </Section>
            )}
            <OrderRatingPrompt orderId={order.id} />
            <Section title="Order facts">
              <div style={{ padding: '6px 18px 14px' }}>
                {[
                  ['Order #',    order.orderNumber || order.id.slice(0, 8)],
                  ['Placed',     fmtDateShort(order.createdAt)],
                  ['Deadline',   order.deadlineAt ? fmtDateShort(order.deadlineAt) : '—'],
                  ['Product',    order.productType === 'template' ? 'Digital template' : 'Consultant service'],
                  ['Category',   order.category || '—'],
                  ['Total',      fmtMoneyCents(order.totalCents, currency)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${BORDER2}`, fontSize: 12 }}>
                    <span style={{ color: MUTED }}>{k}</span>
                    <span style={{ color: TEXT, fontWeight: 600, fontFamily: MONO }}>{v}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Overview tab: progress timeline + escrow approval ─────────────────────
function OverviewTab({ order, milestones, scopeChanges, currency, onAction, flash }) {
  const isTemplate = order.productType === 'template'

  const timeline = isTemplate
    ? [
        { label: 'Template purchased',       at: order.createdAt, done: true },
        { label: 'Payment confirmed',         at: order.createdAt, done: true },
        { label: 'Digital delivery recorded', at: order.createdAt, done: true },
      ]
    : [
        { label: 'Order placed',         at: order.createdAt, done: true },
        { label: 'Consultant assigned',  at: order.createdAt, done: Boolean(order.consultantId) },
        { label: 'Work in progress',     at: null,             done: (order.progress || 0) >= 40 },
        { label: 'Delivered for review', at: order.deadlineAt, done: (order.progress || 0) >= 90 || order.status === 'review' },
        { label: 'Completed',            at: null,             done: order.status === 'completed' },
      ]

  return (
    <>
      {order.requirements && (
        <Section title="Your requirements">
          <div style={{ padding: '14px 18px', fontSize: 13, color: TEXT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {order.requirements}
          </div>
        </Section>
      )}

      <Section title="Progress">
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, fontFamily: MONO, letterSpacing: '.04em', textTransform: 'uppercase' }}>Overall</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: CYAN, fontFamily: MONO }}>{order.progress}%</span>
          </div>
          <ProgressBar value={order.progress} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
            {timeline.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: t.done ? CYAN : '#F7F5F0',
                  border: `2px solid ${t.done ? CYAN : BORDER}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: t.done ? '#fff' : DIM, fontWeight: 700, flexShrink: 0,
                }}>{t.done ? '✓' : ''}</div>
                <span style={{ flex: 1, fontSize: 13, color: t.done ? TEXT : MUTED }}>{t.label}</span>
                <span style={{ fontSize: 11, color: DIM, fontFamily: MONO }}>{t.at ? fmtDateShort(t.at) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Milestones (if milestone-based) */}
      {milestones?.length > 0 && (
        <Section title={`Milestones · ${milestones.length}`}>
          <div style={{ padding: '6px 18px 14px' }}>
            {milestones.map((m, i) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < milestones.length - 1 ? `1px solid ${BORDER2}` : 'none', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: TEXT }}>{m.title || `Milestone ${m.sequence}`}</div>
                  {m.description && <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{m.description}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: TEXT, fontWeight: 700 }}>{fmtMoneyCents(Math.round(Number(m.amount || 0) * 100), currency)}</div>
                  <Badge color={m.status === 'released' ? 'green' : m.status === 'pending' ? 'orange' : 'gray'} style={{ fontSize: 10, marginTop: 4 }}>{m.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Scope changes awaiting client approval */}
      {scopeChanges?.filter(s => s.status === 'pending').length > 0 && (
        <Section title="Scope changes needing your approval">
          <div style={{ padding: '6px 18px 14px' }}>
            {scopeChanges.filter(s => s.status === 'pending').map(s => (
              <div key={s.id} style={{ background: `${AMBER}08`, border: `1px solid ${AMBER}33`, borderRadius: 8, padding: '12px 14px', marginTop: 10 }}>
                <div style={{ fontWeight: 700, color: AMBER, fontSize: 13, marginBottom: 4 }}>{s.title || 'Scope change request'}</div>
                <div style={{ fontSize: 13, color: TEXT, marginBottom: 6, whiteSpace: 'pre-wrap' }}>{s.description}</div>
                <div style={{ fontSize: 12, color: MUTED, fontFamily: MONO }}>
                  +{fmtMoneyCents(Math.round(Number(s.amount_delta || 0) * 100), currency)} · proposed {fmtDateShort(s.created_at)}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <Btn variant="primary" size="sm" onClick={async () => {
                    try {
                      const r = await fetch(`/api/orders/${order.id}/scope-changes/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }), credentials: 'same-origin' })
                      const d = await r.json().catch(() => ({}))
                      if (!r.ok) throw new Error(d?.error?.message || 'Approve failed')
                      flash('ok', 'Scope change approved.'); onAction()
                    } catch (e) { flash('err', e.message) }
                  }}>Approve</Btn>
                  <Btn variant="secondary" size="sm" onClick={async () => {
                    try {
                      const r = await fetch(`/api/orders/${order.id}/scope-changes/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject' }), credentials: 'same-origin' })
                      const d = await r.json().catch(() => ({}))
                      if (!r.ok) throw new Error(d?.error?.message || 'Reject failed')
                      flash('ok', 'Scope change rejected.'); onAction()
                    } catch (e) { flash('err', e.message) }
                  }}>Reject</Btn>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Escrow approval — only for orders in review */}
      {order.status === 'review' && (
        <Section title="Approve delivery">
          <div style={{ padding: '16px 18px' }}>
            <div style={{ background: `${AMBER}10`, border: `1px solid ${AMBER}33`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: AMBER, fontSize: 13, marginBottom: 4 }}>⚠ Action needed</div>
              <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.55 }}>
                Your consultant marked this order as delivered. Review the work, then approve to release escrow funds — or request revisions.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Btn variant="primary" size="sm" onClick={async () => {
                try {
                  const r = await fetch(`/api/orders/${order.id}/escrow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve_delivery' }), credentials: 'same-origin' })
                  const d = await r.json().catch(() => ({}))
                  if (!r.ok) throw new Error(d?.error?.message || 'Approval failed')
                  flash('ok', 'Delivery approved — escrow released.'); onAction()
                } catch (e) { flash('err', e.message) }
              }}>✓ Approve & release</Btn>
              <Btn variant="secondary" size="sm" onClick={async () => {
                try {
                  const r = await fetch(`/api/orders/${order.id}/escrow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'request_revision' }), credentials: 'same-origin' })
                  const d = await r.json().catch(() => ({}))
                  if (!r.ok) throw new Error(d?.error?.message || 'Request failed')
                  flash('ok', 'Revision requested.'); onAction()
                } catch (e) { flash('err', e.message) }
              }}>↻ Request revisions</Btn>
              <Btn variant="danger" size="sm" onClick={async () => {
                if (!confirm('Open a dispute on this order? An admin will be assigned to review.')) return
                try {
                  const r = await fetch(`/api/orders/${order.id}/escrow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'raise_dispute' }), credentials: 'same-origin' })
                  const d = await r.json().catch(() => ({}))
                  if (!r.ok) throw new Error(d?.error?.message || 'Dispute failed')
                  flash('ok', 'Dispute raised — admin notified.'); onAction()
                } catch (e) { flash('err', e.message) }
              }}>⚠ Raise dispute</Btn>
            </div>
            {order.autoReleaseEligibleAt && (
              <div style={{ marginTop: 10, fontSize: 11, color: DIM, fontFamily: MONO }}>
                Escrow will auto-release on {fmtDateShort(order.autoReleaseEligibleAt)} if no action is taken.
              </div>
            )}
          </div>
        </Section>
      )}
    </>
  )
}

// ── Activity tab: events + messages, composer ──────────────────────────────
function ActivityTab({ orderId, messages, events, onRefresh, flash }) {
  const [text, setText] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const scrollRef = React.useRef(null)
  const fileRef = React.useRef(null)

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages?.length])

  const send = async (formData) => {
    if (!formData && !text.trim()) return
    setSending(true)
    try {
      const init = formData
        ? { method: 'POST', body: formData }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId, body: text.trim() }) }
      init.credentials = 'same-origin'
      const r = await fetch('/api/student/messages', init)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Send failed')
      setText('')
      onRefresh()
    } catch (e) { flash('err', e.message) }
    finally { setSending(false) }
  }

  const sendFile = (file) => {
    if (!file) return
    const fd = new FormData()
    fd.append('orderId', orderId)
    fd.append('file', file)
    send(fd)
  }

  // Merge messages + events chronologically
  const items = []
  for (const m of messages || []) items.push({ kind: 'message', at: m.created_at, payload: m })
  for (const e of events || [])   items.push({ kind: 'event',   at: e.created_at, payload: e })
  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return (
    <Section title="Conversation & activity">
      <div ref={scrollRef} style={{ padding: '16px 18px', maxHeight: '60vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.length === 0 && (
          <div style={{ color: MUTED, fontSize: 13, textAlign: 'center', padding: 28 }}>No activity yet. Send a message to start the conversation with your consultant.</div>
        )}
        {items.map((item, i) => {
          if (item.kind === 'event') {
            const e = item.payload
            return (
              <div key={`e-${e.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ flex: 1, height: 1, background: BORDER2 }} />
                <span style={{ fontSize: 11, color: DIM, fontFamily: MONO, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {e.event_type}{e.from_status && e.to_status ? ` · ${e.from_status} → ${e.to_status}` : ''} · {fmtRelative(e.created_at)}
                </span>
                <div style={{ flex: 1, height: 1, background: BORDER2 }} />
              </div>
            )
          }
          const m = item.payload
          const mine = m.sender_role === 'client'
          return (
            <div key={`m-${m.id}`} style={{ display: 'flex', gap: 10, flexDirection: mine ? 'row-reverse' : 'row' }}>
              <Avatar name={mine ? 'You' : 'C'} size={30} />
              <div style={{ maxWidth: '70%' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: 12, fontSize: 14, lineHeight: 1.5,
                  background: mine ? `${CYAN}15` : SURFACE2, color: TEXT,
                  border: `1px solid ${mine ? `${CYAN}33` : BORDER}`,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>{m.body}</div>
                <div style={{ fontSize: 11, color: DIM, marginTop: 4, fontFamily: MONO, textAlign: mine ? 'right' : 'left' }}>
                  {fmtDate(m.created_at)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${BORDER2}`, display: 'flex', gap: 8 }}>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => sendFile(e.target.files?.[0])} />
        <Btn variant="secondary" size="sm" disabled={sending} onClick={() => fileRef.current?.click()}>📎 Attach</Btn>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Type a message…"
          disabled={sending}
          style={{ flex: 1, padding: '10px 14px', background: SURFACE2, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 14, fontFamily: SANS, outline: 'none' }}
        />
        <Btn variant="primary" size="sm" disabled={sending || !text.trim()} onClick={() => send()}>{sending ? 'Sending…' : 'Send'}</Btn>
      </div>
    </Section>
  )
}

// ── Files tab ───────────────────────────────────────────────────────────────
function FilesTab({ orderId, files, onRefresh, flash }) {
  const fileRef = React.useRef(null)
  const [uploading, setUploading] = React.useState(false)

  const upload = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch(`/api/student/orders/${orderId}/files`, { method: 'POST', body: fd, credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Upload failed')
      flash('ok', 'File uploaded.')
      onRefresh()
    } catch (e) { flash('err', e.message) }
    finally { setUploading(false) }
  }

  const remove = async (id) => {
    if (!confirm('Delete this file?')) return
    try {
      const r = await fetch(`/api/student/orders/${orderId}/files?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || 'Delete failed')
      flash('ok', 'File deleted.')
      onRefresh()
    } catch (e) { flash('err', e.message) }
  }

  return (
    <Section title={`Files · ${files?.length || 0}`} right={
      <>
        <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={e => upload(e.target.files?.[0])} />
        <Btn variant="primary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : '+ Upload file'}</Btn>
      </>
    }>
      {(!files || files.length === 0) ? (
        <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>
          No files yet. Upload transcripts, IDs, or supporting docs to share with your consultant.
        </div>
      ) : (
        <div style={{ padding: '6px 18px 14px' }}>
          {files.map((f, i) => {
            const mine = f.uploader_role === 'client'
            const sizeKb = f.size_bytes ? Math.max(1, Math.round(f.size_bytes / 1024)) : null
            return (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: i < files.length - 1 ? `1px solid ${BORDER2}` : 'none' }}>
                <span style={{ fontSize: 22 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                  <div style={{ fontSize: 11, color: DIM, fontFamily: MONO }}>
                    {mine ? 'You' : 'Consultant'} · {fmtRelative(f.created_at)}{sizeKb ? ` · ${sizeKb} KB` : ''}
                  </div>
                </div>
                {f.url && <a href={f.url} target="_blank" rel="noreferrer" style={{ color: CYAN, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Open ↗</a>}
                {mine && <button onClick={() => remove(f.id)} style={{ background: 'none', border: 'none', color: RED, cursor: 'pointer', fontSize: 18, padding: '0 6px' }}>×</button>}
              </div>
            )
          })}
        </div>
      )}
    </Section>
  )
}

// ── Receipt tab ─────────────────────────────────────────────────────────────
function ReceiptTab({ order, items, services, currency }) {
  const serviceById = new Map((services || []).map(s => [s.id, s]))
  return (
    <Section title="Receipt">
      <div style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: DIM, fontFamily: MONO }}>Receipt for</div>
            <div style={{ fontFamily: SERIF, fontSize: 22, fontWeight: 600, color: TEXT, marginTop: 2 }}>{order.service}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: DIM, fontFamily: MONO }}>{order.orderNumber || order.id.slice(0, 8)}</div>
            <div style={{ fontSize: 11, color: DIM, fontFamily: MONO }}>{fmtDateShort(order.createdAt)}</div>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, padding: '12px 0', display: 'grid', gap: 10 }}>
          {(items || []).map((it, idx) => {
            const svc = serviceById.get(it.service_id)
            const lineCents = Math.round(Number(it.unit_price || 0) * 100 * Number(it.quantity || 1))
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <div>
                  <div style={{ color: TEXT, fontWeight: 600 }}>{svc?.title || 'Item'}</div>
                  <div style={{ color: MUTED, fontSize: 11, fontFamily: MONO }}>qty {it.quantity || 1}</div>
                </div>
                <div style={{ fontFamily: MONO, color: TEXT }}>{fmtMoneyCents(lineCents, currency)}</div>
              </div>
            )
          })}
          {(!items || items.length === 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <div style={{ color: TEXT, fontWeight: 600 }}>{order.service}</div>
              <div style={{ fontFamily: MONO, color: TEXT }}>{fmtMoneyCents(order.totalCents, currency)}</div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 0', display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700 }}>
          <span style={{ color: TEXT }}>Total paid</span>
          <span style={{ color: NAVY, fontFamily: MONO }}>{fmtMoneyCents(order.totalCents, currency)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, fontSize: 12 }}>
          <div style={{ background: SURFACE2, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, fontFamily: MONO, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Escrow held</div>
            <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 18, color: AMBER }}>{fmtMoneyCents(order.escrowAmount, currency)}</div>
          </div>
          <div style={{ background: SURFACE2, border: `1px solid ${BORDER2}`, borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: DIM, fontFamily: MONO, letterSpacing: '.10em', textTransform: 'uppercase', marginBottom: 4 }}>Released to consultant</div>
            <div style={{ fontFamily: SERIF, fontWeight: 600, fontSize: 18, color: GREEN }}>{fmtMoneyCents(order.escrowReleasedAmount, currency)}</div>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: DIM, fontFamily: MONO, lineHeight: 1.5 }}>
          {order.termsAcceptedAt && <>Terms accepted {fmtDateShort(order.termsAcceptedAt)} · </>}
          {order.refundPolicyAcceptedAt && <>Refund policy accepted {fmtDateShort(order.refundPolicyAcceptedAt)}</>}
        </div>

        <div style={{ marginTop: 14 }}>
          <Btn variant="secondary" size="sm" onClick={() => window.print()}>🖨 Print receipt</Btn>
        </div>
      </div>
    </Section>
  )
}

const backLinkStyle = {
  background: 'none', border: 'none', color: MUTED, cursor: 'pointer',
  fontSize: 13, fontFamily: SANS, padding: 0, alignSelf: 'flex-start',
}
