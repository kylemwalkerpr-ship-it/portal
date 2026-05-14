'use client'

import React from 'react'

/**
 * OrderEscrowPanel — client/student-facing view of order escrow.
 *
 * Mirrors what the admin sees, scoped to one order:
 *   - Held / released / refunded amounts
 *   - Auto-release countdown (so the client knows when funds release if they don't act)
 *   - Milestones (with approve/reject when status='submitted')
 *   - Pending scope changes (with approve/reject buttons — client-only action)
 *   - Recent escrow events timeline
 *
 * Usage:
 *   <OrderEscrowPanel orderId={order.id} />
 *
 * Backed by GET  /api/orders/[id]/escrow
 *              PATCH /api/orders/[id]/scope-changes/[scope_change_id]
 */

interface EscrowOrder {
  id: string
  status: string
  escrow_status: string
  escrow_amount: number
  escrow_released_amount: number
  escrow_refunded_amount: number
  auto_release_eligible_at?: string | null
  order_number?: string
}

interface Milestone {
  id: string
  sequence: number
  title: string
  description?: string
  amount: number
  due_date?: string
  status: string
}

interface ScopeChange {
  id: string
  requested_by_role?: string
  change_type: string
  amount_delta: number
  reason: string
  status: string
  created_at: string
  expires_at?: string
}

interface EscrowEvent {
  event_type: string
  amount: number | null
  balance_after: number
  reason?: string
  actor_role?: string
  created_at: string
}

interface EscrowPayload {
  order: EscrowOrder
  milestones: Milestone[]
  pending_scope_changes: ScopeChange[]
  events: EscrowEvent[]
}

