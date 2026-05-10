// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Badge, Card, NavItem } from './shared'

const PAGE_TITLES = {
  profile: 'My Profile',
  queue: 'Inquiry Queue',
  mine: 'My Inquiries',
}

export default function AttorneyApp({ onLogout, userName }) {
  const [page, setPage] = React.useState('queue')
  const [profileData, setProfileData] = React.useState(null)
  const [profileError, setProfileError] = React.useState('')

  React.useEffect(() => {
    fetch('/api/attorney/profile', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) {
          setProfileError(payload?.error || 'Could not load your profile.')
          return
        }
        setProfileData(payload)
      })
      .catch((e) => setProfileError(e.message || 'Could not load profile.'))
  }, [])

  const displayName = profileData?.profile?.full_name || userName || ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'inherit' }}>
      <Sidebar page={page} setPage={setPage} onLogout={onLogout} displayName={displayName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header
          style={{
            height: '60px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 28px',
            background: C.surface,
          }}
        >
          <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{PAGE_TITLES[page]}</h1>
          {profileData?.profile?.email && (
            <span style={{ color: C.textMuted, fontSize: '13px' }}>{profileData.profile.email}</span>
          )}
        </header>
        <main style={{ flex: 1, overflow: 'auto' }}>
          {page === 'profile' && (
            <ProfilePage profileData={profileData} profileError={profileError} />
          )}
          {page === 'queue' && <QueuePage />}
          {page === 'mine' && <MyInquiriesPage />}
        </main>
      </div>
    </div>
  )
}

