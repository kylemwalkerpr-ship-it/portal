// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Badge, Card } from './shared'
import IntakeForm from './inquiry-intake-form'
import ChatScreen from '../messaging/ChatScreen'
import MessageBubble from '../messaging/MessageBubble'
import { dateLabel, sameDay } from '@/lib/messaging/format'
import { COUNTRIES } from '@/lib/intake-questions'

const TAB_ACTIVE = 'active'
const TAB_ARCHIVED = 'archived'

export default function MyInquiries() {
  const [inquiries, setInquiries] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openId, setOpenId] = React.useState(null)
  const [showIntake, setShowIntake] = React.useState(false)
  const [tab, setTab] = React.useState(TAB_ACTIVE)
  const [toast, setToast] = React.useState(null)
  const [modal, setModal] = React.useState(null)
  const [editingInquiry, setEditingInquiry] = React.useState(null)

  // Deep-link: ?open=<id> auto-opens inquiry and strips param
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const openId = params.get('open')
    if (openId) {
      setOpenId(openId)
      params.delete('open')
      const url = new URL(window.location.href)
      url.search = params.toString()
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  const showToast = React.useCallback((message) => {
    setToast({ message })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const load = React.useCallback((isInitial, currentTab) => {
    if (isInitial) setLoading(true)
    const url = currentTab === TAB_ARCHIVED ? '/api/client/inquiries?include=archived' : '/api/client/inquiries'
    fetch(url, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load your inquiries.')
        const list = payload.inquiries || []
        setInquiries(currentTab === TAB_ARCHIVED ? list.filter((q) => q.archived_at) : list)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (isInitial) setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    load(true, tab)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(false, tab)
    }, 6000)
    return () => clearInterval(id)
  }, [load, tab])

  async function handleArchive(id) {
    try {
      const res = await fetch(`/api/client/inquiries/${id}/archive`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not archive.')
      showToast('Inquiry archived')
      load(false, tab)
    } catch (e) {
      setError(e.message)
    } finally {
      setModal(null)
    }
  }

  async function handleUnarchive(id) {
    try {
      const res = await fetch(`/api/client/inquiries/${id}/unarchive`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not unarchive.')
      showToast('Inquiry unarchived')
      load(false, tab)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeleteBroadcast(id) {
    try {
      const res = await fetch(`/api/client/inquiries/${id}/status`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('Could not delete broadcast.')
      showToast('Status broadcast removed')
      load(false, tab)
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleDeletePermanently(id) {
    try {
      const res = await fetch(`/api/client/inquiries/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (res.status === 409) {
        const payload = await res.json().catch(() => null)
        if (payload?.reason === 'order_exists') {
          showToast('An order is linked to this inquiry — archived instead.')
          await handleArchive(id)
          return
        }
      }
      if (!res.ok) throw new Error('Could not delete inquiry.')
      showToast('Inquiry deleted')
      load(false, tab)
    } catch (e) {
      setError(e.message)
    } finally {
      setModal(null)
    }
  }

  if (editingInquiry) {
    return (
      <IntakeForm
        existingInquiry={editingInquiry}
        onSaved={(updated) => {
          setEditingInquiry(null)
          showToast('Changes saved')
          load(false, tab)
        }}
        onCancel={() => setEditingInquiry(null)}
      />
    )
  }

  if (showIntake) {
    return (
      <IntakeForm
        onCancel={() => setShowIntake(false)}
        onSubmitted={() => {
          setShowIntake(false)
          load(false, tab)
        }}
      />
    )
  }

  if (loading) return <div style={notice}>Loading your inquiries...</div>
  if (error) return <div style={errorNotice}>{error}</div>

  if (openId) {
    return (
      <InquiryDetail
        inquiryId={openId}
        onBack={() => {
          setOpenId(null)
          load(false, tab)
        }}
      />
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 4px' }}>My inquiries</h2>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>
            Inquiries you submitted from the legal site or here. Multiple attorneys may respond and send you competing offers.
          </p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowIntake(true)}>
          + New inquiry
        </Btn>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: `1px solid ${C.border}` }}>
        <TabButton active={tab === TAB_ACTIVE} onClick={() => setTab(TAB_ACTIVE)}>Active</TabButton>
        <TabButton active={tab === TAB_ARCHIVED} onClick={() => setTab(TAB_ARCHIVED)}>Archived</TabButton>
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            {tab === TAB_ARCHIVED
              ? 'No archived inquiries.'
              : 'No inquiries yet. Click + New inquiry to describe your case and get attorney responses.'}
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {inquiries.map((q) => (
            <InquiryRow
              key={q.id}
              inquiry={q}
              onView={() => setOpenId(q.id)}
              onEdit={() => setEditingInquiry(q)}
              onArchive={() => setModal({ type: 'archive', inquiry: q })}
              onUnarchive={() => handleUnarchive(q.id)}
              onDeleteBroadcast={() => handleDeleteBroadcast(q.id)}
              onDeletePermanently={() => setModal({ type: 'delete', inquiry: q })}
            />
          ))}
        </div>
      )}

      {modal?.type === 'archive' && (
        <SimpleModal
          title="Archive inquiry?"
          body="It will be hidden from your active list but kept for dispute reference."
          onConfirm={() => handleArchive(modal.inquiry.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'delete' && (
        <SimpleModal
          title="Delete permanently?"
          body="This permanently deletes the inquiry and all attorney messages. Continue?"
          danger
          onConfirm={() => handleDeletePermanently(modal.inquiry.id)}
          onClose={() => setModal(null)}
        />
      )}
      {toast && <Toast message={toast.message} onClose={() => setToast(null)} />}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 600,
        color: active ? C.text : C.textMuted,
        background: 'none',
        border: 'none',
        borderBottom: active ? `2px solid ${C.text}` : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: '-1px',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  )
}

function InquiryRow({ inquiry, onView, onEdit, onArchive, onUnarchive, onDeleteBroadcast, onDeletePermanently }) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const menuRef = React.useRef(null)

  React.useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    if (menuOpen) document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [menuOpen])

  const canEdit = !inquiry.archived_at && inquiry.status !== 'converted'
  const canArchive = !inquiry.archived_at
  const canUnarchive = !!inquiry.archived_at
  const canDeletePermanently = !inquiry.archived_at && !inquiry.order_id

  return (
    <Card>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '16px', fontFamily: C.serif, color: C.text }}>
                🌐 {inquiry.country || '—'} · {inquiry.case_type_label || 'Inquiry'}
              </span>
              {inquiry.order_id && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: 'rgba(196,164,90,0.12)',
                    color: '#C4A45A',
                    border: '1px solid rgba(196,164,90,0.30)',
                  }}
                >
                  📎 Order #{shortId(inquiry.order_id)}
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <StatusBadge status={inquiry.status} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {inquiry.urgency && <UrgencyChip value={inquiry.urgency} />}
              {inquiry.recommended_tier && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    background: C.surface2,
                    color: C.textMuted,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  {inquiry.recommended_tier}
                </span>
              )}
              <span style={{ fontSize: '12px', color: C.textMuted }}>Submitted {timeAgo(inquiry.created_at)}</span>
            </div>

            <div
              style={{
                marginTop: '10px',
                fontSize: '14px',
                color: C.text,
                lineHeight: 1.5,
                maxWidth: '720px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {briefPreview(inquiry.answers)}
            </div>
          </div>

          <div style={{ position: 'relative', flexShrink: 0 }} ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '18px',
                color: C.textMuted,
                padding: '4px 8px',
                borderRadius: '6px',
              }}
              aria-label="Actions"
            >
              ⋮
            </button>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '28px',
                  background: C.surface,
                  border: `1px solid ${C.border}`,
                  borderRadius: '10px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                  zIndex: 50,
                  minWidth: '180px',
                  overflow: 'hidden',
                }}
              >
                <MenuItem onClick={() => { setMenuOpen(false); onView() }}>View</MenuItem>
                {canEdit && <MenuItem onClick={() => { setMenuOpen(false); onEdit() }}>Edit</MenuItem>}
                <MenuItem onClick={() => { setMenuOpen(false); onDeleteBroadcast() }}>Delete broadcast</MenuItem>
                {canArchive && <MenuItem onClick={() => { setMenuOpen(false); onArchive() }}>Archive</MenuItem>}
                {canUnarchive && <MenuItem onClick={() => { setMenuOpen(false); onUnarchive() }}>Unarchive</MenuItem>}
                {canDeletePermanently && (
                  <MenuItem danger onClick={() => { setMenuOpen(false); onDeletePermanently() }}>Delete permanently</MenuItem>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}

function MenuItem({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 14px',
        fontSize: '13px',
        fontFamily: 'inherit',
        background: 'none',
        border: 'none',
        color: danger ? C.red : C.text,
        cursor: 'pointer',
        borderBottom: `1px solid ${C.borderSoft}`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.surface2 }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }) {
  const config = STATUS_STYLES[status] || STATUS_STYLES.open
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 9px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.01em',
        background: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
      }}
    >
      {config.label}
    </span>
  )
}

const STATUS_STYLES = {
  open: { label: 'Awaiting attorney', bg: 'rgba(95,107,58,0.10)', text: '#5F6B3A', border: 'rgba(95,107,58,0.25)' },
  claimed: { label: 'Claimed', bg: 'rgba(60,59,110,0.10)', text: '#3C3B6E', border: 'rgba(60,59,110,0.25)' },
  engaged: { label: 'Attorneys responding', bg: 'rgba(42,42,85,0.10)', text: '#2A2A55', border: 'rgba(42,42,85,0.25)' },
  converted: { label: 'Order placed', bg: 'rgba(196,164,90,0.12)', text: '#C4A45A', border: 'rgba(196,164,90,0.30)' },
  closed: { label: 'Closed', bg: 'rgba(100,116,139,0.10)', text: '#64748B', border: 'rgba(100,116,139,0.25)' },
  cancelled: { label: 'Cancelled', bg: 'rgba(178,34,52,0.10)', text: '#B22234', border: 'rgba(178,34,52,0.25)' },
  archived: { label: 'Archived', bg: 'rgba(100,116,139,0.10)', text: '#64748B', border: 'rgba(100,116,139,0.25)' },
}

function UrgencyChip({ value }) {
  const map = { now: 'High', soon: 'Med', later: 'Low', explore: 'Low' }
  const label = map[value] || value
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: C.surface2,
        color: C.textMuted,
        border: `1px solid ${C.border}`,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      }}
    >
      {label}
    </span>
  )
}

function SimpleModal({ title, body, onConfirm, onClose, danger = false }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface,
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '420px',
          border: `1px solid ${C.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        }}
      >
        <h3 style={{ fontFamily: C.serif, fontWeight: 600, fontSize: '20px', color: C.text, margin: '0 0 8px' }}>
          {title}
        </h3>
        <p style={{ fontSize: '13px', color: C.textMuted, lineHeight: 1.55, margin: '0 0 20px' }}>{body}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>
            Confirm
          </Btn>
        </div>
      </div>
    </div>
  )
}

function Toast({ message, onClose }) {
  React.useEffect(() => {
    const id = setTimeout(onClose, 3000)
    return () => clearTimeout(id)
  }, [onClose])
  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 500,
        background: C.navy,
        color: '#fff',
        padding: '12px 18px',
        borderRadius: '10px',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0,0,0,0.20)',
      }}
    >
      {message}
    </div>
  )
}

export function InquiryDetail({ inquiryId, onBack }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [decidingId, setDecidingId] = React.useState(null)
  const [expandedAnswers, setExpandedAnswers] = React.useState(new Set())

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch(`/api/client/inquiries/${inquiryId}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load inquiry.')
        setData(payload)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (isInitial) setLoading(false)
      })
  }, [inquiryId])

  React.useEffect(() => {
    load(true)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(false)
    }, 6000)
    return () => clearInterval(id)
  }, [load])

  async function sendMessage(e) {
    e.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/client/inquiries/${inquiryId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ body: draft }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not send message.')
      setDraft('')
      load(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  async function acceptOffer(offerId) {
    if (decidingId) return
    setDecidingId(offerId)
    try {
      const res = await fetch(`/api/offers/${offerId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.url) throw new Error(payload?.error || 'Could not start checkout.')
      window.location.href = payload.url
    } catch (e) {
      setError(e.message)
      setDecidingId(null)
    }
  }

  async function declineOffer(offerId) {
    if (decidingId) return
    if (!confirm('Decline this offer?')) return
    setDecidingId(offerId)
    try {
      const res = await fetch(`/api/offers/${offerId}/decline`, { method: 'POST', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not decline offer.')
      load(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setDecidingId(null)
    }
  }

  async function handleUnarchive() {
    try {
      const res = await fetch(`/api/client/inquiries/${inquiryId}/unarchive`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not unarchive.')
      load(false)
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div style={notice}>Loading inquiry...</div>
  if (error) return <div style={errorNotice}>{error}</div>
  if (!data) return null

  const inquiry = data.inquiry
  const threads = data.threads || []
  const clientMessages = data.client_messages || []
  const systemMessages = data.system_messages || []

  const scalarAnswers = React.useMemo(() => {
    if (!inquiry.answers || typeof inquiry.answers !== 'object') return []
    return Object.entries(inquiry.answers)
      .filter(([k]) => !k.startsWith('_'))
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number')
  }, [inquiry.answers])

  function toggleExpand(key) {
    setExpandedAnswers((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div style={{ padding: '20px 28px', maxWidth: '960px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '13px', marginBottom: '12px' }}
      >
        ← Back to my inquiries
      </button>

      {/* Brief block */}
      <Card style={{ marginBottom: '16px' }}>
        <div style={{ padding: '18px 20px' }}>
          {inquiry.order_id && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 14px',
                background: 'rgba(196,164,90,0.08)',
                border: '1px solid rgba(196,164,90,0.25)',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#8A6E2F',
                lineHeight: 1.5,
              }}
            >
              📎 Order placed — this inquiry produced order{' '}
              <a
                href={`/dashboard?page=orders&open=${inquiry.order_id}`}
                style={{ color: '#C4A45A', fontWeight: 700, textDecoration: 'underline' }}
              >
                #{shortId(inquiry.order_id)}
              </a>
              . It can be archived but no longer edited or deleted.
            </div>
          )}

          {inquiry.archived_at && (
            <div
              style={{
                marginBottom: '14px',
                padding: '10px 14px',
                background: C.surface2,
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
                fontSize: '13px',
                color: C.textMuted,
                lineHeight: 1.5,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
              }}
            >
              <span>
                ⏸ Archived {new Date(inquiry.archived_at).toLocaleDateString()}
                {inquiry.archived_reason ? `. ${inquiry.archived_reason}` : ''}
              </span>
              <Btn variant="secondary" size="sm" onClick={handleUnarchive}>
                Unarchive
              </Btn>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: C.surface2,
                    color: C.textMuted,
                    border: `1px solid ${C.border}`,
                  }}
                >
                  🌐 {inquiry.country || '—'}
                </span>
                <span style={{ fontFamily: C.serif, fontSize: '16px', color: C.text }}>{inquiry.case_type_label || 'Inquiry'}</span>
                <StatusBadge status={inquiry.status} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                {inquiry.urgency && <UrgencyChip value={inquiry.urgency} />}
                {inquiry.recommended_tier && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      background: C.surface2,
                      color: C.textMuted,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    {inquiry.recommended_tier}
                  </span>
                )}
                <span style={{ fontSize: '12px', color: C.textMuted }}>Submitted {new Date(inquiry.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {inquiry.answers?._headline && (
            <h1 style={{ fontFamily: C.serif, fontSize: '22px', fontWeight: 500, color: C.text, margin: '16px 0 8px', letterSpacing: '-0.01em' }}>
              {inquiry.answers._headline}
            </h1>
          )}

          {inquiry.answers?._summary && (
            <p style={{ fontSize: '14px', color: C.text, lineHeight: 1.5, margin: '0 0 12px' }}>
              {inquiry.answers._summary}
            </p>
          )}

          {scalarAnswers.length > 0 && (
            <dl style={{ margin: '12px 0 0', display: 'grid', gap: '8px' }}>
              {scalarAnswers.map(([key, value]) => {
                const str = String(value)
                const isLong = str.length > 200
                const expanded = expandedAnswers.has(key)
                return (
                  <div key={key} style={{ fontSize: '13px', color: C.text, lineHeight: 1.5 }}>
                    <dt style={{ display: 'inline', fontWeight: 600, color: C.textMuted }}>{humanizeKey(key)}:</dt>{' '}
                    <dd style={{ display: 'inline', margin: 0 }}>
                      {isLong && !expanded ? str.slice(0, 200) + '…' : str}
                      {isLong && (
                        <button
                          onClick={() => toggleExpand(key)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: C.cyan,
                            cursor: 'pointer',
                            fontSize: '12px',
                            fontWeight: 600,
                            marginLeft: '4px',
                            fontFamily: 'inherit',
                          }}
                        >
                          {expanded ? 'less' : 'more'}
                        </button>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          )}

          <div style={{ fontSize: '13px', color: C.text, marginTop: '14px' }}>
            {threads.length === 0
              ? 'Waiting for attorneys to respond...'
              : `${threads.length} attorney${threads.length === 1 ? '' : 's'} responding`}
          </div>
        </div>
      </Card>

      {systemMessages.length > 0 && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '4px' }}>
          {systemMessages.map((m) => (
            <div key={m.id} style={{ color: C.textDim, fontSize: '12px', fontStyle: 'italic', textAlign: 'center' }}>
              {m.body}
            </div>
          ))}
        </div>
      )}

      {threads.length === 0 && inquiry.status !== 'converted' && (
        <Notice tone="muted">
          No attorneys have responded yet. We&apos;ll notify you as soon as someone picks this up.
        </Notice>
      )}

      <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
        {threads.map((t) => (
          <ThreadCard
            key={t.attorney_profile_id}
            thread={t}
            clientMessages={clientMessages}
            decidingId={decidingId}
            onAccept={acceptOffer}
            onDecline={declineOffer}
          />
        ))}
      </div>

      {inquiry.status !== 'converted' && !inquiry.archived_at && (
        <form onSubmit={sendMessage} style={{ marginTop: '20px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply (visible to all engaged attorneys)..."
            style={{
              flex: 1,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              padding: '10px 12px',
              color: C.text,
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <Btn type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>
            {sending ? 'Sending...' : 'Send'}
          </Btn>
        </form>
      )}

      {inquiry.archived_at && (
        <Notice tone="muted">This inquiry is archived — new messages cannot be sent.</Notice>
      )}
    </div>
  )
}

function ThreadCard({ thread, clientMessages, decidingId, onAccept, onDecline }) {
  const interleaved = React.useMemo(() => {
    const all = [
      ...thread.messages.map((m) => ({ ...m, _kind: 'attorney' })),
      ...clientMessages.map((m) => ({ ...m, _kind: 'client' })),
    ]
    all.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    return all
  }, [thread.messages, clientMessages])

  const pendingOffer = thread.offers.find((o) => o.status === 'sent')

  const chatHeader = (
    <div
      style={{
        padding: '10px 14px',
        background: '#F5F1E9',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: C.surface2,
          color: C.text,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '13px',
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {String(thread.attorney_name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('')}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: C.text, lineHeight: 1.2 }}>
          {thread.attorney_name}
        </div>
        <div style={{ fontSize: '11px', color: C.textMuted }}>Attorney</div>
      </div>
    </div>
  )

  const messageElements = []
  for (let i = 0; i < interleaved.length; i++) {
    const m = interleaved[i]
    const prev = interleaved[i - 1]
    const next = interleaved[i + 1]
    const showDate = !prev || !sameDay(m.created_at, prev.created_at)
    if (showDate) {
      messageElements.push(
        <div key={`date-${m.id || i}-${m.created_at}`} style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, background: 'rgba(0,0,0,0.06)', padding: '4px 12px', borderRadius: 999, letterSpacing: '.02em' }}>
            {dateLabel(m.created_at)}
          </span>
        </div>
      )
    }

    if (m.sender_role === 'system') {
      messageElements.push(
        <div key={`sys-${m.id || i}`} style={{ display: 'flex', justifyContent: 'center', margin: '6px 0' }}>
          <div style={{ color: C.textDim, fontSize: '11px', fontStyle: 'italic', textAlign: 'center', maxWidth: '85%' }}>
            {m.body}
          </div>
        </div>
      )
      continue
    }

    const mine = m._kind === 'client'
    const isFirstInGroup = !prev || prev.sender_role === 'system' || prev._kind !== m._kind
    const isLastInGroup = !next || next.sender_role === 'system' || next._kind !== m._kind

    messageElements.push(
      <MessageBubble
        key={`${m._kind}-${m.id || i}`}
        mine={mine}
        isFirstInGroup={isFirstInGroup}
        isLastInGroup={isLastInGroup}
        timestamp={m.created_at}
        body={m.body}
      />
    )
  }

  return (
    <Card>
      <div style={{ padding: '16px 18px' }}>
        <div
          style={{
            height: 380,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <ChatScreen
            mode="panel"
            header={chatHeader}
            messages={
              interleaved.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 8px' }}>
                  No messages with this attorney yet.
                </div>
              ) : (
                messageElements
              )
            }
            composer={null}
          />
        </div>

        {thread.offers.length > 0 && (
          <div style={{ display: 'grid', gap: '8px' }}>
            {thread.offers.map((o) => (
              <OfferCard
                key={o.id}
                offer={o}
                isPending={o.id === pendingOffer?.id}
                disabled={decidingId === o.id}
                onAccept={() => onAccept(o.id)}
                onDecline={() => onDecline(o.id)}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function OfferCard({ offer, isPending, disabled, onAccept, onDecline }) {
  const platformFee = Number(offer.platform_fee || 0)
  const total = Number(offer.price) + platformFee
  return (
    <div
      style={{
        background: isPending ? C.surface : C.bg,
        borderLeft: isPending ? `4px solid ${C.cyan}` : `1px solid ${C.border}`,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        padding: '12px 14px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>
          {isPending ? 'Pending offer · ' : ''}{offer.title}
        </div>
        <Badge color={offer.status === 'sent' ? 'orange' : offer.status === 'accepted' ? 'green' : 'gray'}>
          {offer.status}
        </Badge>
      </div>
      <div style={{ marginTop: '6px', fontSize: '13px', color: C.text, whiteSpace: 'pre-wrap' }}>
        {offer.description}
      </div>
      <div style={{ marginTop: '10px', padding: '8px 10px', background: C.surface2, borderRadius: '6px', fontSize: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.text }}>
          <span>Attorney fee</span>
          <span>${Number(offer.price).toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: C.text }}>
          <span>Platform fee ({offer.platform_fee_percent_snapshot}%)</span>
          <span>${platformFee.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: '4px', marginTop: '4px', fontWeight: 700, color: C.text }}>
          <span>You pay</span>
          <span>${total.toFixed(2)}</span>
        </div>
        <div style={{ color: C.textDim, fontSize: '11px', marginTop: '4px' }}>
          The attorney&apos;s fee is paid in full to them. Platform fee is shown separately and routed to MyCaseworks.
        </div>
      </div>
      {offer.expires_at && offer.status === 'sent' && (
        <div style={{ fontSize: '11px', color: C.textDim, marginTop: '6px' }}>
          Expires {new Date(offer.expires_at).toLocaleDateString()}
        </div>
      )}
      {isPending && (
        <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Btn variant="primary" size="sm" disabled={disabled} onClick={onAccept}>
            {disabled ? 'Opening checkout...' : `Accept & pay $${total.toFixed(2)}`}
          </Btn>
          <Btn variant="ghost" size="sm" disabled={disabled} onClick={onDecline}>
            Decline
          </Btn>
        </div>
      )}
    </div>
  )
}

function Notice({ children, tone }) {
  return (
    <div
      style={{
        marginTop: '16px',
        padding: '12px 14px',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        color: tone === 'muted' ? C.textMuted : C.text,
        fontSize: '13px',
      }}
    >
      {children}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffSec = Math.floor((now - d) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return d.toLocaleDateString()
}

function shortId(uuid) {
  if (!uuid) return ''
  return String(uuid).slice(0, 8)
}

function briefPreview(answers) {
  if (!answers || typeof answers !== 'object') return ''
  if (answers._headline) return answers._headline
  if (answers._summary) {
    const sentences = answers._summary.split(/[.!?]+/).filter(Boolean)
    const text = sentences.slice(0, 3).join('. ') + (sentences.length > 3 ? '.' : '')
    return text.length > 180 ? text.slice(0, 180) + '…' : text
  }
  const scalars = Object.entries(answers).filter(([k, v]) => !k.startsWith('_') && (typeof v === 'string' || typeof v === 'number'))
  if (scalars.length > 0) {
    const text = String(scalars[0][1])
    return text.length > 180 ? text.slice(0, 180) + '…' : text
  }
  return ''
}

function humanizeKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

const notice = { padding: '24px 28px', color: C.textMuted, fontSize: '14px' }
const errorNotice = {
  margin: '24px 28px',
  padding: '14px 16px',
  background: 'rgba(220,38,38,0.10)',
  border: '1px solid rgba(220,38,38,0.25)',
  color: C.red,
  borderRadius: '10px',
  fontSize: '13px',
}
