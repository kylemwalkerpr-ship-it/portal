// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Badge, Card, NavItem } from './shared'
import AttorneyProfileEditor from './attorney-profile-editor'

const PAGE_TITLES = {
  overview: 'Overview',
  queue: 'Inquiry Queue',
  mine: 'My Inquiries',
  orders: 'Active Orders',
  earnings: 'Earnings',
  profile: 'My Profile',
  settings: 'Settings',
}

export default function AttorneyApp({ onLogout, userName }) {
  const [page, setPage] = React.useState('overview')
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
          {page === 'overview' && <OverviewPage onJump={setPage} />}
          {page === 'queue' && <QueuePage />}
          {page === 'mine' && <MyInquiriesPage />}
          {page === 'orders' && <OrdersPage />}
          {page === 'earnings' && <EarningsPage />}
          {page === 'profile' && <AttorneyProfileEditor />}
          {page === 'settings' && <SettingsPage />}
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
        <NavItem icon="⬛" label="Overview" active={page === 'overview'} onClick={() => setPage('overview')} />
        <NavItem icon="📥" label="Inquiry Queue" active={page === 'queue'} onClick={() => setPage('queue')} />
        <NavItem icon="📂" label="My Inquiries" active={page === 'mine'} onClick={() => setPage('mine')} />
        <NavItem icon="📦" label="Active Orders" active={page === 'orders'} onClick={() => setPage('orders')} />
        <NavItem icon="💰" label="Earnings" active={page === 'earnings'} onClick={() => setPage('earnings')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="👤" label="My Profile" active={page === 'profile'} onClick={() => setPage('profile')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
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

// ── Overview page ──────────────────────────────────────────────────────────
function OverviewPage({ onJump }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  const load = React.useCallback(() => {
    fetch('/api/attorney/data', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load overview.')
        setData(payload)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 12000)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <Notice>Loading overview...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  const s = data?.summary || {}
  const recent = (data?.orders || []).slice(0, 5)

  return (
    <div style={{ padding: '28px', display: 'grid', gap: '24px', maxWidth: '1080px' }}>
      <div>
        <div style={eyebrowStyle}>Dashboard</div>
        <h2 style={pageTitleStyle}>What's happening today.</h2>
      </div>

      {!data?.connect?.onboarding_complete && (
        <Card>
          <div style={{ padding: '16px 18px', borderLeft: `4px solid ${C.orange}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '14px' }}>Connect Stripe to receive payouts</div>
              <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>You can chat with clients now, but you need a payout account before sending paid offers.</div>
            </div>
            <Btn variant="primary" size="sm" onClick={() => onJump('settings')}>Set up payouts</Btn>
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <StatCard label="Open inquiries" value={s.open_inquiries ?? 0} sub="In the queue" onClick={() => onJump('queue')} />
        <StatCard label="My engagements" value={s.my_engaged_inquiries ?? 0} sub="Inquiries I've replied to" onClick={() => onJump('mine')} />
        <StatCard label="Active orders" value={s.active_orders ?? 0} sub="In progress" onClick={() => onJump('orders')} />
        <StatCard label="This month" value={`$${Number(s.earnings_month || 0).toFixed(0)}`} sub={`$${Number(s.earnings_lifetime || 0).toFixed(0)} lifetime`} onClick={() => onJump('earnings')} />
        <StatCard label="Rating" value={s.rating_avg ? `${s.rating_avg} ★` : 'New'} sub={s.rating_count ? `${s.rating_count} review${s.rating_count === 1 ? '' : 's'}` : 'No reviews yet'} />
      </div>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: '15px' }}>Recent active orders</div>
            <button onClick={() => onJump('orders')} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>See all →</button>
          </div>
          {recent.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '13px' }}>No active orders yet. Engage inquiries and send offers to start work.</div>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {recent.map((o) => <CompactOrderRow key={o.id} order={o} />)}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}

function StatCard({ label, value, sub, onClick }) {
  const interactive = typeof onClick === 'function'
  return (
    <div
      onClick={interactive ? onClick : undefined}
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: '14px',
        padding: '18px 18px',
        cursor: interactive ? 'pointer' : 'default',
        transition: 'border-color 140ms',
      }}
    >
      <div style={{ color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
      <div style={{ fontFamily: C.serif, fontSize: '30px', fontWeight: 500, color: C.text, marginTop: '4px', letterSpacing: '-0.012em' }}>{value}</div>
      {sub && <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

function CompactOrderRow({ order }) {
  return (
    <div style={{ padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ color: C.text, fontSize: '13px', fontWeight: 600 }}>{order.title}</div>
        <div style={{ color: C.textMuted, fontSize: '12px' }}>{order.client_name} · {order.progress}% · ${order.attorney_fee.toFixed(2)}</div>
      </div>
      <Badge color={order.is_complete ? 'green' : order.status === 'review' ? 'cyan' : 'orange'}>{order.is_complete ? 'completed' : order.status}</Badge>
    </div>
  )
}

// ── Orders page ────────────────────────────────────────────────────────────
function OrdersPage() {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [openId, setOpenId] = React.useState(null)
  const [filter, setFilter] = React.useState('active')

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch('/api/attorney/data', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load orders.')
        setData(payload)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (isInitial) setLoading(false) })
  }, [])

  React.useEffect(() => {
    load(true)
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(false) }, 8000)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <Notice>Loading your orders...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  if (openId) return <OrderDetail orderId={openId} onBack={() => { setOpenId(null); load(false) }} />

  const all = data?.orders || []
  const filtered = filter === 'all' ? all : filter === 'active' ? all.filter((o) => !o.is_complete) : all.filter((o) => o.is_complete)

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1080px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
        <div>
          <div style={eyebrowStyle}>Engagements</div>
          <h2 style={pageTitleStyle}>Active orders.</h2>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: 0 }}>Orders that came from accepted offers. Update progress as you work, mark deliverables complete to request escrow release.</p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {['active', 'completed', 'all'].map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={pillBtn(filter === f)}>{f}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card><div style={{ padding: '24px', textAlign: 'center', color: C.textMuted, fontSize: '14px' }}>No {filter} orders.</div></Card>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {filtered.map((o) => (
            <Card key={o.id}>
              <div onClick={() => setOpenId(o.id)} style={{ padding: '16px 18px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: C.text }}>{o.title}</div>
                    <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
                      {o.client_name} · {o.client_email} · started {new Date(o.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {o.messages > 0 && <Badge color="cyan">{o.messages} msg</Badge>}
                    <Badge color={o.is_complete ? 'green' : o.status === 'review' ? 'cyan' : 'orange'}>{o.is_complete ? 'completed' : o.status}</Badge>
                  </div>
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ height: '6px', background: C.surface3, borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${o.progress}%`, background: C.cyan, transition: 'width 200ms ease' }} />
                    </div>
                  </div>
                  <span style={{ color: C.textMuted, fontSize: '12px', minWidth: '50px', textAlign: 'right' }}>{o.progress}%</span>
                  <span style={{ fontFamily: C.serif, color: C.text, fontSize: '18px' }}>${o.attorney_fee.toFixed(0)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function OrderDetail({ orderId, onBack }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [progressDraft, setProgressDraft] = React.useState(0)
  const [savingProgress, setSavingProgress] = React.useState(false)
  const [completing, setCompleting] = React.useState(false)

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch(`/api/attorney/orders/${orderId}`, { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load order.')
        setData(payload)
        if (payload?.order?.progress != null) setProgressDraft(payload.order.progress)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => { if (isInitial) setLoading(false) })
  }, [orderId])

  React.useEffect(() => {
    load(true)
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(false) }, 6000)
    return () => clearInterval(id)
  }, [load])

  async function send(e) {
    e.preventDefault()
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/attorney/orders/${orderId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ body: draft }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Send failed.')
      setDraft('')
      load(false)
    } catch (e) { setError(e.message) } finally { setSending(false) }
  }

  async function saveProgress() {
    setSavingProgress(true)
    try {
      const res = await fetch(`/api/attorney/orders/${orderId}/progress`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ progress: progressDraft }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Update failed.')
      load(false)
    } catch (e) { setError(e.message) } finally { setSavingProgress(false) }
  }

  async function markComplete() {
    if (!confirm('Mark this order as ready for client review? They\'ll be notified to approve and release payment.')) return
    setCompleting(true)
    try {
      const res = await fetch(`/api/attorney/orders/${orderId}/complete`, { method: 'POST', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Complete failed.')
      load(false)
    } catch (e) { setError(e.message) } finally { setCompleting(false) }
  }

  if (loading) return <Notice>Loading order...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>
  if (!data) return null

  const order = data.order
  const messages = data.messages || []
  const completed = order.status === 'completed' || ['released', 'paid', 'completed'].includes(String(order.escrow_status || '').toLowerCase())

  return (
    <div style={{ padding: '20px 28px', maxWidth: '1080px' }}>
      <button onClick={onBack} style={backBtn}>← Back to orders</button>

      <Card>
        <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '16px', alignItems: 'flex-start' }}>
          <div>
            <div style={eyebrowStyle}>Order</div>
            <h2 style={{ fontFamily: C.serif, fontSize: '24px', fontWeight: 500, color: C.text, margin: '4px 0 8px' }}>{order.offer?.title || 'Custom engagement'}</h2>
            <div style={{ color: C.textMuted, fontSize: '13px' }}>
              {order.client_name} · {order.client_email}
            </div>
            {order.offer?.description && (
              <p style={{ marginTop: '10px', color: C.text, fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{order.offer.description}</p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <Badge color={completed ? 'green' : order.status === 'review' ? 'cyan' : 'orange'}>{completed ? 'completed' : order.status}</Badge>
            <div style={{ marginTop: '10px', fontFamily: C.serif, fontSize: '24px', color: C.text }}>${Number(order.attorney_fee || 0).toFixed(2)}</div>
            <div style={{ color: C.textMuted, fontSize: '11px' }}>your fee · client paid ${(Number(order.attorney_fee || 0) + Number(order.platform_fee || 0)).toFixed(2)}</div>
            <div style={{ color: C.textDim, fontSize: '11px', marginTop: '4px' }}>Payout: {order.payout_status}</div>
          </div>
        </div>
      </Card>

      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '12px' }}>
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '12px' }}>Conversation</div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflow: 'auto' }}>
                {messages.length === 0 && <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No messages yet.</div>}
                {messages.map((m) => <OrderBubble key={m.id} message={m} />)}
              </div>
              {!completed && (
                <form onSubmit={send} style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Reply to your client..." style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '10px 12px', color: C.text, fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }} />
                  <Btn type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>{sending ? 'Sending...' : 'Send'}</Btn>
                </form>
              )}
            </div>
          </Card>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '12px' }}>Progress</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range" min="0" max="100" step="5"
                  value={progressDraft}
                  onChange={(e) => setProgressDraft(Number(e.target.value))}
                  disabled={completed}
                  style={{ flex: 1 }}
                />
                <span style={{ fontFamily: C.serif, fontSize: '20px', color: C.text, minWidth: '50px', textAlign: 'right' }}>{progressDraft}%</span>
              </div>
              {!completed && progressDraft !== order.progress && (
                <Btn variant="ghost" size="sm" disabled={savingProgress} onClick={saveProgress} style={{ marginTop: '8px' }}>
                  {savingProgress ? 'Saving...' : 'Save progress'}
                </Btn>
              )}
            </div>
          </Card>

          {!completed && (
            <Card>
              <div style={{ padding: '16px 18px' }}>
                <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '6px' }}>Ready for review?</div>
                <p style={{ color: C.textMuted, fontSize: '12px', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Mark the deliverable complete. The client gets notified to approve and release escrow.
                </p>
                <Btn variant="primary" size="sm" fullWidth disabled={completing} onClick={markComplete}>
                  {completing ? 'Submitting...' : 'Submit for client review'}
                </Btn>
              </div>
            </Card>
          )}

          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '8px' }}>Order details</div>
              <DetailRow label="Order ID" value={order.id} mono />
              {order.offer?.delivery_days && <DetailRow label="Promised delivery" value={`${order.offer.delivery_days} days`} />}
              <DetailRow label="Started" value={new Date(order.created_at).toLocaleString()} />
              {order.completed_at && <DetailRow label="Completed" value={new Date(order.completed_at).toLocaleString()} />}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function OrderBubble({ message }) {
  const mine = message.sender_role === 'consultant'
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%', background: mine ? C.cyan : C.surface2, color: mine ? '#fff' : C.text, padding: '8px 12px', borderRadius: '10px', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
        {message.body}
        <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '4px' }}>{new Date(message.created_at).toLocaleString()}</div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.border}`, fontSize: '12px', gap: '8px' }}>
      <span style={{ color: C.textMuted }}>{label}</span>
      <span style={{ color: C.text, fontFamily: mono ? 'monospace' : 'inherit', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  )
}

// ── Earnings page ──────────────────────────────────────────────────────────
function EarningsPage() {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [opening, setOpening] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/attorney/data', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load earnings.')
        setData(payload)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function openStripe() {
    setOpening(true)
    try {
      const res = await fetch('/api/attorney/connect/dashboard-link', { method: 'POST', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.url) throw new Error(payload?.error || 'Could not open Stripe dashboard.')
      window.open(payload.url, '_blank', 'noopener')
    } catch (e) { setError(e.message) } finally { setOpening(false) }
  }

  if (loading) return <Notice>Loading earnings...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  const s = data?.summary || {}
  const trend = data?.trend || []
  const completed = (data?.orders || []).filter((o) => o.is_complete)
  const peak = trend.reduce((m, d) => Math.max(m, d.amount), 0) || 1

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1080px', display: 'grid', gap: '20px' }}>
      <div>
        <div style={eyebrowStyle}>Money</div>
        <h2 style={pageTitleStyle}>Earnings.</h2>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <StatCard label="This month" value={`$${Number(s.earnings_month || 0).toFixed(2)}`} sub="Released to date" />
        <StatCard label="Lifetime" value={`$${Number(s.earnings_lifetime || 0).toFixed(2)}`} sub="All-time fees" />
        <StatCard label="Completed orders" value={s.completed_orders ?? 0} sub="Total delivered" />
      </div>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: '14px' }}>Stripe Connect</div>
            {data?.connect?.onboarding_complete ? (
              <Btn variant="primary" size="sm" onClick={openStripe} disabled={opening}>{opening ? 'Opening...' : 'Open Stripe dashboard ↗'}</Btn>
            ) : (
              <Badge color="orange">Not connected</Badge>
            )}
          </div>
          <p style={{ color: C.textMuted, fontSize: '12px', margin: 0 }}>
            Payouts are handled by Stripe. Open the Stripe dashboard to view payout schedule, bank details, and tax forms.
          </p>
        </div>
      </Card>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '12px' }}>Last 30 days</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px' }}>
            {trend.map((d) => (
              <div key={d.date} title={`${d.date}: $${d.amount.toFixed(2)}`} style={{ flex: 1, height: `${(d.amount / peak) * 100}%`, background: d.amount > 0 ? C.cyan : C.surface3, minHeight: '2px', borderRadius: '2px' }} />
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '12px' }}>Completed engagements</div>
          {completed.length === 0 ? (
            <div style={{ color: C.textMuted, fontSize: '13px' }}>No completed orders yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Engagement</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Client</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}` }}>Completed</th>
                  <th style={{ padding: '8px 10px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>Earned</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((o) => (
                  <tr key={o.id}>
                    <td style={{ padding: '10px', color: C.text, fontSize: '13px' }}>{o.title}</td>
                    <td style={{ padding: '10px', color: C.textMuted, fontSize: '13px' }}>{o.client_name}</td>
                    <td style={{ padding: '10px', color: C.textMuted, fontSize: '12px' }}>{o.completed_at ? new Date(o.completed_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '10px', color: C.text, fontSize: '13px', textAlign: 'right', fontFamily: C.serif }}>${o.attorney_fee.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Settings page ──────────────────────────────────────────────────────────
function SettingsPage() {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [savedFlash, setSavedFlash] = React.useState('')

  const load = React.useCallback(() => {
    fetch('/api/attorney/profile', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load.')
        setData(payload)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { load() }, [load])

  async function startConnect() {
    setBusy(true)
    try {
      const res = await fetch('/api/attorney/connect/onboard', { method: 'POST', credentials: 'same-origin' })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.url) throw new Error(payload?.error || 'Could not start onboarding.')
      window.location.href = payload.url
    } catch (e) { setError(e.message); setBusy(false) }
  }

  async function toggleAvailable(v) {
    setBusy(true)
    try {
      const res = await fetch('/api/attorney/profile', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ available: v }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not save.')
      setData((d) => ({ ...d, attorney: { ...d.attorney, ...payload.attorney } }))
      setSavedFlash('Saved')
      window.setTimeout(() => setSavedFlash(''), 1400)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (loading) return <Notice>Loading settings...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  const a = data?.attorney || {}
  const stripeOnboarded = Boolean(a.stripe_account_id) && data?.attorney?.stripe_onboarding_complete

  return (
    <div style={{ padding: '24px 28px', maxWidth: '720px', display: 'grid', gap: '16px' }}>
      <div>
        <div style={eyebrowStyle}>Account</div>
        <h2 style={pageTitleStyle}>Settings.</h2>
        {savedFlash && <span style={{ color: C.green, fontSize: '12px', fontWeight: 700 }}>{savedFlash} ✓</span>}
      </div>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '6px' }}>Payouts</div>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: '0 0 12px' }}>
            {stripeOnboarded
              ? 'Stripe Connect is set up. You can receive payments from accepted offers.'
              : 'Connect a Stripe account to receive payouts. Without this, you can\'t send paid offers.'}
          </p>
          {!stripeOnboarded && (
            <Btn variant="primary" size="sm" onClick={startConnect} disabled={busy}>
              {busy ? 'Opening Stripe...' : 'Set up payouts with Stripe'}
            </Btn>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '14px' }}>Accepting new clients</div>
              <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px' }}>
                Turn off if your queue is full. Profile stays visible but cards show "Limited".
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleAvailable(!(a.available !== false))}
              disabled={busy}
              style={{ width: '46px', height: '26px', borderRadius: '999px', border: 'none', background: a.available !== false ? C.cyan : C.surface3, position: 'relative', cursor: busy ? 'not-allowed' : 'pointer', padding: 0 }}
            >
              <span style={{ position: 'absolute', top: '3px', left: a.available !== false ? '23px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 160ms' }} />
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '6px' }}>Account & sign-out</div>
          <p style={{ color: C.textMuted, fontSize: '13px', margin: '0 0 12px' }}>
            Email and password are managed by Clerk. Use the user menu to update them.
          </p>
        </div>
      </Card>
    </div>
  )
}

// ── Tiny styles ─────────────────────────────────────────────────────────────
const eyebrowStyle = { color: C.textMuted, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700, marginBottom: '6px' }
const pageTitleStyle = { fontFamily: C.serif, fontSize: '30px', fontWeight: 500, color: C.text, margin: '0 0 8px', letterSpacing: '-0.012em' }
const backBtn = { background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '13px', marginBottom: '14px', fontFamily: 'inherit', padding: 0 }
const pillBtn = (active) => ({
  padding: '6px 14px', borderRadius: '999px', border: `1px solid ${active ? C.cyan : C.border}`,
  background: active ? `${C.cyanGlow}` : C.surface, color: active ? C.cyan : C.textMuted,
  fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: active ? 600 : 500, textTransform: 'capitalize',
})

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
