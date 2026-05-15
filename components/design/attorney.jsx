// @ts-nocheck
'use client'
import React from 'react'
import { C, Btn, Badge, Card, NavItem, Avatar, UserMenu, PayoutBadge, StatCard as SharedStatCard, MessageBody } from './shared'
import AttorneyProfileEditor from './attorney-profile-editor'
import DashboardRightPane from './dashboard-right-pane'
import CustomOfferDialog from './custom-offer-dialog'
import { CountryChip } from './country-glyphs'
import DashboardGuide from './DashboardGuide'
import AttorneyEarnings from './attorney-earnings'
import AttorneyOrders from './attorney-orders'
import AttorneyInquiries from './attorney-inquiries'
import AttorneyMessages from './attorney-messages'
import AttorneyProfile from './attorney-profile'
import { LanguageSelector } from '../language-selector'

const PAGE_TITLES = {
  overview: 'Overview',
  queue: 'Inquiry Queue',
  mine: 'My Inquiries',
  orders: 'Active Orders',
  messages: 'Messages',
  earnings: 'Earnings',
  gigs: 'Gigs',
  profile: 'My Profile',
  settings: 'Settings',
}

export default function AttorneyApp({ onLogout, userName }) {
  const initialPage = React.useMemo(() => {
    if (typeof window === 'undefined') return 'overview'
    const goto = new URLSearchParams(window.location.search).get('goto')
    const allowed = ['overview','queue','mine','orders','messages','earnings','profile','settings']
    return allowed.includes(goto) ? goto : 'overview'
  }, [])
  const [page, setPage] = React.useState(initialPage)
  const [profileData, setProfileData] = React.useState(null)
  const [profileError, setProfileError] = React.useState('')
  const [dashboardData, setDashboardData] = React.useState(null)
  const [available, setAvailable] = React.useState(true)
  const [gigUsage, setGigUsage] = React.useState({ used: 0, limit: 5 })
  const [readNotifKeys, setReadNotifKeys] = React.useState(() => new Set())
  const headshotInputRef = React.useRef(null)
  const [uploadingHeadshot, setUploadingHeadshot] = React.useState(false)

  const refreshProfile = React.useCallback(() => {
    return fetch('/api/attorney/profile', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) {
          setProfileError(payload?.error || 'Could not load your profile.')
          return
        }
        setProfileData(payload)
        if (typeof payload?.attorney?.available === 'boolean') {
          setAvailable(payload.attorney.available)
        }
      })
      .catch((e) => setProfileError(e.message || 'Could not load profile.'))
  }, [])

  const refreshDashboard = React.useCallback(() => {
    return fetch('/api/attorney/data', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) return
        setDashboardData(payload)
        if (typeof payload?.connect?.available === 'boolean') {
          setAvailable(payload.connect.available)
        }
      })
      .catch(() => {})
  }, [])

  React.useEffect(() => { refreshProfile() }, [refreshProfile])
  React.useEffect(() => {
    refreshDashboard()
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') refreshDashboard()
    }, 30000)
    return () => clearInterval(id)
  }, [refreshDashboard])

  React.useEffect(() => {
    let cancelled = false

    const fetchGigCount = () => {
      if (cancelled) return
      fetch('/api/gigs?countOnly=true', { credentials: 'same-origin' })
        .then(async r => {
          const payload = await r.json().catch(() => ({}))
          const data = payload?.data || payload
          if (!r.ok) return // keep current value on error — don't reset to 0
          const next = { used: Number(data.used ?? data.count ?? 0), limit: Number(data.limit ?? 5) }
          if (!cancelled) setGigUsage(next)
        })
        .catch(() => {}) // silent — never reset the badge on a network blip
    }

    // Fetch immediately on mount (no cache — always fresh)
    fetchGigCount()

    // Refetch when the user returns to this tab after e.g. creating a gig elsewhere
    const onVisibility = () => { if (document.visibilityState === 'visible') fetchGigCount() }
    document.addEventListener('visibilitychange', onVisibility)

    // Keep in sync every 30 s (same cadence as refreshDashboard)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') fetchGigCount()
    }, 30000)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
    }
  }, [])

  const profileId = profileData?.profile?.id || ''
  const readKey = profileId ? `attorney:notif-read:${profileId}` : ''

  React.useEffect(() => {
    if (!readKey) return
    try {
      const raw = window.localStorage.getItem(readKey)
      if (raw) setReadNotifKeys(new Set(JSON.parse(raw)))
    } catch { /* ignore */ }
  }, [readKey])

  const persistReadNotifs = React.useCallback((next) => {
    if (!readKey) return
    try { window.localStorage.setItem(readKey, JSON.stringify(Array.from(next))) } catch { /* ignore */ }
  }, [readKey])

  const notifications = React.useMemo(() => {
    const list = []
    const orders = dashboardData?.orders || []
    const summary = dashboardData?.summary || {}
    if ((summary.open_inquiries ?? 0) > 0) {
      list.push({
        key: `inquiries-open:${summary.open_inquiries}`,
        text: `${summary.open_inquiries} open inquir${summary.open_inquiries === 1 ? 'y' : 'ies'} in the queue`,
        time: 'Live',
        dot: C.cyan,
        target: 'queue',
      })
    }
    for (const o of orders) {
      if (!o.is_complete && (o.status === 'active' || o.status === 'queued')) {
        list.push({
          key: `order-active:${o.id}`,
          text: `Active engagement: ${o.title} — ${o.client_name}`,
          time: o.created_at ? new Date(o.created_at).toLocaleDateString() : '',
          dot: C.cyan,
          target: 'orders',
        })
      }
      if (o.payout_status === 'failed') {
        list.push({
          key: `payout-failed:${o.id}`,
          text: `Payout failed for ${o.title}`,
          time: 'Needs review',
          dot: C.red,
          target: 'earnings',
        })
      }
    }
    return list
  }, [dashboardData])

  const visibleNotifications = React.useMemo(
    () => notifications.filter((n) => !readNotifKeys.has(n.key)),
    [notifications, readNotifKeys],
  )

  const markNotifsRead = React.useCallback((keys) => {
    if (!keys || keys.length === 0) return
    setReadNotifKeys((prev) => {
      const next = new Set(prev)
      for (const k of keys) next.add(k)
      persistReadNotifs(next)
      return next
    })
  }, [persistReadNotifs])

  const clearReadNotifs = React.useCallback(() => {
    setReadNotifKeys(new Set())
    if (readKey) {
      try { window.localStorage.removeItem(readKey) } catch { /* ignore */ }
    }
  }, [readKey])

  const handleNotificationClick = React.useCallback((n) => {
    markNotifsRead([n.key])
    if (n.target) setPage(n.target)
  }, [markNotifsRead])

  const toggleAvailable = React.useCallback(async () => {
    const next = !available
    setAvailable(next)
    try {
      const res = await fetch('/api/attorney/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ available: next }),
      })
      if (!res.ok) throw new Error('Could not update availability')
    } catch {
      setAvailable(!next)
    }
  }, [available])

  const uploadHeadshot = React.useCallback(async (file) => {
    if (!file) return
    setUploadingHeadshot(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/attorney/profile/headshot', { method: 'POST', credentials: 'same-origin', body: form })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Upload failed')
      setProfileData((prev) => prev ? { ...prev, attorney: { ...(prev.attorney || {}), headshot_url: payload.headshot_url, headshot_path: payload.headshot_path } } : prev)
    } catch { /* surfaced via no-op; profile editor handles errors */ }
    finally {
      setUploadingHeadshot(false)
      if (headshotInputRef.current) headshotInputRef.current.value = ''
    }
  }, [])

  const displayName = profileData?.profile?.full_name || userName || ''
  const headshotUrl = profileData?.attorney?.headshot_url || ''
  const profileEmail = profileData?.profile?.email || ''

  return (
    <div className="yousafe-dashboard-shell" style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'inherit' }}>
      <input ref={headshotInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadHeadshot(e.target.files?.[0])} />
      <Sidebar
        page={page}
        setPage={setPage}
        onLogout={onLogout}
        displayName={displayName}
        headshotUrl={headshotUrl}
        available={available}
        toggleAvailable={toggleAvailable}
        gigUsage={gigUsage}
      />
      <div className="yousafe-dashboard-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar
          title={PAGE_TITLES[page]}
          notifications={visibleNotifications}
          readCount={readNotifKeys.size}
          onMarkAllRead={() => markNotifsRead(visibleNotifications.map((n) => n.key))}
          onClearRead={clearReadNotifs}
          onNotificationClick={handleNotificationClick}
          displayName={displayName || 'Attorney'}
          email={profileEmail}
          headshotUrl={headshotUrl}
          onLogout={onLogout}
          onNavigate={setPage}
          onChangeHeadshot={() => headshotInputRef.current?.click()}
          uploadingHeadshot={uploadingHeadshot}
        />
        <div className="yousafe-dashboard-scroll" style={{ flex: 1, overflow: 'auto' }}>
          <div className="yousafe-dashboard-body" style={{ display: 'flex', alignItems: 'flex-start', gap: '0', minHeight: '100%' }}>
            <main className="yousafe-dashboard-content" style={{ flex: 1, minWidth: 0 }}>
              {page === 'overview' && <OverviewPage onJump={setPage} />}
              {page === 'queue' && <AttorneyInquiries mode="queue" />}
              {page === 'mine' && <AttorneyInquiries mode="mine" />}
              {page === 'orders' && <OrdersPage />}
              {page === 'messages' && <AttorneyMessages />}
              {page === 'earnings' && <AttorneyEarnings />}
              {page === 'profile' && <AttorneyProfile />}
              {page === 'settings' && <SettingsPage />}
            </main>
            <DashboardRightPane role="attorney" />
          </div>
        </div>
      </div>
    </div>
  )
}