const fmt$ = (v: number | string | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(Number(v) || 0)

const ago = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

const daysUntil = (s: string | null | undefined) => {
  if (!s) return null
  return Math.ceil((new Date(s).getTime() - Date.now()) / 86400000)
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; label: string; icon: string }> = {
  held:             { bg: '#FEF5E4', fg: '#8B5E0A', label: 'Held in Escrow',  icon: '🔒' },
  partial_released: { bg: '#E0F3F7', fg: '#0E7C8E', label: 'Partial Released', icon: '⚡' },
  released:         { bg: '#EAF5EE', fg: '#1A6B45', label: 'Released',         icon: '✓' },
  disputed:         { bg: '#FAEAEA', fg: '#8B1A1A', label: 'Disputed',         icon: '⚠' },
  frozen:           { bg: '#F5F3FF', fg: '#3D2B6B', label: 'Frozen',           icon: '🧊' },
  refunded:         { bg: '#F2EFE9', fg: '#5C6070', label: 'Refunded',         icon: '↩' },
}

export default function OrderEscrowPanel({ orderId }: { orderId: string }) {
  const [data, setData]       = React.useState<EscrowPayload | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState('')
  const [busyId, setBusyId]   = React.useState<string | null>(null)
  const [notice, setNotice]   = React.useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [rejectModal, setRejectModal] = React.useState<ScopeChange | null>(null)
  const [rejectReason, setRejectReason] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/orders/${orderId}/escrow`, { credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Could not load escrow info')
      setData((json?.data ?? json) as EscrowPayload)
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [orderId])

  React.useEffect(() => { load() }, [load])

  const flash = (type: 'ok' | 'err', msg: string) => {
    setNotice({ type, msg })
    setTimeout(() => setNotice(null), 5000)
  }

  const decideScope = async (sc: ScopeChange, action: 'approve' | 'reject', reason?: string) => {
    setBusyId(sc.id)
    try {
      const res = await fetch(`/api/orders/${orderId}/scope-changes/${sc.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || '' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error?.message || json?.error || 'Action failed')
      flash('ok', action === 'approve'
        ? `Approved. ${sc.amount_delta >= 0 ? '+' : ''}${fmt$(sc.amount_delta)} added to your order.`
        : 'Scope change rejected.')
      setRejectModal(null)
      setRejectReason('')
      await load()
    } catch (e: any) {
      flash('err', e.message)
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: 8, padding: 24, fontSize: 13, color: '#9097A8' }}>
        Loading escrow status…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,.22)', borderRadius: 8, padding: 16, fontSize: 13, color: '#8B1A1A' }}>
        {error} · <button onClick={load} style={{ background: 'none', border: 'none', color: '#8B1A1A', textDecoration: 'underline', cursor: 'pointer' }}>Retry</button>
      </div>
    )
  }

  if (!data) return null

  const { order, milestones, pending_scope_changes, events } = data
  const statusCfg = STATUS_COLOR[order.escrow_status || 'held'] || STATUS_COLOR.held
  const autoReleaseDays = daysUntil(order.auto_release_eligible_at)
  const totalEverHeld = (Number(order.escrow_amount) || 0) + (Number(order.escrow_released_amount) || 0) + (Number(order.escrow_refunded_amount) || 0)

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" }}>

      {/* Notice */}
      {notice && (
        <div style={{ padding: '10px 14px', borderRadius: 7, marginBottom: 12, fontSize: 13, fontWeight: 600, background: notice.type === 'ok' ? '#EAF5EE' : '#FAEAEA', color: notice.type === 'ok' ? '#1A6B45' : '#8B1A1A' }}>
          {notice.type === 'ok' ? '✓' : '!'} {notice.msg}
        </div>
      )}

      {/* Status header */}
      <div style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.fg}22`, borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: statusCfg.fg, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>
              {statusCfg.icon} {statusCfg.label}
            </div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 22, color: '#1B2D4F', letterSpacing: '-.01em' }}>
              {fmt$(order.escrow_amount)}
            </div>
            <div style={{ fontSize: 12, color: '#5C6070', marginTop: 2 }}>currently held in escrow</div>
          </div>
          {order.escrow_status === 'held' && autoReleaseDays !== null && autoReleaseDays > 0 && (
            <div style={{ background: 'rgba(255,255,255,.65)', padding: '10px 14px', borderRadius: 7, textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7A4D08', textTransform: 'uppercase', letterSpacing: '.06em' }}>⏰ Auto-release in</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 22, color: '#1B2D4F' }}>{autoReleaseDays} day{autoReleaseDays !== 1 ? 's' : ''}</div>
              <div style={{ fontSize: 11, color: '#5C6070' }}>If you don't request a revision, funds release to the provider.</div>
            </div>
          )}
        </div>

        {/* Breakdown grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          <div style={{ background: 'rgba(255,255,255,.55)', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Held</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: statusCfg.fg }}>{fmt$(order.escrow_amount)}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.55)', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Released</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1A6B45' }}>{fmt$(order.escrow_released_amount)}</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.55)', borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#5C6070', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>Refunded</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#8B1A1A' }}>{fmt$(order.escrow_refunded_amount)}</div>
          </div>
        </div>
      </div>

      {/* Pending scope changes — REQUIRES CLIENT DECISION */}
      {pending_scope_changes && pending_scope_changes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 18, color: '#1B2D4F', marginBottom: 8 }}>
            ⚠ Action Required — Scope Changes
          </div>
          {pending_scope_changes.map(sc => (
            <div key={sc.id} style={{ background: '#FEF5E4', border: '1px solid rgba(139,94,10,.22)', borderRadius: 8, padding: '14px 16px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7A4D08', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {sc.requested_by_role || 'Provider'} requests {sc.change_type?.replace('_', ' ')}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: sc.amount_delta >= 0 ? '#1B2D4F' : '#8B1A1A', marginTop: 2 }}>
                    {sc.amount_delta >= 0 ? '+' : ''}{fmt$(sc.amount_delta)}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#5C6070' }}>{ago(sc.created_at)}</div>
              </div>
              <p style={{ margin: '6px 0 10px', fontSize: 13, color: '#5C6070', lineHeight: 1.55 }}>{sc.reason}</p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={busyId === sc.id}
                  onClick={() => decideScope(sc, 'approve')}
                  style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#1A6B45', color: '#fff', cursor: busyId === sc.id ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: busyId === sc.id ? .6 : 1 }}
                >
                  {busyId === sc.id ? 'Approving…' : `Approve ${fmt$(Math.abs(sc.amount_delta))}`}
                </button>
                <button
                  disabled={busyId === sc.id}
                  onClick={() => { setRejectModal(sc); setRejectReason('') }}
                  style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #DDD8CE', background: '#fff', color: '#8B1A1A', cursor: busyId === sc.id ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Milestones */}
      {milestones && milestones.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 18, color: '#1B2D4F', marginBottom: 8 }}>
            Milestones · {fmt$(milestones.reduce((s, m) => s + Number(m.amount || 0), 0))} total
          </div>
          {milestones.map(m => {
            const cfg = {
              pending:     { bg: '#F2EFE9', fg: '#5C6070', label: 'Pending' },
              in_progress: { bg: '#E0F3F7', fg: '#0E7C8E', label: 'In Progress' },
              submitted:   { bg: '#FEF5E4', fg: '#8B5E0A', label: 'Submitted — Review' },
              approved:    { bg: '#EAF5EE', fg: '#1A6B45', label: 'Approved' },
              rejected:    { bg: '#FAEAEA', fg: '#8B1A1A', label: 'Rejected' },
              released:    { bg: '#EAF5EE', fg: '#1A6B45', label: 'Released ✓' },
              cancelled:   { bg: '#F2EFE9', fg: '#9097A8', label: 'Cancelled' },
            }[m.status] || { bg: '#F2EFE9', fg: '#5C6070', label: m.status }
            return (
              <div key={m.id} style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: 8, padding: '12px 16px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9097A8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Milestone {m.sequence}</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1B2D4F' }}>{m.title}</div>
                    {m.description && <div style={{ fontSize: 12, color: '#5C6070', marginTop: 4, lineHeight: 1.5 }}>{m.description}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#1B2D4F' }}>{fmt$(m.amount)}</div>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', background: cfg.bg, color: cfg.fg, marginTop: 4 }}>{cfg.label}</span>
                  </div>
                </div>
                {m.due_date && <div style={{ fontSize: 11, color: '#9097A8', marginTop: 6 }}>Due {new Date(m.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* Activity timeline */}
      {events && events.length > 0 && (
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 18, color: '#1B2D4F', marginBottom: 8 }}>Activity</div>
          <div style={{ background: '#fff', border: '1px solid #DDD8CE', borderRadius: 8, overflow: 'hidden' }}>
            {events.slice(0, 8).map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: i < events.length - 1 ? '1px solid #F2EFE9' : 'none' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1B2D4F', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: '#1B2D4F', textTransform: 'capitalize' }}>{e.event_type?.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 11, color: '#9097A8', flexShrink: 0 }}>{ago(e.created_at)}</span>
                  </div>
                  {e.amount !== null && e.amount !== undefined && (
                    <div style={{ fontSize: 12, fontWeight: 600, color: Number(e.amount) >= 0 ? '#1A6B45' : '#8B1A1A', fontVariantNumeric: 'tabular-nums' }}>
                      {Number(e.amount) >= 0 ? '+' : ''}{fmt$(e.amount)}
                    </div>
                  )}
                  {e.reason && <div style={{ fontSize: 12, color: '#5C6070', lineHeight: 1.4 }}>{e.reason}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div onClick={() => setRejectModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, padding: 24, width: '100%', maxWidth: 440 }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 20, color: '#1B2D4F', margin: 0 }}>Reject Scope Change</h3>
            <p style={{ fontSize: 13, color: '#5C6070', margin: '8px 0 16px', lineHeight: 1.55 }}>
              The provider will be notified. Optionally explain why so they can revise the request.
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Optional reason…"
              style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #DDD8CE', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none', marginBottom: 16 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModal(null)} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #DDD8CE', background: '#fff', color: '#5C6070', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancel</button>
              <button
                disabled={busyId === rejectModal.id}
                onClick={() => decideScope(rejectModal, 'reject', rejectReason)}
                style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#8B1A1A', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
              >
                {busyId === rejectModal.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
