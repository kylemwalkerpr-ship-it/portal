// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Badge, Card } from './shared'

export default function MyInquiries() {
  const [inquiries, setInquiries] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openId, setOpenId] = React.useState(null)

  const load = React.useCallback(() => {
    setLoading(true)
    fetch('/api/client/inquiries', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load your inquiries.')
        setInquiries(payload.inquiries || [])
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  if (loading) return <div style={notice}>Loading your inquiries...</div>
  if (error) return <div style={errorNotice}>{error}</div>

  if (openId) {
    return (
      <InquiryDetail
        inquiryId={openId}
        onBack={() => {
          setOpenId(null)
          load()
        }}
      />
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 4px' }}>My Inquiries</h2>
        <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>
          Inquiries you submitted from the legal site. Attorneys claim them and can send you a
          custom offer.
        </p>
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            You haven&apos;t submitted any inquiries yet.
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {inquiries.map((q) => (
            <Card key={q.id}>
              <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={() => setOpenId(q.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>
                      {q.case_type_label || 'Inquiry'}
                    </div>
                    <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
                      {q.country || '—'} · Submitted {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Badge color={statusColor(q.status)}>{statusLabel(q.status)}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function InquiryDetail({ inquiryId, onBack }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [decidingId, setDecidingId] = React.useState(null)

  const load = React.useCallback(() => {
    setLoading(true)
    fetch(`/api/client/inquiries/${inquiryId}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load inquiry.')
        setData(payload)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [inquiryId])

  React.useEffect(() => {
    load()
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
      load()
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
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setDecidingId(null)
    }
  }

  if (loading) return <div style={notice}>Loading inquiry...</div>
  if (error) return <div style={errorNotice}>{error}</div>
  if (!data) return null

  const inquiry = data.inquiry
  const claimed = data.claimed_attorney
  const messages = data.messages || []
  const offers = data.offers || []
  const pendingOffer = offers.find((o) => o.status === 'sent')

  return (
    <div style={{ padding: '20px 28px', maxWidth: '880px' }}>
      <button
        onClick={onBack}
        style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '13px', marginBottom: '12px' }}
      >
        ← Back to my inquiries
      </button>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: C.text }}>
                {inquiry.case_type_label || 'Inquiry'}
              </div>
              <div style={{ fontSize: '12px', color: C.textDim, marginTop: '2px' }}>
                {inquiry.country || '—'} · Submitted {new Date(inquiry.created_at).toLocaleString()}
              </div>
              {claimed && (
                <div style={{ fontSize: '13px', color: C.text, marginTop: '6px' }}>
                  Claimed by <strong>{claimed.full_name || 'an attorney'}</strong>
                </div>
              )}
            </div>
            <Badge color={statusColor(inquiry.status)}>{statusLabel(inquiry.status)}</Badge>
          </div>
        </div>
      </Card>

      {pendingOffer && (
        <div style={{ marginTop: '16px' }}>
          <Card>
            <div style={{ padding: '18px 20px', borderLeft: `4px solid ${C.cyan}` }}>
              <div style={{ fontSize: '12px', color: C.cyan, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                Pending offer
              </div>
              <div style={{ fontWeight: 700, fontSize: '17px', color: C.text }}>{pendingOffer.title}</div>
              <div style={{ fontSize: '14px', color: C.text, marginTop: '4px' }}>
                ${Number(pendingOffer.price).toFixed(2)} · {pendingOffer.delivery_days} day delivery
              </div>
              <div style={{ marginTop: '10px', whiteSpace: 'pre-wrap', color: C.text, fontSize: '14px' }}>
                {pendingOffer.description}
              </div>
              {pendingOffer.expires_at && (
                <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '8px' }}>
                  Expires {new Date(pendingOffer.expires_at).toLocaleDateString()}
                </div>
              )}
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Btn variant="primary" size="sm" disabled={decidingId === pendingOffer.id} onClick={() => acceptOffer(pendingOffer.id)}>
                  {decidingId === pendingOffer.id ? 'Opening checkout...' : `Accept & pay $${Number(pendingOffer.price).toFixed(2)}`}
                </Btn>
                <Btn variant="ghost" size="sm" disabled={decidingId === pendingOffer.id} onClick={() => declineOffer(pendingOffer.id)}>
                  Decline
                </Btn>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div style={{ marginTop: '20px' }}>
        <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, margin: '0 0 10px' }}>
          Messages
        </h3>
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxHeight: '420px',
            overflow: 'auto',
          }}
        >
          {messages.length === 0 && (
            <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>
              {claimed
                ? 'No messages yet. Wait for the attorney to introduce themselves, or send a message below.'
                : 'No messages yet. An attorney will reach out once they claim your inquiry.'}
            </div>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </div>

        {claimed && inquiry.status !== 'converted' && (
          <form onSubmit={sendMessage} style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Reply to the attorney..."
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
      </div>
    </div>
  )
}

function Bubble({ message }) {
  const isSystem = message.sender_role === 'system'
  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', color: C.textDim, fontSize: '12px', fontStyle: 'italic' }}>
        {message.body}
      </div>
    )
  }
  const mine = message.sender_role === 'client'
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '70%',
          background: mine ? C.cyan : C.surface2,
          color: mine ? '#000' : C.text,
          padding: '8px 12px',
          borderRadius: '10px',
          fontSize: '14px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.body}
        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '4px' }}>
          {new Date(message.created_at).toLocaleString()}
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL = {
  open: 'Awaiting attorney',
  claimed: 'Claimed',
  converted: 'Converted to order',
  closed: 'Closed',
  cancelled: 'Cancelled',
}
const STATUS_COLOR = {
  open: 'orange',
  claimed: 'cyan',
  converted: 'green',
  closed: 'gray',
  cancelled: 'red',
}
function statusLabel(s) {
  return STATUS_LABEL[s] ?? s
}
function statusColor(s) {
  return STATUS_COLOR[s] ?? 'cyan'
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