function TopBar({ title, notifications, readCount, onMarkAllRead, onClearRead, onNotificationClick, displayName, email, headshotUrl, onLogout, onNavigate, onChangeHeadshot, uploadingHeadshot }) {
  const [notifOpen, setNotifOpen] = React.useState(false)
  return (
    <div
      className="yousafe-topbar"
      style={{
        height: '60px',
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <h1 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <LanguageSelector placement="inline" />
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
            style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', color: C.textMuted, fontSize: '16px' }}
          >
            🔔
          </button>
          {notifications.length > 0 && (
            <div style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: C.red, borderRadius: '50%', border: `2px solid ${C.surface}` }} />
          )}
          {notifOpen && (
            <div className="yousafe-notification-menu" style={{ position: 'absolute', right: 0, top: '44px', width: '320px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100 }}>
              <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>Notifications</span>
                {notifications.length > 0 && (
                  <button onClick={onMarkAllRead} style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: 600 }}>
                    Mark all read
                  </button>
                )}
              </div>
              {notifications.length > 0 ? notifications.map((n, i) => (
                <button
                  key={n.key}
                  type="button"
                  onClick={() => { onNotificationClick(n); setNotifOpen(false) }}
                  style={{ width: '100%', textAlign: 'left', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'flex-start', borderBottom: i < notifications.length - 1 ? `1px solid ${C.border}` : 'none', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: n.dot || C.cyan, marginTop: '5px', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: C.text, lineHeight: 1.4 }}>{n.text}</div>
                    <div style={{ fontSize: '11px', color: C.textDim, marginTop: '3px' }}>{n.time}</div>
                  </div>
                </button>
              )) : (
                <div style={{ padding: '20px', color: C.textMuted, fontSize: '14px', textAlign: 'center' }}>
                  You're all caught up.
                </div>
              )}
              {readCount > 0 && (
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <button onClick={onClearRead} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                    Reset read state
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <UserMenu
          name={displayName}
          role="Attorney"
          email={email}
          avatarSrc={headshotUrl}
          color={C.cyan}
          onNavigate={onNavigate}
          onLogout={onLogout}
          items={[
            { label: 'My profile', icon: '👤', action: () => onNavigate?.('profile') },
            { label: uploadingHeadshot ? 'Uploading photo…' : (headshotUrl ? 'Change photo' : 'Upload headshot'), icon: '🖼️', action: () => onChangeHeadshot?.() },
            { label: 'Earnings', icon: '💰', action: () => onNavigate?.('earnings') },
            { label: 'Messages', icon: '💬', action: () => onNavigate?.('messages') },
            { label: 'Settings', icon: '⚙️', action: () => onNavigate?.('settings') },
          ]}
        />
      </div>
    </div>
  )
}

function Sidebar({ page, setPage, onLogout, displayName, headshotUrl, available, toggleAvailable, gigUsage }) {
  const [loggingOut, setLoggingOut] = React.useState(false)
  const goToRoute = (href) => {
    if (typeof window !== 'undefined') window.location.href = href
  }
  const handleLogout = () => {
    if (loggingOut) return
    setLoggingOut(true)
    onLogout?.()
  }
  const gigsActive = typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard/gigs')
  const gigsBadge = `${Number(gigUsage?.used || 0)}/${Number(gigUsage?.limit || 5)}`
  const gigsAtLimit = Number(gigUsage?.used || 0) >= Number(gigUsage?.limit || 5)

  return (
    <div
      className="yousafe-sidebar"
      style={{
        width: '240px',
        flexShrink: 0,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '20px 16px', borderBottom: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '3px', background: `linear-gradient(90deg, ${C.cyan} 0%, ${C.cyan} 40%, #fff 40%, #fff 60%, ${C.navy} 60%, ${C.navy} 100%)` }} />
        <a
          href="https://yousafeconsultancy.com"
          aria-label="Back to Yousafe Consultancy"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none', color: 'inherit' }}
        >
          <div style={{ fontWeight: 700, fontSize: '14px', color: C.text }}>YouSafe</div>
          <Badge color="cyan" style={{ fontSize: '10px', padding: '2px 8px' }}>Attorney</Badge>
        </a>
        <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '4px' }}>
          {displayName || 'Panel member'}
        </div>
      </div>
      <div className="yousafe-sidebar-nav" style={{ padding: '12px 8px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <NavItem icon="⬛" label="Overview" active={page === 'overview'} onClick={() => setPage('overview')} />
        <NavItem icon="📥" label="Inquiry Queue" active={page === 'queue'} onClick={() => setPage('queue')} />
        <NavItem icon="📂" label="My Inquiries" active={page === 'mine'} onClick={() => setPage('mine')} />
        <NavItem icon="📦" label="Active Orders" active={page === 'orders'} onClick={() => setPage('orders')} />
        <NavItem icon="💬" label="Messages" active={page === 'messages'} onClick={() => setPage('messages')} />
        <NavItem icon="💼" label="Gigs" active={gigsActive} onClick={() => goToRoute('/dashboard/gigs')} badge={gigsBadge} badgeColor={gigsAtLimit ? 'orange' : 'gray'} />
        <NavItem icon="💰" label="Earnings" active={page === 'earnings'} onClick={() => setPage('earnings')} />
        <div style={{ height: '1px', background: C.border, margin: '8px 6px' }} />
        <NavItem icon="👤" label="My Profile" active={page === 'profile'} onClick={() => setPage('profile')} />
        <NavItem icon="⚙️" label="Settings" active={page === 'settings'} onClick={() => setPage('settings')} />
      </div>
      <div className="yousafe-sidebar-user" style={{ padding: '12px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '10px', background: C.surface2 }}>
          <Avatar name={displayName || 'Attorney'} src={headshotUrl} size={32} color={C.cyan} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName || 'Attorney'}</div>
            <button
              type="button"
              onClick={toggleAvailable}
              title={available ? 'Available — click to pause new clients' : 'Unavailable — click to resume'}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11px', color: available ? C.green : C.textDim, fontFamily: 'inherit' }}
            >
              ● {available ? 'Available' : 'Unavailable'}
            </button>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Log out and return to Yousafe Consultancy"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              background: C.surface,
              color: loggingOut ? C.textDim : C.textMuted,
              cursor: loggingOut ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 700,
              padding: '7px 9px',
              whiteSpace: 'nowrap',
              opacity: loggingOut ? 0.6 : 1,
            }}
            title={loggingOut ? 'Signing out…' : 'Log out'}
          >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>⏻</span>
            <span>Logout</span>
          </button>
        </div>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>
                    {q.country ? <CountryChip country={q.country} /> : <span>—</span>}
                    <span>· {new Date(q.created_at).toLocaleString()}</span>
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

function AttorneyMessagesPage() {
  const [chats, setChats] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [activeId, setActiveId] = React.useState(null)

  const load = React.useCallback((isInitial) => {
    if (isInitial) setLoading(true)
    fetch('/api/attorney/chats', { credentials: 'same-origin' })
      .then(async r => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load chats.')
        const rows = payload.chats || []
        setChats(rows)
        setActiveId(prev => {
          if (rows.some(chat => chat.id === prev)) return prev
          return rows[0]?.id || null
        })
        setError('')
      })
      .catch(e => setError(e.message))
      .finally(() => { if (isInitial) setLoading(false) })
  }, [])

  React.useEffect(() => {
    load(true)
    const id = setInterval(() => { if (document.visibilityState === 'visible') load(false) }, 6000)
    return () => clearInterval(id)
  }, [load])

  if (loading) return <Notice>Loading chats...</Notice>
  if (error) return <Notice tone="error">{error}</Notice>

  const activeChat = chats.find(chat => chat.id === activeId)

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={eyebrowStyle}>Pre-intake</div>
        <h2 style={pageTitleStyle}>Attorney chats.</h2>
      </div>
      {chats.length === 0 ? (
        <Notice>No pre-intake chats yet. Students can start one from your public profile.</Notice>
      ) : (
        <div className="yousafe-message-layout" style={{ display: 'grid', gridTemplateColumns: '320px minmax(0, 1fr)', gap: '20px', minHeight: 'calc(100vh - 210px)' }}>
          <div className="yousafe-conversation-list" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden', alignSelf: 'start' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: '11px', color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 800 }}>Conversations</div>
            </div>
            {chats.map(chat => {
              const active = chat.id === activeId
              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => setActiveId(chat.id)}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    border: 'none',
                    borderBottom: `1px solid ${C.border}`,
                    background: active ? C.surface2 : 'transparent',
                    cursor: 'pointer',
                    color: C.text,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}
                >
                  <Avatar name={chat.client_name || chat.client_email || 'Client'} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.client_name || 'Client'}</div>
                      {chat.pending_offers > 0 && <span style={{ color: C.orange, fontSize: '11px', fontWeight: 800, flexShrink: 0 }}>{chat.pending_offers}</span>}
                    </div>
                    <div style={{ color: C.textMuted, fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.client_email}</div>
                    <div style={{ color: active ? C.textMuted : C.textDim, fontSize: '12px', marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.last_message || 'No messages yet'}</div>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="yousafe-message-thread" style={{ minWidth: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: '14px', overflow: 'hidden' }}>
            {activeChat ? (
              <InquiryThread inquiryId={activeChat.id} isChat embedded onBack={() => load(false)} />
            ) : (
              <div style={{ height: '100%', minHeight: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: '13px' }}>
                Select a conversation.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inquiry thread ──────────────────────────────────────────────────────────
export function InquiryThread({ inquiryId, onBack, isChat = false, embedded = false }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [showOfferModal, setShowOfferModal] = React.useState(false)
  const [withdrawingId, setWithdrawingId] = React.useState(null)
  const [connect, setConnect] = React.useState(null)
  const chatFileRef = React.useRef(null)

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
      .catch(() => setConnect({ has_account: false, onboarding_complete: false, effective_onboarded: false, attorney_platform_fee_percent: 25 }))
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

  async function sendMessage(e, file) {
    e?.preventDefault?.()
    if ((!draft.trim() && !file) || sending) return
    setSending(true)
    try {
      let res
      if (file) {
        const form = new FormData()
        form.append('body', draft)
        form.append('file', file)
        res = await fetch(isChat ? `/api/attorney/chats/${inquiryId}/messages` : `/api/attorney/inquiries/${inquiryId}/messages`, { method: 'POST', credentials: 'same-origin', body: form })
      } else {
        res = await fetch(isChat ? `/api/attorney/chats/${inquiryId}/messages` : `/api/attorney/inquiries/${inquiryId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ body: draft }),
        })
      }
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Could not send message.')
      setDraft('')
      load(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
      if (chatFileRef.current) chatFileRef.current.value = ''
    }
  }

  async function withdrawOffer(offerOrId) {
    if (withdrawingId) return
    const offer = typeof offerOrId === 'object' && offerOrId ? offerOrId : null
    const offerId = offer?.id || offerOrId
    const unified = offer?.source_type === 'unified_offer'
    setWithdrawingId(offerId)
    try {
      let res = await fetch(unified ? `/api/offers/${offerId}/withdraw` : `/api/attorney/offers/${offerId}/withdraw`, { method: 'POST', credentials: 'same-origin' })
      let payload = await res.json().catch(() => null)
      if (!res.ok && !unified) {
        res = await fetch(`/api/offers/${offerId}/withdraw`, { method: 'POST', credentials: 'same-origin' })
        payload = await res.json().catch(() => null)
      }
      if (!res.ok) throw new Error(payload?.error?.message || payload?.error || 'Could not withdraw offer.')
      load(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setWithdrawingId(null)
    }
  }

  if (loading) return embedded ? <div style={{ padding: '20px', color: C.textMuted, fontSize: '13px' }}>Loading thread...</div> : <Notice>Loading thread...</Notice>
  if (error) return embedded ? <div style={{ padding: '20px', color: C.red, fontSize: '13px' }}>{error}</div> : <Notice tone="error">{error}</Notice>
  if (!data) return null

  const inquiry = data.inquiry
  const messages = data.messages || []
  const offers = data.offers || []
  const hasPendingOffer = offers.some((o) => o.status === 'sent')
  const effectiveOnboarded = Boolean(connect?.effective_onboarded ?? connect?.onboarding_complete)
  const bypassed = Boolean(connect?.bypassed)
  const livePercent = Number.isFinite(Number(connect?.attorney_platform_fee_percent))
    ? Number(connect.attorney_platform_fee_percent)
    : DEFAULT_ATTORNEY_FEE_PERCENT

  return (
    <div className="yousafe-thread-page" style={{ padding: embedded ? '18px 20px' : '20px 28px', maxWidth: embedded ? 'none' : '920px' }}>
      {!embedded && (
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '13px', marginBottom: '12px', fontFamily: 'inherit' }}
        >
          ← Back to {isChat ? 'messages' : 'my inquiries'}
        </button>
      )}

      <ClientBanner inquiry={inquiry} isChat={isChat} />

      {!isChat && <div style={{ marginTop: '14px' }}><Card><div style={{ padding: '14px 18px' }}><AnswersPreview answers={inquiry.answers} expanded /></div></Card></div>}

      <ConversationBox
        messages={messages}
        offers={offers}
        viewerRole="attorney"
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        onSend={sendMessage}
        fileRef={chatFileRef}
        onWithdrawOffer={withdrawOffer}
        withdrawingOfferId={withdrawingId}
      />

      <div style={{ marginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', gap: '12px', flexWrap: 'wrap' }}>
          <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, margin: 0 }}>
            My offers
          </h3>
          {!hasPendingOffer && inquiry.status !== 'converted' && (
            effectiveOnboarded ? (
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
        {connect && !connect.onboarding_complete && !bypassed && (
          <div style={{ marginBottom: '10px', padding: '10px 12px', background: 'rgba(245,180,0,0.10)', border: '1px solid rgba(245,180,0,0.25)', borderRadius: '8px', color: '#a36a00', fontSize: '12px' }}>
            You can chat with the client now, but you must connect Stripe before sending a paid offer. Click the button above to onboard.
          </div>
        )}
        {bypassed && !connect?.onboarding_complete && (
          <div style={{ marginBottom: '10px', padding: '10px 12px', background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: '8px', color: C.cyan, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>✓</span>
            <span>Admin Stripe bypass is enabled — you can send paid offers now. Payouts hold until your Connect account verifies.</span>
          </div>
        )}
        {offers.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: '13px' }}>You haven&apos;t sent an offer on this inquiry yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {offers.map((o) => (
              <OfferRow key={o.id} offer={o} onWithdraw={() => withdrawOffer(o)} withdrawing={withdrawingId === o.id} />
            ))}
          </div>
        )}
      </div>

      {showOfferModal && (
        <CustomOfferDialog
          chatId={inquiryId}
          providerRole="attorney"
          recipientName={inquiry?.full_name || inquiry?.email || 'Client'}
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

// Fallback used only if the live admin-controlled percent fails to load.
// The server snapshots the actual current setting at offer-creation time,
// which is the source of truth on the offer row.
const DEFAULT_ATTORNEY_FEE_PERCENT = 25

function OfferModal({ inquiryId, onClose, onCreated, feePercent }) {
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [price, setPrice] = React.useState('')
  const [deliveryDays, setDeliveryDays] = React.useState('7')
  const [expiresInDays, setExpiresInDays] = React.useState('7')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState('')

  const livePercent = Number.isFinite(Number(feePercent)) ? Number(feePercent) : DEFAULT_ATTORNEY_FEE_PERCENT
  const numericPrice = Number(price) || 0
  const previewPlatformFee = Math.round(numericPrice * (livePercent / 100) * 100) / 100
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
              <span style={{ color: C.text }}>Platform fee ({livePercent}%)</span>
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

      <DashboardGuide role="attorney" />

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

      <ActiveGigsPanel />
    </div>
  )
}

function ActiveGigsPanel() {
  const [gigs, setGigs] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch('/api/gigs', { credentials: 'same-origin' })
      .then(async r => {
        const payload = await r.json().catch(() => ({}))
        const data = payload?.data ?? payload
        setGigs((data?.gigs ?? []).filter(g => g.status === 'active'))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  return (
    <Card>
      <div style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: '15px' }}>Your active services</div>
          <a href="/dashboard/gigs" style={{ color: C.cyan, fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>Manage all →</a>
        </div>
        {gigs.length === 0 ? (
          <div style={{ color: C.textMuted, fontSize: '13px' }}>
            No active services yet.{' '}
            <a href="/dashboard/gigs/new" style={{ color: C.cyan, textDecoration: 'none', fontWeight: 600 }}>Create your first service →</a>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {gigs.map(gig => (
              <div key={gig.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{gig.title}</div>
                  {gig.category && <div style={{ fontSize: '12px', color: C.textMuted, marginTop: '2px' }}>{gig.category}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                  {gig.metrics && (
                    <div style={{ fontSize: '11px', color: C.textMuted, display: 'flex', gap: '10px' }}>
                      <span>{gig.metrics.impressions ?? 0} views</span>
                      <span>{gig.metrics.clicks ?? 0} clicks</span>
                    </div>
                  )}
                  <a href={`/dashboard/gigs/${gig.id}/edit`} style={{ fontSize: '12px', color: C.cyan, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>Edit</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
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
  const [openId, setOpenId] = React.useState(null)
  if (openId) return <OrderDetail orderId={openId} onBack={() => setOpenId(null)} />
  return <AttorneyOrders onOpenOrder={(id) => setOpenId(id)} />
}

export function OrderDetail({ orderId, onBack }) {
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [draft, setDraft] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [progressDraft, setProgressDraft] = React.useState(0)
  const [savingProgress, setSavingProgress] = React.useState(false)
  const [completing, setCompleting] = React.useState(false)
  const fileRef = React.useRef(null)

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

  async function send(e, file) {
    e?.preventDefault?.()
    if ((!draft.trim() && !file) || sending) return
    setSending(true)
    try {
      let res
      if (file) {
        const form = new FormData()
        form.append('body', draft)
        form.append('file', file)
        res = await fetch(`/api/attorney/orders/${orderId}/messages`, { method: 'POST', credentials: 'same-origin', body: form })
      } else {
        res = await fetch(`/api/attorney/orders/${orderId}/messages`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ body: draft }),
        })
      }
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error || 'Send failed.')
      setDraft('')
      load(false)
    } catch (e) { setError(e.message) } finally {
      setSending(false)
      if (fileRef.current) fileRef.current.value = ''
    }
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

  async function startOrder() {
    setSavingProgress(true)
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: 'in_progress', note: 'Started by attorney' }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) throw new Error(payload?.error?.message || payload?.error || 'Could not start order.')
      load(false)
    } catch (e) { setError(e.message) } finally { setSavingProgress(false) }
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
            {order.status === 'created' && (
              <Btn variant="primary" size="sm" disabled={savingProgress} onClick={startOrder} style={{ marginTop: '10px' }}>
                {savingProgress ? 'Starting...' : 'Start order'}
              </Btn>
            )}
          </div>
        </div>
      </Card>

      <div className="yousafe-mobile-stack" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: '12px' }}>
          <Card>
            <div style={{ padding: '16px 18px' }}>
              <div style={{ fontWeight: 700, color: C.text, fontSize: '14px', marginBottom: '12px' }}>Conversation</div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflow: 'auto' }}>
                {messages.length === 0 && <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '12px 0' }}>No messages yet.</div>}
                {messages.map((m) => <OrderBubble key={m.id} message={m} />)}
              </div>
              {!completed && (
                <form onSubmit={send} style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => send(e, e.target.files?.[0])} />
                  <Btn type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} title="Attach a file">📎</Btn>
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
              <DetailRow label="Order #" value={order.order_number || order.id} mono />
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
  const fromStudent = message.sender_role === 'client'
  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%', background: fromStudent ? C.studentMessageBg : mine ? C.outboundMessageBg : C.surface2, color: fromStudent ? C.studentMessageText : mine ? C.outboundMessageText : C.text, border: fromStudent ? `1px solid ${C.studentMessageBorder}` : mine ? `1px solid ${C.outboundMessageBorder}` : 'none', padding: '8px 12px', borderRadius: '10px', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
        <MessageBody body={message.body} linkColor={C.cyan} />
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
function EarningsPage({ data: dataProp, refresh }) {
  const [data, setData] = React.useState(dataProp || null)
  const [loading, setLoading] = React.useState(!dataProp)
  const [error, setError] = React.useState('')
  const [opening, setOpening] = React.useState(false)

  React.useEffect(() => {
    if (dataProp) {
      setData(dataProp)
      setLoading(false)
      return
    }
    fetch('/api/attorney/data', { credentials: 'same-origin' })
      .then(async (r) => {
        const payload = await r.json().catch(() => null)
        if (!r.ok) throw new Error(payload?.error || 'Could not load earnings.')
        setData(payload)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [dataProp])

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
  const orders = data?.orders || []
  const completed = orders.filter((o) => o.is_complete)
  const completedOrders = completed.length

  const transferred = completed.filter((o) => o.payout_status === 'transferred')
  const pending = completed.filter((o) => o.payout_status !== 'transferred')
  const transferredTotal = transferred.reduce((a, o) => a + Number(o.attorney_fee || 0), 0)
  const pendingTotal = pending.reduce((a, o) => a + Number(o.attorney_fee || 0), 0)
  const lifetime = Number(s.earnings_lifetime || 0)
  const monthEarnings = Number(s.earnings_month || 0)

  const monthlyByKey = completed.reduce((acc, o) => {
    if (!o.completed_at || o.payout_status !== 'transferred') return acc
    const d = new Date(o.completed_at)
    if (Number.isNaN(d.getTime())) return acc
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleString(undefined, { month: 'short', year: 'numeric' })
    acc[key] = acc[key] || { label, amount: 0, count: 0 }
    acc[key].amount += Number(o.attorney_fee || 0)
    acc[key].count += 1
    return acc
  }, {})
  const monthlyRows = Object.entries(monthlyByKey).sort(([a], [b]) => b.localeCompare(a)).slice(0, 12)
  const payoutRows = completed.filter((o) => o.payout_status === 'transferred' || o.payout_status === 'failed')

  return (
    <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 800 }}>Earnings</h2>

      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #0d2060 100%)`, borderRadius: '20px', padding: '28px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: '100%', background: C.cyan }} />
        <div style={{ position: 'absolute', top: 0, right: '6px', width: '6px', height: '100%', background: '#fff', opacity: 0.15 }} />
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '8px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase' }}>Transferred to your bank</div>
        <div style={{ fontSize: '48px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>${transferredTotal.toFixed(2)}</div>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '13px', marginBottom: '20px' }}>
          Payouts move to your connected bank automatically when engagements are completed and approved by the client.
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          {data?.connect?.onboarding_complete ? (
            <Btn variant="primary" size="md" onClick={openStripe} disabled={opening}>
              {opening ? 'Opening Stripe…' : 'Open Stripe payout dashboard'}
            </Btn>
          ) : (
            <Badge color="orange">Stripe not connected — set up payouts in Settings</Badge>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
        <SharedStatCard label="This Month" value={`$${monthEarnings.toFixed(2)}`} icon="📈" color={C.green} />
        <SharedStatCard label="All Time" value={`$${lifetime.toFixed(2)}`} icon="💰" color={C.cyan} />
        <SharedStatCard label="Pending Payout" value={`$${pendingTotal.toFixed(2)}`} icon="⏳" color={C.orange} />
        <SharedStatCard label="Completed Orders" value={completedOrders} icon="✅" color={C.purple} />
      </div>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Monthly Breakdown</div>
          {monthlyRows.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {monthlyRows.map(([key, row]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '10px', background: C.surface2, fontSize: '13px' }}>
                  <span style={{ color: C.text, fontWeight: 600 }}>{row.label}</span>
                  <span style={{ color: C.textMuted }}>{row.count} order{row.count === 1 ? '' : 's'}</span>
                  <span style={{ color: C.green, fontWeight: 700 }}>${row.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
              No transferred payouts yet. Earnings appear here once Stripe Connect transfers complete.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '16px' }}>Payout History</div>
          {payoutRows.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {payoutRows.map((o) => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.border}`, fontSize: '13px', gap: '12px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</div>
                    <div style={{ color: C.textMuted, fontSize: '12px' }}>{o.client_name} · {o.completed_at ? new Date(o.completed_at).toLocaleDateString() : '—'}</div>
                  </div>
                  <PayoutBadge status={o.payout_status} />
                  <span style={{ fontWeight: 700, color: o.payout_status === 'transferred' ? C.green : C.orange, fontFamily: C.serif }}>${Number(o.attorney_fee || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.8 }}>
              Your payout history will populate when Stripe Connect transfers settle.
            </div>
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

const QUICK_REPLIES = [
  {
    label: 'Intro & next steps',
    body:
      "Hello — thanks for reaching out. I’ve reviewed the details you shared. Before I can scope a fixed price, I’d like to confirm a couple of items:\n\n1. Your current status / most recent filings\n2. Any prior denials or pending notices\n3. Your target timeline\n\nReply here and I’ll send a written offer with scope, deliverables, and an estimated turnaround.",
  },
  {
    label: 'Documents needed',
    body:
      "Could you upload the following so I can finalize scope?\n\n• Government-issued ID\n• Most recent status / approval notice\n• Any prior application or denial paperwork\n• Supporting evidence (employment, financials, school letters as applicable)\n\nUse the paperclip in the composer to attach. Anything you’re unsure about, just describe it and I’ll flag what’s actually required.",
  },
  {
    label: 'Pricing how it works',
    body:
      "On YouSafe, my fee is paid in full to me. The platform fee is added on top and disclosed to you before checkout — it isn’t taken out of my fee. Funds sit in escrow until the work is delivered and you approve it. Once approved, the payout releases to me.",
  },
  {
    label: 'Conflict / out of scope',
    body:
      "Thank you for reaching out. After reviewing the details, this matter is outside the scope I currently take on, so I won’t be able to send an offer. The YouSafe queue lets other panel attorneys see your inquiry, and I’d encourage you to wait for an alternative engagement. Best of luck.",
  },
]

function ClientBanner({ inquiry, isChat }) {
  const initial = (inquiry?.full_name || inquiry?.email || '?').trim().charAt(0).toUpperCase()
  const submitted = inquiry?.created_at ? new Date(inquiry.created_at) : null
  return (
    <Card>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div
              style={{
                width: '44px', height: '44px', borderRadius: '50%',
                background: `${C.cyan}18`, color: C.cyan,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '17px', flexShrink: 0, fontFamily: C.serif,
              }}
            >
              {initial}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: C.serif, fontSize: '20px', fontWeight: 600, color: C.text, lineHeight: 1.15, letterSpacing: '-0.005em' }}>
                {inquiry?.full_name || 'Client'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 14px', marginTop: '6px', fontSize: '12.5px', color: C.textMuted }}>
                {inquiry?.email && (
                  <a href={`mailto:${inquiry.email}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span>✉</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inquiry.email}</span>
                  </a>
                )}
                {inquiry?.phone && (
                  <a href={`tel:${inquiry.phone}`} style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span>📞</span><span>{inquiry.phone}</span>
                  </a>
                )}
                {inquiry?.country && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span>🌍</span><span>{inquiry.country}</span>
                  </span>
                )}
                {inquiry?.preferred_contact && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span>Preferred:</span><span style={{ color: C.text, fontWeight: 700 }}>{inquiry.preferred_contact}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <Badge color={inquiry?.status === 'converted' ? 'green' : isChat ? 'cyan' : inquiry?.status === 'engaged' ? 'cyan' : 'orange'}>
              {isChat ? 'Pre-intake chat' : (inquiry?.status || 'inquiry')}
            </Badge>
            <div style={{ fontSize: '11.5px', color: C.textDim, textAlign: 'right' }}>
              {!isChat && (inquiry?.case_type_label || inquiry?.case_type) && (
                <div style={{ color: C.textMuted, fontWeight: 700 }}>
                  {inquiry.case_type_label || inquiry.case_type}
                </div>
              )}
              {submitted && <div>Submitted {submitted.toLocaleString()}</div>}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function ConversationBox({ messages, offers = [], viewerRole, draft, setDraft, sending, onSend, fileRef, onWithdrawOffer, withdrawingOfferId }) {
  const scrollRef = React.useRef(null)
  const [autoScroll, setAutoScroll] = React.useState(true)
  const timeline = React.useMemo(() => buildOfferTimeline(messages, offers), [messages, offers])

  React.useEffect(() => {
    if (!autoScroll || !scrollRef.current) return
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [timeline.length, autoScroll])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight)
    setAutoScroll(distance < 80)
  }

  const groups = React.useMemo(() => groupByDay(timeline), [timeline])

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px', gap: '8px' }}>
        <h3 style={{ fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: C.textMuted, margin: 0 }}>
          Conversation
        </h3>
        <span style={{ fontSize: '11px', color: C.textDim, fontWeight: 700 }}>
          {timeline.length === 0 ? 'No messages yet' : `${timeline.length} item${timeline.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div
        className="yousafe-message-scroll"
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: '14px',
          padding: '14px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: '460px',
          overflow: 'auto',
          scrollBehavior: 'smooth',
        }}
      >
        {groups.length === 0 && (
          <div style={{ color: C.textMuted, fontSize: '13px', textAlign: 'center', padding: '24px 8px' }}>
            No messages yet. Use a quick template below or write your own intro to start.
          </div>
        )}
        {groups.map(group => (
          <React.Fragment key={group.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: C.textDim, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, margin: '4px 0' }}>
              <div style={{ flex: 1, height: '1px', background: C.border }} />
              <span>{group.label}</span>
              <div style={{ flex: 1, height: '1px', background: C.border }} />
            </div>
            {group.messages.map(item => item.kind === 'offer' ? (
              <OfferMessageBubble
                key={item.key}
                offer={item.offer}
                onWithdraw={() => onWithdrawOffer?.(item.offer)}
                withdrawing={withdrawingOfferId === item.offer.id}
              />
            ) : (
              <MessageBubble key={item.key} message={item.message} viewerRole={viewerRole} />
            ))}
          </React.Fragment>
        ))}
      </div>

      <ComposerRow
        draft={draft}
        setDraft={setDraft}
        sending={sending}
        onSend={onSend}
        fileRef={fileRef}
      />
    </div>
  )
}

function ComposerRow({ draft, setDraft, sending, onSend, fileRef }) {
  const [openMenu, setOpenMenu] = React.useState(false)
  const charLimit = 4000
  const remaining = charLimit - draft.length
  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSend()
    }
  }
  const apply = (body) => {
    setDraft(prev => prev ? `${prev.replace(/\n+$/, '')}\n\n${body}` : body)
    setOpenMenu(false)
  }
  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>
          Quick replies
        </span>
        {QUICK_REPLIES.map(t => (
          <button
            key={t.label}
            type="button"
            onClick={() => apply(t.body)}
            style={{
              border: `1px solid ${C.border}`,
              background: C.surface2,
              color: C.textMuted,
              borderRadius: '999px',
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form
        className="yousafe-message-composer"
        onSubmit={(e) => { e.preventDefault(); onSend(e) }}
        style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '12px', padding: '8px' }}
      >
        {fileRef && (
          <>
            <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={(e) => onSend(e, e.target.files?.[0])} />
            <Btn type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()} title="Attach a file">
              📎
            </Btn>
          </>
        )}
        <textarea
          className="yousafe-message-input"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, charLimit))}
          onKeyDown={onKeyDown}
          placeholder="Reply to the client. Use Cmd/Ctrl + Enter to send."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '8px 10px',
            color: C.text,
            fontSize: '14px',
            fontFamily: 'inherit',
            resize: 'vertical',
            lineHeight: 1.5,
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ fontSize: '11px', color: remaining < 200 ? C.orange : C.textDim, fontWeight: 700 }}>
            {remaining} left
          </span>
          <Btn type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>
            {sending ? 'Sending…' : 'Send'}
          </Btn>
        </div>
      </form>
      <div style={{ fontSize: '11px', color: C.textDim, marginTop: '6px' }}>
        Communication is logged to the inquiry record. Funds for any paid offer move through escrow before release.
      </div>
    </div>
  )
}

function isOfferSystemMessage(message) {
  const body = String(message?.body || '')
  return /^(New offer from|Custom offer:)/i.test(body.trim())
}

function timelineItemTime(item) {
  const raw = item?.created_at || item?.message?.created_at || item?.offer?.created_at
  const ts = raw ? new Date(raw).getTime() : 0
  return Number.isFinite(ts) ? ts : 0
}

function buildOfferTimeline(messages = [], offers = []) {
  const hasOffers = offers.length > 0
  return [
    ...messages
      .filter(message => !(hasOffers && isOfferSystemMessage(message)))
      .map(message => ({ kind: 'message', key: `message-${message.id || timelineItemTime({ message })}`, message, created_at: message.created_at })),
    ...offers.map(offer => ({ kind: 'offer', key: `offer-${offer.id}`, offer, created_at: offer.created_at })),
  ].sort((a, b) => timelineItemTime(a) - timelineItemTime(b))
}

function groupByDay(messages) {
  const buckets = new Map()
  for (const m of messages) {
    const d = m.created_at ? new Date(m.created_at) : null
    const key = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : 'undated'
    const label = !d || Number.isNaN(d.getTime())
      ? 'Earlier'
      : isToday(d)
        ? 'Today'
        : isYesterday(d)
          ? 'Yesterday'
          : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    if (!buckets.has(key)) buckets.set(key, { label, messages: [] })
    buckets.get(key).messages.push(m)
  }
  return Array.from(buckets.values())
}

function isToday(d) {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate()
}

function isYesterday(d) {
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()
}

function OfferMessageBubble({ offer, onWithdraw, withdrawing }) {
  const platformFee = Number(offer.platform_fee || 0)
  const total = Number(offer.price || 0) + platformFee
  const pending = offer.status === 'sent'
  const ts = offer.created_at ? new Date(offer.created_at) : null
  const timeLabel = ts && !Number.isNaN(ts.getTime())
    ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          You
        </div>
        <div
          style={{
            background: C.outboundMessageBg,
            color: C.outboundMessageText,
            padding: '12px 14px',
            borderRadius: '14px 14px 4px 14px',
            fontSize: '14px',
            lineHeight: 1.55,
            border: `1px solid ${pending ? C.cyan : C.outboundMessageBorder}`,
            boxShadow: '0 1px 2px rgba(15,18,32,0.04)',
            minWidth: '260px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ fontWeight: 800, color: C.text }}>{offer.title}</div>
            <Badge color={pending ? 'orange' : offer.status === 'accepted' ? 'green' : offer.status === 'declined' ? 'red' : 'gray'}>{offer.status}</Badge>
          </div>
          <div style={{ marginTop: '6px', color: C.textMuted, fontSize: '13px', whiteSpace: 'pre-wrap' }}>{offer.description}</div>
          <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}><span>Attorney fee</span><strong>${Number(offer.price || 0).toFixed(2)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}><span>Platform fee</span><strong>${platformFee.toFixed(2)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', borderTop: `1px solid ${C.border}`, paddingTop: '5px', marginTop: '3px' }}><span>Client pays</span><strong>${total.toFixed(2)}</strong></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}><span>Delivery</span><strong>{offer.delivery_days} days</strong></div>
          </div>
          {pending && (
            <div style={{ marginTop: '10px' }}>
              <Btn variant="danger" size="sm" disabled={withdrawing} onClick={onWithdraw}>
                {withdrawing ? 'Withdrawing...' : 'Withdraw'}
              </Btn>
            </div>
          )}
        </div>
        {timeLabel && (
          <div style={{ fontSize: '10.5px', color: C.textDim, fontWeight: 600 }}>
            {timeLabel}
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message, viewerRole }) {
  const mine =
    (viewerRole === 'attorney' && message.sender_role === 'attorney') ||
    (viewerRole === 'client' && message.sender_role === 'client')
  const fromStudent = message.sender_role === 'client'
  const isSystem = message.sender_role === 'system'
  const ts = message.created_at ? new Date(message.created_at) : null
  const timeLabel = ts && !Number.isNaN(ts.getTime())
    ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : ''

  if (isSystem) {
    return (
      <div
        role="status"
        style={{
          alignSelf: 'center',
          maxWidth: '85%',
          background: C.surface2,
          border: `1px solid ${C.border}`,
          borderRadius: '999px',
          padding: '6px 14px',
          color: C.textMuted,
          fontSize: '12px',
          textAlign: 'center',
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}
      >
        <span style={{ marginRight: '6px', color: C.textDim }}>●</span>
        {message.body}
        {timeLabel && <span style={{ marginLeft: '8px', color: C.textDim, fontWeight: 500 }}>· {timeLabel}</span>}
      </div>
    )
  }

  const senderLabel = mine
    ? 'You'
    : message.sender_role === 'attorney'
      ? 'Attorney'
      : message.sender_role === 'client'
        ? 'Client'
        : message.sender_role || 'Sender'

  return (
    <div style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: '4px' }}>
        <div style={{ fontSize: '11px', color: C.textDim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {senderLabel}
        </div>
        <div
          style={{
            background: fromStudent ? C.studentMessageBg : mine ? C.outboundMessageBg : C.surface2,
            color: fromStudent ? C.studentMessageText : mine ? C.outboundMessageText : C.text,
            padding: '10px 14px',
            borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            fontSize: '14px',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.55,
            border: fromStudent ? `1px solid ${C.studentMessageBorder}` : mine ? `1px solid ${C.outboundMessageBorder}` : `1px solid ${C.border}`,
            boxShadow: '0 1px 2px rgba(15,18,32,0.04)',
          }}
        >
          <MessageBody body={message.body} linkColor={C.cyan} />
        </div>
        {timeLabel && (
          <div style={{ fontSize: '10.5px', color: C.textDim, fontWeight: 600 }}>
            {timeLabel}
          </div>
        )}
      </div>
    </div>
  )
}

export function AnswersPreview({ answers, expanded }) {
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
