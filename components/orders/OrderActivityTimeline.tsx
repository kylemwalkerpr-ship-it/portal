'use client'

import React from 'react'
import { openOrderMessengerDock } from './OrderMessengerDock'

type FeedKind = 'workflow' | 'payment' | 'message' | 'file' | 'scope' | 'milestone'

type FeedEntry = {
  key: string
  kind: FeedKind
  title: string
  detail?: string | null
  actor?: string | null
  at?: string | null
  status?: string | null
  icon: string
}

const INK = '#111827'
const MID = '#475569'
const SOFT = '#64748B'
const RULE = '#E2E8F0'
const PAPER = '#FFFFFF'
const BG = '#F8FAFC'
const GREEN = '#217A4A'
const AMBER = '#9A6700'
const RED = '#B42318'
const INDIGO = '#4338CA'

const cleanStatus = (value: unknown) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_')

function fmtDate(value?: string | null) {
  if (!value) return 'Current state'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Current state'
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function actorLabel(role: unknown) {
  const value = cleanStatus(role)
  if (value === 'client' || value === 'student') return 'Client'
  if (value === 'attorney') return 'Attorney'
  if (value === 'consultant' || value === 'provider') return 'Provider'
  if (value === 'admin') return 'YouSafe'
  return value ? value.replace(/_/g, ' ') : null
}

function transitionTitle(from: unknown, to: unknown, note: unknown) {
  const previous = cleanStatus(from)
  const next = cleanStatus(to)
  const copy = String(note || '').toLowerCase()
  if (copy.includes('progress updated') || copy.includes('progress set')) return 'Progress updated'
  if (next === 'created') return 'Order placed'
  if (next === 'queued' || next === 'pending') return 'Waiting for provider'
  if (next === 'in_progress' || next === 'active') return previous === 'revision_requested' ? 'Revision work resumed' : 'Work started'
  if (next === 'under_review' || next === 'review' || next === 'delivered') return 'Delivery submitted for review'
  if (next === 'revision_requested') return 'Revisions requested'
  if (next === 'completed' || next === 'released') return 'Delivery accepted'
  if (next === 'cancelled') return 'Order cancelled'
  if (next === 'refunded') return 'Order refunded'
  if (next === 'disputed') return 'Dispute opened'
  return next ? `Order moved to ${next.replace(/_/g, ' ')}` : 'Order updated'
}

function statusTone(status: unknown) {
  const value = cleanStatus(status)
  if (['completed', 'released', 'approved'].includes(value)) return GREEN
  if (['cancelled', 'refunded', 'disputed', 'rejected'].includes(value)) return RED
  if (['under_review', 'review', 'delivered', 'revision_requested'].includes(value)) return AMBER
  if (['in_progress', 'active', 'submitted'].includes(value)) return INDIGO
  return SOFT
}

function currentCopy(status: unknown, progress: unknown) {
  const value = cleanStatus(status)
  if (value === 'created' || value === 'queued' || value === 'pending' || value === 'new') return 'The order is funded and waiting for the provider to start work.'
  if (value === 'in_progress' || value === 'active') return `Work is underway${Number(progress || 0) > 0 ? ` · ${Number(progress)}% recorded` : ''}. Updates, files and milestones appear below.`
  if (value === 'under_review' || value === 'review' || value === 'delivered') return 'The provider has submitted work for review. The client can accept it or request revisions.'
  if (value === 'revision_requested') return 'The client requested changes. The provider can revise and submit a new delivery for review.'
  if (value === 'completed' || value === 'released') return 'The delivery was accepted and the order reached its completed state.'
  if (value === 'cancelled') return 'This order was cancelled. The activity log below preserves what happened before cancellation.'
  if (value === 'refunded') return 'This order was refunded. The financial and workflow history remains visible below.'
  if (value === 'disputed') return 'This order is in dispute. Workflow history and supporting activity remain recorded below.'
  return `Current order state: ${value || 'open'}.`
}

function buildEntries(data: any): FeedEntry[] {
  if (!data?.order) return []
  const entries: FeedEntry[] = []
  const transitionKeys = new Set<string>()
  const order = data.order

  const push = (entry: FeedEntry) => entries.push(entry)

  for (const event of data.orderEvents || []) {
    const transitionKey = `${cleanStatus(event.from_status)}>${cleanStatus(event.to_status)}`
    transitionKeys.add(transitionKey)
    push({
      key: `event:${event.id}`,
      kind: 'workflow',
      title: transitionTitle(event.from_status, event.to_status, event.note),
      detail: event.note || null,
      actor: actorLabel(event.actor_role),
      at: event.created_at,
      status: event.to_status,
      icon: cleanStatus(event.to_status) === 'revision_requested' ? '↻' : cleanStatus(event.to_status) === 'completed' ? '✓' : '◆',
    })
  }

  for (const item of data.statusHistory || []) {
    const transitionKey = `${cleanStatus(item.from_status)}>${cleanStatus(item.to_status)}`
    if (transitionKeys.has(transitionKey)) continue
    transitionKeys.add(transitionKey)
    push({
      key: `history:${item.id}`,
      kind: 'workflow',
      title: transitionTitle(item.from_status, item.to_status, item.note),
      detail: item.note || null,
      actor: null,
      at: item.created_at,
      status: item.to_status,
      icon: cleanStatus(item.to_status) === 'revision_requested' ? '↻' : cleanStatus(item.to_status) === 'completed' ? '✓' : '◆',
    })
  }

  if (!transitionKeys.has('>created') && order.createdAt) {
    push({
      key: 'synthetic:created',
      kind: 'workflow',
      title: 'Order placed',
      detail: 'The order was created and the workroom opened for both parties.',
      actor: 'Client',
      at: order.createdAt,
      status: 'created',
      icon: '◆',
    })
  }

  if (order.escrowStatus && order.escrowStatus !== 'none' && Number(order.totalAmount || order.escrowAmount || 0) > 0) {
    const hasFundingEvent = (data.escrowEvents || []).some((event: any) =>
      ['funded', 'hold', 'held', 'payment_captured', 'escrow_funded'].includes(cleanStatus(event.event_type)),
    )
    if (!hasFundingEvent) {
      push({
        key: 'synthetic:escrow-funded',
        kind: 'payment',
        title: 'Payment protected in escrow',
        detail: 'Funds are held by the platform while the provider completes the agreed work.',
        actor: 'YouSafe',
        at: order.createdAt,
        status: order.escrowStatus,
        icon: '🔒',
      })
    }
  }

  for (const event of data.escrowEvents || []) {
    const type = cleanStatus(event.event_type)
    const title = type === 'client_release'
      ? 'Escrow released after approval'
      : type === 'dispute_opened'
        ? 'Escrow placed in dispute'
        : type.includes('refund')
          ? 'Escrow refunded'
          : type.includes('release')
            ? 'Escrow released'
            : 'Escrow updated'
    push({
      key: `escrow:${event.id}`,
      kind: 'payment',
      title,
      detail: event.reason || null,
      actor: actorLabel(event.actor_role),
      at: event.created_at,
      status: type,
      icon: type.includes('dispute') ? '!' : type.includes('release') ? '✓' : '🔒',
    })
  }

  for (const milestone of data.milestones || []) {
    const status = cleanStatus(milestone.status || 'pending')
    const at = milestone.released_at || milestone.approved_at || milestone.rejected_at || milestone.submitted_at || milestone.updated_at || milestone.created_at
    const title = status === 'released'
      ? `Milestone released · ${milestone.title || 'Milestone'}`
      : status === 'approved'
        ? `Milestone approved · ${milestone.title || 'Milestone'}`
        : status === 'submitted'
          ? `Milestone submitted · ${milestone.title || 'Milestone'}`
          : status === 'rejected'
            ? `Milestone changes requested · ${milestone.title || 'Milestone'}`
            : status === 'in_progress'
              ? `Milestone in progress · ${milestone.title || 'Milestone'}`
              : `Milestone scheduled · ${milestone.title || 'Milestone'}`
    push({
      key: `milestone:${milestone.id}:${status}`,
      kind: 'milestone',
      title,
      detail: milestone.rejection_reason || milestone.description || null,
      actor: null,
      at,
      status,
      icon: status === 'rejected' ? '↻' : status === 'approved' || status === 'released' ? '✓' : '◇',
    })
  }

  for (const change of data.scopeChanges || []) {
    const status = cleanStatus(change.status || 'pending')
    const title = status === 'approved' || status === 'accepted'
      ? 'Scope change approved'
      : status === 'rejected' || status === 'declined'
        ? 'Scope change declined'
        : status === 'applied'
          ? 'Scope change applied'
          : 'Scope change requested'
    push({
      key: `scope:${change.id}:${status}`,
      kind: 'scope',
      title,
      detail: change.reason || (change.change_type ? String(change.change_type).replace(/_/g, ' ') : null),
      actor: actorLabel(change.requested_by_role),
      at: change.applied_at || change.client_decision_at || change.updated_at || change.created_at,
      status,
      icon: status === 'rejected' || status === 'declined' ? '×' : status === 'approved' || status === 'applied' ? '✓' : '±',
    })
  }

  for (const file of data.files || []) {
    push({
      key: `file:${file.id}`,
      kind: 'file',
      title: 'File shared',
      detail: file.name || 'Order file',
      actor: actorLabel(file.uploader_role),
      at: file.created_at,
      status: null,
      icon: '📎',
    })
  }

  for (const message of data.messages || []) {
    const body = String(message.body || '').trim()
    if (!body && !message.attachment_name) continue
    push({
      key: `message:${message.source || 'message'}:${message.id}`,
      kind: 'message',
      title: message.attachment_name && !body ? 'Attachment sent in Messenger' : 'Message sent in Messenger',
      detail: body ? (body.length > 180 ? `${body.slice(0, 177)}…` : body) : message.attachment_name,
      actor: actorLabel(message.sender_role),
      at: message.created_at,
      status: null,
      icon: '💬',
    })
  }

  const rank: Record<FeedKind, number> = { workflow: 1, payment: 2, milestone: 3, scope: 4, file: 5, message: 6 }
  return entries.sort((a, b) => {
    const aTime = a.at ? new Date(a.at).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.at ? new Date(b.at).getTime() : Number.MAX_SAFE_INTEGER
    if (aTime !== bTime) return aTime - bTime
    return rank[a.kind] - rank[b.kind]
  })
}

function Pipeline({ data }: { data: any }) {
  const order = data?.order || {}
  const status = cleanStatus(order.status)
  const statuses = new Set<string>([
    status,
    ...(data?.orderEvents || []).flatMap((e: any) => [cleanStatus(e.from_status), cleanStatus(e.to_status)]),
    ...(data?.statusHistory || []).flatMap((e: any) => [cleanStatus(e.from_status), cleanStatus(e.to_status)]),
  ].filter(Boolean))

  const final = ['completed', 'released'].some((s) => statuses.has(s))
  const hasReview = final || ['under_review', 'review', 'delivered', 'revision_requested'].some((s) => statuses.has(s))
  const hasDelivery = final || ['under_review', 'review', 'delivered', 'revision_requested'].some((s) => statuses.has(s))
  const hasStarted = hasDelivery || Number(order.progress || 0) > 0 || ['in_progress', 'active'].some((s) => statuses.has(s))
  const revisionActive = status === 'revision_requested'

  const stages = [
    { label: 'Order placed', complete: true, active: !hasStarted && !['cancelled', 'refunded'].includes(status), sub: 'Funded & opened' },
    { label: 'Work started', complete: hasStarted, active: hasStarted && !hasDelivery, sub: 'Provider working' },
    { label: 'Delivery submitted', complete: hasDelivery, active: hasDelivery && !final && !revisionActive, sub: 'Ready for review' },
    { label: 'Review & revisions', complete: final, active: revisionActive || (hasReview && !final), sub: revisionActive ? 'Changes requested' : 'Client review' },
    { label: 'Accepted & released', complete: final, active: final, sub: 'Order complete' },
  ]

  return (
    <div className="ys-order-pipeline" aria-label="Order pipeline">
      {stages.map((stage, index) => (
        <div key={stage.label} className={`ys-order-stage ${stage.complete ? 'is-complete' : ''} ${stage.active ? 'is-active' : ''}`}>
          <div className="ys-order-stage-top">
            <span className="ys-order-stage-dot">{stage.complete ? '✓' : index + 1}</span>
            {index < stages.length - 1 && <span className="ys-order-stage-line" />}
          </div>
          <strong>{stage.label}</strong>
          <small>{stage.sub}</small>
        </div>
      ))}
    </div>
  )
}

export default function OrderActivityTimeline({ orderId, embedded = false }: { orderId: string; embedded?: boolean }) {
  const [data, setData] = React.useState<any>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | FeedKind>('all')

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/activity`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || 'Could not load order activity.')
      setData(payload)
      setError('')
    } catch (e: any) {
      setError(e?.message || 'Could not load order activity.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [orderId])

  React.useEffect(() => { void load(false) }, [load])
  React.useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true)
    }, 20000)
    const onFocus = () => void load(true)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const entries = React.useMemo(() => buildEntries(data), [data])
  const filtered = filter === 'all' ? entries : entries.filter((entry) => entry.kind === filter)
  const revisionCount = React.useMemo(() => entries.filter((entry) =>
    entry.title.toLowerCase().includes('revision') || entry.title.toLowerCase().includes('changes requested'),
  ).length, [entries])

  const status = data?.order?.status || 'open'
  const totalActivity = entries.length

  return (
    <section className={`ys-order-activity-workroom ${embedded ? 'is-embedded' : ''}`}>
      <style>{`
        .ys-order-activity-workroom {
          font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
          color: ${INK};
          background: ${BG};
        }
        .ys-order-activity-workroom.is-embedded { background: transparent; }
        .ys-order-activity-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 20px;
          border: 1px solid ${RULE};
          border-radius: 14px;
          background: ${PAPER};
          box-shadow: 0 1px 2px rgba(15,23,42,.03);
        }
        .ys-order-activity-head h2 { margin: 0 0 6px; font: 650 23px/1.18 Georgia, 'Times New Roman', serif; letter-spacing: -.015em; }
        .ys-order-activity-head p { margin: 0; color: ${MID}; font-size: 13px; line-height: 1.55; max-width: 720px; }
        .ys-order-activity-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .ys-order-activity-actions button {
          border: 1px solid ${INK};
          border-radius: 999px;
          padding: 9px 15px;
          background: ${INK};
          color: #fff;
          font: 700 12px/1.2 inherit;
          cursor: pointer;
          white-space: nowrap;
        }
        .ys-order-activity-actions button.secondary { background: #fff; color: ${INK}; border-color: ${RULE}; }
        .ys-order-current {
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid ${RULE};
          background: ${PAPER};
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12.5px;
          color: ${MID};
        }
        .ys-order-current strong { color: ${INK}; text-transform: capitalize; }
        .ys-order-current-dot { width: 9px; height: 9px; border-radius: 999px; flex: 0 0 9px; }
        .ys-order-pipeline {
          margin-top: 12px;
          padding: 18px 16px 16px;
          border: 1px solid ${RULE};
          border-radius: 14px;
          background: ${PAPER};
          display: grid;
          grid-template-columns: repeat(5, minmax(142px, 1fr));
          overflow-x: auto;
        }
        .ys-order-stage { min-width: 142px; padding: 0 8px; color: ${SOFT}; }
        .ys-order-stage-top { display: flex; align-items: center; margin-bottom: 8px; }
        .ys-order-stage-dot {
          width: 26px; height: 26px; border-radius: 999px; display: grid; place-items: center;
          border: 1px solid ${RULE}; background: #fff; font-size: 11px; font-weight: 800; flex: 0 0 26px;
        }
        .ys-order-stage-line { height: 2px; flex: 1; background: ${RULE}; margin-left: 6px; }
        .ys-order-stage strong { display: block; color: inherit; font-size: 12px; line-height: 1.25; }
        .ys-order-stage small { display: block; margin-top: 3px; font-size: 10px; line-height: 1.3; color: ${SOFT}; }
        .ys-order-stage.is-complete { color: ${GREEN}; }
        .ys-order-stage.is-complete .ys-order-stage-dot { background: ${GREEN}; border-color: ${GREEN}; color: #fff; }
        .ys-order-stage.is-complete .ys-order-stage-line { background: color-mix(in srgb, ${GREEN} 55%, ${RULE}); }
        .ys-order-stage.is-active { color: ${INDIGO}; }
        .ys-order-stage.is-active .ys-order-stage-dot { border-color: ${INDIGO}; box-shadow: 0 0 0 3px rgba(67,56,202,.09); }
        .ys-order-activity-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .ys-order-activity-stat { border: 1px solid ${RULE}; border-radius: 10px; background: #fff; padding: 11px 13px; }
        .ys-order-activity-stat span { display: block; color: ${SOFT}; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
        .ys-order-activity-stat strong { display: block; margin-top: 3px; font-size: 17px; line-height: 1.2; color: ${INK}; }
        .ys-order-activity-filters { display: flex; gap: 7px; flex-wrap: wrap; margin: 16px 0 10px; }
        .ys-order-activity-filters button {
          border: 1px solid ${RULE}; border-radius: 999px; background: #fff; color: ${MID};
          padding: 7px 11px; font: 650 11px/1.2 inherit; cursor: pointer;
        }
        .ys-order-activity-filters button.is-active { border-color: ${INK}; background: ${INK}; color: #fff; }
        .ys-order-timeline { border: 1px solid ${RULE}; border-radius: 14px; background: #fff; overflow: hidden; }
        .ys-order-timeline-empty { padding: 30px; text-align: center; color: ${SOFT}; font-size: 13px; }
        .ys-order-event { display: grid; grid-template-columns: 42px minmax(0,1fr) auto; gap: 12px; padding: 15px 18px; border-bottom: 1px solid #EEF2F7; }
        .ys-order-event:last-child { border-bottom: 0; }
        .ys-order-event-icon { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: #F1F5F9; font-size: 15px; color: ${INK}; }
        .ys-order-event-main { min-width: 0; }
        .ys-order-event-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; font-weight: 750; color: ${INK}; }
        .ys-order-event-chip { border-radius: 999px; padding: 2px 7px; background: #F1F5F9; color: ${SOFT}; font-size: 9px; letter-spacing: .05em; text-transform: uppercase; }
        .ys-order-event-detail { margin-top: 4px; color: ${MID}; font-size: 12.5px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
        .ys-order-event-meta { margin-top: 5px; color: ${SOFT}; font-size: 10.5px; }
        .ys-order-event-time { color: ${SOFT}; font-size: 10.5px; white-space: nowrap; padding-top: 2px; }
        .ys-order-activity-error { border: 1px solid rgba(180,35,24,.22); background: rgba(180,35,24,.04); color: ${RED}; border-radius: 10px; padding: 14px; font-size: 12px; }
        @media (max-width: 760px) {
          .ys-order-activity-head { flex-direction: column; padding: 16px; }
          .ys-order-activity-actions { width: 100%; justify-content: flex-start; }
          .ys-order-activity-stats { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .ys-order-event { grid-template-columns: 36px minmax(0,1fr); padding: 13px 14px; gap: 9px; }
          .ys-order-event-time { grid-column: 2; padding-top: 0; white-space: normal; }
        }
      `}</style>

      <div className="ys-order-activity-head">
        <div>
          <h2>Order activity & pipeline</h2>
          <p>
            A single chronological workroom for order creation, work start, delivery, revisions, files, scope changes, approval and escrow release. Chat stays in Messenger so workflow history cannot be lost inside a conversation thread.
          </p>
        </div>
        <div className="ys-order-activity-actions">
          <button type="button" onClick={() => openOrderMessengerDock(orderId)}>💬 Open Messenger</button>
          <button type="button" className="secondary" onClick={() => void load(false)}>↻ Refresh</button>
        </div>
      </div>

      {error && <div className="ys-order-activity-error" style={{ marginTop: 12 }}>{error}</div>}
      {loading && !data ? (
        <div className="ys-order-timeline" style={{ marginTop: 12 }}><div className="ys-order-timeline-empty">Loading the order workroom…</div></div>
      ) : data ? (
        <>
          <div className="ys-order-current">
            <span className="ys-order-current-dot" style={{ background: statusTone(status) }} />
            <span><strong>{String(status).replace(/_/g, ' ')}</strong> · {currentCopy(status, data.order?.progress)}</span>
          </div>
          <Pipeline data={data} />
          <div className="ys-order-activity-stats">
            <div className="ys-order-activity-stat"><span>Recorded activity</span><strong>{totalActivity}</strong></div>
            <div className="ys-order-activity-stat"><span>Revisions / changes</span><strong>{revisionCount}</strong></div>
            <div className="ys-order-activity-stat"><span>Shared files</span><strong>{data.files?.length || 0}</strong></div>
            <div className="ys-order-activity-stat"><span>Messages</span><strong>{data.messages?.length || 0}</strong></div>
          </div>

          <div className="ys-order-activity-filters" aria-label="Filter order activity">
            {([
              ['all', 'All activity'],
              ['workflow', 'Workflow'],
              ['milestone', 'Milestones'],
              ['scope', 'Scope'],
              ['file', 'Files'],
              ['message', 'Messages'],
              ['payment', 'Escrow'],
            ] as Array<[typeof filter, string]>).map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>

          <div className="ys-order-timeline">
            {filtered.length === 0 ? (
              <div className="ys-order-timeline-empty">No activity in this category yet.</div>
            ) : filtered.map((entry) => (
              <article key={entry.key} className="ys-order-event">
                <div className="ys-order-event-icon" aria-hidden="true">{entry.icon}</div>
                <div className="ys-order-event-main">
                  <div className="ys-order-event-title">
                    <span>{entry.title}</span>
                    <span className="ys-order-event-chip">{entry.kind}</span>
                    {entry.status && <span className="ys-order-event-chip" style={{ color: statusTone(entry.status) }}>{String(entry.status).replace(/_/g, ' ')}</span>}
                  </div>
                  {entry.detail && <div className="ys-order-event-detail">{entry.detail}</div>}
                  {entry.actor && <div className="ys-order-event-meta">By {entry.actor}</div>}
                </div>
                <time className="ys-order-event-time">{fmtDate(entry.at)}</time>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