function Sidebar({ page, setPage, onLogout, displayName }) {
  return (
    <div
      style={{
        width: '240px',
        flexShrink: 0,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>YouSafe Attorney</div>
        <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
          {displayName || 'Panel member'}
        </div>
      </div>
      <div style={{ padding: '12px 8px', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="📥" label="Inquiry Queue" active={page === 'queue'} onClick={() => setPage('queue')} />
        <NavItem icon="📂" label="My Inquiries" active={page === 'mine'} onClick={() => setPage('mine')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="👤" label="My Profile" active={page === 'profile'} onClick={() => setPage('profile')} />
      </div>
      <div style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <button
          type="button"
          onClick={onLogout}
          style={{
            width: '100%',
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            background: C.surface,
            color: C.textMuted,
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 700,
            padding: '8px',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

// ── Profile page ────────────────────────────────────────────────────────────
function ProfilePage({ profileData, profileError }) {
  const profile = profileData?.profile
  const attorney = profileData?.attorney
  const application = profileData?.application

  if (profileError) return <Notice tone="error">{profileError}</Notice>
  if (!profile) return <Notice>Loading your profile...</Notice>

  return (
    <div style={{ padding: '28px', maxWidth: '880px', display: 'grid', gap: '20px' }}>
      <Section title="Bio">
        <Field label="Name" value={profile.full_name} />
        <Field label="Email" value={profile.email} />
        {application?.phone && <Field label="Phone" value={application.phone} />}
        <Field label="Credential" value={application?.credential_type} />
        <Field label="Jurisdictions" value={attorney?.jurisdictions || application?.jurisdictions} />
        <Field label="Practice areas" value={attorney?.practice_areas || application?.practice_areas} />
        <Field label="Capacity" value={application?.capacity} />
        {application?.profile_url && <Field label="Profile URL" value={application.profile_url} link />}
        {application?.notes && <Field label="Notes from application" value={application.notes} multiline />}
        {attorney?.bio && <Field label="Public bio" value={attorney.bio} multiline />}
      </Section>
      <Section title="Verification">
        <Field label="Bar / roll number" value={application?.bar_number} />
        <Field label="Malpractice / PI insurance" value={application?.malpractice_insurance} />
        <p style={{ color: C.textDim, fontSize: '12px', margin: 0 }}>
          Verification details are visible to administrators only.
        </p>
      </Section>
    </div>
  )
}

// ── Queue page ──────────────────────────────────────────────────────────────
function QueuePage() {
  const [inquiries, setInquiries] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openId, setOpenId] = React.useState(null)

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch('/api/attorney/inquiries?view=open', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load queue.')
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

  if (openId) {
    return <InquiryThread inquiryId={openId} onBack={() => { setOpenId(null); load(false) }} />
  }

  if (loading) return <Notice>Loading queue...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '16px', color: C.textMuted, fontSize: '13px' }}>
        {inquiries.length === 0
          ? 'The queue is empty. New intakes will appear here.'
          : `${inquiries.length} open inquir${inquiries.length === 1 ? 'y' : 'ies'} · multiple attorneys can respond to each.`}
      </div>
      <div style={{ display: 'grid', gap: '12px' }}>
        {inquiries.map((q) => (
          <Card key={q.id}>
            <div style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => setOpenId(q.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{q.case_type_label || q.case_type || 'Inquiry'}</div>
                  <div style={{ fontSize: '12px', color: C.textMuted }}>
                    {q.country || '—'} · {new Date(q.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge color={q.status === 'engaged' ? 'cyan' : 'orange'}>{q.status}</Badge>
              </div>
              <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '13px' }}>
                <div><span style={{ color: C.textDim }}>From:</span> {q.full_name} · {q.email}</div>
                {q.phone && <div><span style={{ color: C.textDim }}>Phone:</span> {q.phone}</div>}
              </div>
              <AnswersPreview answers={q.answers} />
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                <Btn variant="primary" size="sm">Open & respond</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ── My Inquiries page ──────────────────────────────────────────────────────
function MyInquiriesPage() {
  const [inquiries, setInquiries] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openId, setOpenId] = React.useState(null)

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch('/api/attorney/inquiries?view=mine', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load inquiries.')
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

  if (loading) return <Notice>Loading your inquiries...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  if (openId) {
    return (
      <InquiryThread
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
      {inquiries.length === 0 ? (
        <Notice>You haven&apos;t claimed any inquiries yet. Open the Inquiry Queue to claim one.</Notice>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {inquiries.map((q) => (
            <Card key={q.id}>
              <div
                onClick={() => setOpenId(q.id)}
                style={{ padding: '14px 16px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{q.case_type_label || q.case_type || 'Inquiry'}</div>
                    <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
                      {q.full_name} · {q.email} · {q.country || '—'}
                    </div>
                  </div>
                  <Badge color={q.status === 'converted' ? 'green' : q.status === 'cancelled' ? 'red' : 'cyan'}>
                    {q.status}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inquiry thread ──────────────────────────────────────────────────────────
function InquiryThread({ inquiryId, onBack }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [showOfferModal, setShowOfferModal] = React.useState(false)
  const [withdrawingId, setWithdrawingId] = React.useState(null)
  const [connect, setConnect] = React.useState(null)

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch(`/api/attorney/inquiries/${inquiryId}`, { credentials: 'same-origin' })
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
    fetch('/api/attorney/connect/status', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((p) => setConnect(p))
      .catch(() => setConnect({ has_account: false, onboarding_complete: false }))
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load(false)
    }, 6000)
    return () => clearInterval(id)
  }, [load])

  async function startConnect() {
    try {
      const res = await fetch('/api/attorney/connect/onboard', { method: 'POST', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.url) throw new Error(payload?.error || 'Could not start onboarding.')
      window.location.href = payload.url
    } catch (e) {
      setError(e.message)
    }
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/attorney/inquiries/${inquiryId}/messages`, {
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

  async function withdrawOffer(offerId) {
    if (withdrawingId) return
    setWithdrawingId(offerId)
    try {
      const res = await fetch(`/api/attorney/offers/${offerId}/withdraw`, { method: 'POST', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not withdraw offer.')
      load(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setWithdrawingId(null)
    }
  }

  if (loading) return <Notice>Loading thread...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return null

  const inquiry = data.inquiry
  const messages = data.messages || []
  const offers = data.offers || []
  const hasPendingOffer = offers.some((o) => o.status === 'sent')

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
              <div style={{ fontWeight: 700, fontSize: '17px' }}>{inquiry.case_type_label || inquiry.case_type || 'Inquiry'}</div>
              <div style={{ fontSize: '13px', color: C.textMuted, marginTop: '2px' }}>
                {inquiry.full_name} · {inquiry.email}{inquiry.phone ? ` · ${inquiry.phone}` : ''}
              </div>
              <div style={{ fontSize: '12px', color: C.textDim, marginTop: '2px' }}>
                {inquiry.country || '—'} · Submitted {new Date(inquiry.created_at).toLocaleString()}
              </div>
            </div>
            <Badge color={inquiry.status === 'converted' ? 'green' : 'cyan'}>{inquiry.status}</Badge>
          </div>
          <AnswersPreview answers={inquiry.answers} expanded />
        </div>
      </Card>

      <div style={{ marginTop: '20px' }}>
        <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, margin: '0 0 10px' }}>
          Conversation
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
              No messages yet. Introduce yourself to start.
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} viewerRole="attorney" />
          ))}
        </div>

        <form onSubmit={sendMessage} style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Reply to the client..."
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
      </div>

      <div style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, margin: 0 }}>
            My offers
          </h3>
          {!hasPendingOffer && inquiry.status !== 'converted' && (
            connect && connect.onboarding_complete ? (
              <Btn variant="primary" size="sm" onClick={() => setShowOfferModal(true)}>
                + Send custom offer
              </Btn>
            ) : (
              <Btn variant="primary" size="sm" onClick={startConnect}>
                Connect Stripe to send offers
              </Btn>
            )
          )}
        </div>
        {connect && !connect.onboarding_complete && (
          <div style={{ marginBottom: '10px', padding: '10px 12px', background: 'rgba(245,180,0,0.10)', border: '1px solid rgba(245,180,0,0.25)', borderRadius: '8px', color: '#f5b400', fontSize: '12px' }}>
            You can chat with the client now, but you must connect Stripe to send a paid offer. Click the button above to onboard.
          </div>
        )}
        {offers.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: '13px' }}>You haven&apos;t sent an offer on this inquiry yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {offers.map((o) => (
              <OfferRow key={o.id} offer={o} onWithdraw={() => withdrawOffer(o.id)} withdrawing={withdrawingId === o.id} />
            ))}
          </div>
        )}
      </div>

      {showOfferModal && (
        <OfferModal
          inquiryId={inquiryId}
          onClose={() => setShowOfferModal(false)}
          onCreated={() => {
            setShowOfferModal(false)
            load(false)
          }}
        />
      )}
    </div>
  )
}

// Default platform fee percent for the live preview. The server snapshots
// the actual current setting at offer-creation time, which is the source of
// truth on the offer row.
const DEFAULT_ATTORNEY_FEE_PERCENT = 25

function OfferModal({ inquiryId, onClose, onCreated }) {
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [price, setPrice] = React.useState('')
  const [deliveryDays, setDeliveryDays] = React.useState('7')
  const [expiresInDays, setExpiresInDays] = React.useState('7')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const numericPrice = Number(price) || 0
  const previewPlatformFee = Math.round(numericPrice * (DEFAULT_ATTORNEY_FEE_PERCENT / 100) * 100) / 100
  const previewTotal = numericPrice + previewPlatformFee

  async function submit(e) {
    e.preventDefault()
    if (submitting) return
    setError('')
    if (!title.trim() || !description.trim()) {
      setError('Title and description are required.')
      return
    }
    const numPrice = Number(price)
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      setError('Price must be a positive number.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/attorney/inquiries/${inquiryId}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title,
          description,
          price: numPrice,
          delivery_days: Number(deliveryDays),
          expires_in_days: Number(expiresInDays),
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not create offer.')
      onCreated()
    } catch (e) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '14px',
          padding: '24px 26px',
          maxWidth: '520px',
          width: '100%',
          display: 'grid',
          gap: '14px',
          color: C.text,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '17px' }}>Send custom offer</div>
        <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>
          The client sees these details and can accept (paying via Stripe), decline, or wait. You
          can withdraw a sent offer until they decide.
        </p>

        <Labeled label="Offer title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. F-1 Reinstatement filing" style={inputStyle} />
        </Labeled>
        <Labeled label="What's included">
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Outline the scope, deliverables, and what the client will receive."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Labeled>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <Labeled label="Your fee (USD)">
            <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="1" step="1" placeholder="500" style={inputStyle} />
          </Labeled>
          <Labeled label="Delivery (days)">
            <input value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} type="number" min="1" step="1" style={inputStyle} />
          </Labeled>
          <Labeled label="Expires in (days)">
            <input value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} type="number" min="1" step="1" style={inputStyle} />
          </Labeled>
        </div>

        {numericPrice > 0 && (
          <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 12px', fontSize: '13px', display: 'grid', gap: '4px' }}>
            <div style={{ color: C.textDim, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Client sees this breakdown
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.text }}>Your fee (paid in full to you)</span>
              <span style={{ color: C.text }}>${numericPrice.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: C.text }}>Platform fee ({DEFAULT_ATTORNEY_FEE_PERCENT}%)</span>
              <span style={{ color: C.text }}>${previewPlatformFee.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.border}`, paddingTop: '4px', marginTop: '2px' }}>
              <span style={{ color: C.text, fontWeight: 700 }}>Client pays</span>
              <span style={{ color: C.text, fontWeight: 700 }}>${previewTotal.toFixed(2)}</span>
            </div>
            <div style={{ color: C.textDim, fontSize: '11px', marginTop: '2px' }}>
              Per ABA Rule 5.4 we don&apos;t share your fee. The platform fee is added on top, disclosed to the client, and routed separately at checkout.
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)', color: C.red, padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Btn variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant="primary" size="sm" type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send offer'}
          </Btn>
        </div>
      </form>
    </div>
  )
}

function OfferRow({ offer, onWithdraw, withdrawing }) {
  const platformFee = Number(offer.platform_fee || 0)
  const total = Number(offer.price) + platformFee
  return (
    <Card>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{offer.title}</div>
            <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
              You receive ${Number(offer.price).toFixed(2)} · client pays ${total.toFixed(2)} (incl ${platformFee.toFixed(2)} platform fee) · {offer.delivery_days}d delivery
              {offer.expires_at && offer.status === 'sent'
                ? ` · expires ${new Date(offer.expires_at).toLocaleDateString()}`
                : ''}
            </div>
          </div>
          <Badge
            color={
              offer.status === 'accepted' ? 'green'
              : offer.status === 'declined' ? 'red'
              : offer.status === 'withdrawn' ? 'gray'
              : offer.status === 'expired' ? 'gray'
              : 'orange'
            }
          >
            {offer.status}
          </Badge>
        </div>
        <div style={{ marginTop: '8px', fontSize: '13px', color: C.text, whiteSpace: 'pre-wrap' }}>{offer.description}</div>
        {offer.status === 'sent' && (
          <div style={{ marginTop: '10px' }}>
            <Btn variant="danger" size="sm" disabled={withdrawing} onClick={onWithdraw}>
              {withdrawing ? 'Withdrawing...' : 'Withdraw'}
            </Btn>
          </div>
        )}
      </div>
    </Card>
  )
}

// ── Shared subcomponents ────────────────────────────────────────────────────
function MessageBubble({ message, viewerRole }) {
  const mine =
    (viewerRole === 'attorney' && message.sender_role === 'attorney') ||
    (viewerRole === 'client' && message.sender_role === 'client')
  const isSystem = message.sender_role === 'system'
  if (isSystem) {
    return (
      <div style={{ textAlign: 'center', color: C.textDim, fontSize: '12px', fontStyle: 'italic' }}>
        {message.body}
      </div>
    )
  }
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

function AnswersPreview({ answers, expanded }) {
  const entries = answers && typeof answers === 'object' ? Object.entries(answers) : []
  if (entries.length === 0) return null
  const visible = expanded ? entries : entries.slice(0, 3)
  return (
    <div style={{ marginTop: '10px', padding: '10px 12px', background: C.surface2, borderRadius: '8px', fontSize: '12px' }}>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: C.textDim, letterSpacing: '0.04em', marginBottom: '6px' }}>
        Intake answers
      </div>
      {visible.map(([key, value]) => (
        <div key={key} style={{ marginBottom: '4px' }}>
          <span style={{ color: C.textMuted }}>{key}:</span>{' '}
          <span style={{ color: C.text }}>{Array.isArray(value) ? value.join(', ') : String(value ?? '')}</span>
        </div>
      ))}
      {!expanded && entries.length > 3 && (
        <div style={{ color: C.textDim, fontSize: '11px' }}>+ {entries.length - 3} more</div>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '20px 22px',
      }}
    >
      <h2 style={{ fontSize: '14px', fontWeight: 700, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>
        {title}
      </h2>
      <div style={{ display: 'grid', gap: '12px' }}>{children}</div>
    </section>
  )
}

function Field({ label, value, link, multiline }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textDim, marginBottom: '4px' }}>
        {label}
      </div>
      {link ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontSize: '14px', wordBreak: 'break-all' }}>
          {value}
        </a>
      ) : (
        <div style={{ fontSize: '14px', whiteSpace: multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-word' }}>
          {value}
        </div>
      )}
    </div>
  )
}

function Labeled({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <span style={{ fontSize: '12px', color: C.textMuted, fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}

function Notice({ children, tone }) {
  const isError = tone === 'error'
  return (
    <div
      style={{
        margin: '24px 28px',
        padding: '14px 16px',
        background: isError ? 'rgba(220,38,38,0.10)' : C.surface,
        border: `1px solid ${isError ? 'rgba(220,38,38,0.25)' : C.border}`,
        color: isError ? C.red : C.textMuted,
        borderRadius: '10px',
        fontSize: '13px',
      }}
    >
      {children}
    </div>
  )
}

const inputStyle = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  padding: '8px 10px',
  color: C.text,
  fontSize: '14px',
  fontFamily: 'inherit',
}
