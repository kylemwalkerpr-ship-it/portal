// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Badge, Card } from './shared'
import IntakeForm from './inquiry-intake-form'

export default function MyInquiries() {
  const [inquiries, setInquiries] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openId, setOpenId] = React.useState(null)
  const [showIntake, setShowIntake] = React.useState(false)

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch('/api/client/inquiries', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load your inquiries.')
        setInquiries(payload.inquiries || [])
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (isInitial) setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    load(true)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(false)
    }, 6000)
    return () => clearInterval(id)
  }, [load])

  if (showIntake) {
    return (
      <IntakeForm
        onCancel={() => setShowIntake(false)}
        onSubmitted={() => {
          setShowIntake(false)
          load(false)
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
          load(false)
        }}
      />
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: C.text, margin: '0 0 4px' }}>My Inquiries</h2>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>
            Inquiries you submitted from the legal site or here. Multiple attorneys may respond and
            send you competing offers.
          </p>
        </div>
        <Btn variant="primary" size="sm" onClick={() => setShowIntake(true)}>
          + New inquiry
        </Btn>
      </div>

      {inquiries.length === 0 ? (
        <Card>
          <div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>
            No inquiries yet. Click <strong>+ New inquiry</strong> to describe your case and get
            attorney responses.
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

  if (loading) return <div style={notice}>Loading inquiry...</div>
  if (error) return <div style={errorNotice}>{error}</div>
  if (!data) return null

  const inquiry = data.inquiry
  const threads = data.threads || []
  const clientMessages = data.client_messages || []
  const systemMessages = data.system_messages || []

  return (
    <div style={{ padding: '20px 28px', maxWidth: '960px' }}>
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
              <div style={{ fontSize: '13px', color: C.text, marginTop: '6px' }}>
                {threads.length === 0
                  ? 'Waiting for attorneys to respond...'
                  : `${threads.length} attorney${threads.length === 1 ? '' : 's'} responding`}
              </div>
            </div>
            <Badge color={statusColor(inquiry.status)}>{statusLabel(inquiry.status)}</Badge>
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

      {inquiry.status !== 'converted' && (
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

  return (
    <Card>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', color: C.text, marginBottom: '8px' }}>
          {thread.attorney_name}
        </div>

        <div
          style={{
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '280px',
            overflow: 'auto',
            marginBottom: '12px',
          }}
        >
          {interleaved.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '12px', textAlign: 'center' }}>
              No messages with this attorney yet.
            </div>
          ) : (
            interleaved.map((m, i) => <Bubble key={`${m._kind}-${m.id || i}`} message={m} />)
          )}
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

function Bubble({ message }) {
  if (message.sender_role === 'system') {
    return (
      <div style={{ textAlign: 'center', color: C.textDim, fontSize: '11px', fontStyle: 'italic' }}>
        {message.body}
      </div>
    )
  }
  const mine = message.sender_role === 'client'
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '78%',
          background: mine ? C.cyan : C.surface2,
          color: mine ? '#000' : C.text,
          padding: '6px 10px',
          borderRadius: '8px',
          fontSize: '13px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.body}
        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>
          {new Date(message.created_at).toLocaleString()}
        </div>
      </div>
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

const STATUS_LABEL = {
  open: 'Awaiting attorney',
  engaged: 'Attorneys responding',
  claimed: 'Claimed',
  converted: 'Converted to order',
  closed: 'Closed',
  cancelled: 'Cancelled',
}
const STATUS_COLOR = {
  open: 'orange',
  engaged: 'cyan',
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
