// @ts-nocheck
'use client'
import React from 'react'
import { useClerk } from '@clerk/nextjs'
import { C } from '@/components/design/shared'
import dynamic from 'next/dynamic'
import { roleLabel, signInForLane } from '@/lib/roleLanes'
// BuyerDashboardWidgets is rendered inside StudentApp (components/design/student.jsx)
// for the client/student role. Import kept here for reference.
import { BuyerDashboardWidgets } from '@/components/marketplace/BuyerDashboardWidgets'

const StudentApp = dynamic(() => import('@/components/design/student'), { ssr: false })
const ConsultantApp = dynamic(() => import('@/components/design/consultant'), { ssr: false })
const AdminApp = dynamic(() => import('@/components/design/admin'), { ssr: false })
const AttorneyApp = dynamic(() => import('@/components/design/attorney'), { ssr: false })
const AttorneyApplyForm = dynamic(() => import('@/components/design/attorney-apply-form'), { ssr: false })
import { IntakeTodoBanner } from '@/components/marketplace/IntakeTodoBanner'
const PORTAL_URL = 'https://portal.yousafeconsultancy.com'
const SUPPORT_URL = 'https://support.yousafeconsultancy.com'

export default function DashboardClient({ role, status, userName, userId, expectedRole, errorState }) {
  const { signOut } = useClerk()
  const loggingOut = React.useRef(false)

  const handleLogout = React.useCallback(async () => {
    // Prevent double-clicks / concurrent calls
    if (loggingOut.current) return
    loggingOut.current = true

    try {
      // Race against a 5-second timeout so a slow/failed Clerk API call
      // never leaves the button frozen indefinitely
      await Promise.race([
        signOut(),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ])
    } catch { /* ignore — redirect regardless */ }

    // Hard-navigate to the sign-in page so the user always ends up somewhere
    // expected, even if Clerk's session clear failed or partially succeeded
    window.location.replace(PORTAL_URL)
  }, [signOut])

  if (errorState) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', maxWidth: '460px', padding: '40px' }}>
          <div style={{ fontSize: '44px', marginBottom: '18px' }}>!</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Account needs a quick refresh</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            Your account was recently reactivated, but the session still needs to reconnect cleanly. Sign out, then sign in again using the correct role option.
          </p>
          <button onClick={handleLogout} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            Sign out and retry
          </button>
        </div>
      </div>
    )
  }

  if (expectedRole && role !== expectedRole) {
    const handleSwitchRoute = async () => {
      const redirectUrl = signInForLane(expectedRole)
      try {
        await signOut({ redirectUrl })
      } finally {
        window.location.replace(redirectUrl)
      }
    }

    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', maxWidth: '440px', padding: '40px' }}>
          <div style={{ fontSize: '44px', marginBottom: '18px' }}>↔</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Use the correct sign-in route</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            This browser is signed in as a {roleLabel(role)} account, but this link is for {roleLabel(expectedRole)} access. Sign out and use the right route to keep accounts separate.
          </p>
          <button onClick={handleSwitchRoute} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            Sign out and continue
          </button>
        </div>
      </div>
    )
  }

  if (status === 'pending' && role === 'consultant') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Application Under Review</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            Thank you for applying to become a YouSafe consultant. Our team will review your profile and you'll be notified once approved.
          </p>
          <button onClick={handleLogout} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (role === 'attorney' && (status === 'incomplete' || !status)) {
    return <AttorneyApplyForm onLogout={handleLogout} defaultFullName={userName} />
  }

  if (status === 'pending' && role === 'attorney') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Attorney Application Under Review</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            Thank you for applying to join the YouSafe attorney panel. Our team will review your application and email you when a decision is made.
          </p>
          <button onClick={handleLogout} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (status === 'declined' && role === 'attorney') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>—</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Application Not Accepted</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            Your attorney application was not accepted at this time. If you believe this is in error, contact support@yousafeconsultancy.com.
          </p>
          <button onClick={handleLogout} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (status === 'pending' && role === 'support') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Support Access Pending</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            Your support account is waiting for approval. Once activated, you can use the support workspace.
          </p>
          <button onClick={handleLogout} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (status === 'suspended') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚫</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Account Suspended</h2>
          <p style={{ color: C.textMuted, lineHeight: 1.7, marginBottom: '24px' }}>
            This account cannot access the portal or support workspace. Contact support@yousafeconsultancy.com for help.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={handleLogout} style={{ color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
              Sign out
            </button>
            <a href={SUPPORT_URL} style={{ color: C.textDim, fontSize: '14px' }}>
              Support home
            </a>
          </div>
        </div>
      </div>
    )
  }

  if (role !== 'admin' && status === 'active' && !hasFirstAndLastName(userName)) {
    return <ProfileNameGate role={role} onLogout={handleLogout} />
  }

  const app =
    role === 'consultant' ? <ConsultantApp onLogout={handleLogout} />
    : role === 'admin' ? <AdminApp onLogout={handleLogout} />
    : role === 'attorney' ? <AttorneyApp onLogout={handleLogout} userName={userName} />
    : <StudentApp onLogout={handleLogout} userId={userId} userName={userName} />

  // Attorneys get a sticky intake to-do banner above their dashboard until
  // their profile clears the 75% publish gate.
  if (role === 'attorney') {
    return (
      <>
        <IntakeTodoBanner />
        {app}
      </>
    )
  }
  return app
}

function hasFirstAndLastName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = /^(Mr\.?|Mrs\.?|Ms\.?|Mx\.?|Dr\.?|Prof\.?)$/i.test(parts[0] || '') ? parts[1] : parts[0]
  const last = /^(Mr\.?|Mrs\.?|Ms\.?|Mx\.?|Dr\.?|Prof\.?)$/i.test(parts[0] || '') ? parts.slice(2).join(' ') : parts.slice(1).join(' ')
  return Boolean(first && last)
}

function ProfileNameGate({ role, onLogout }) {
  const [salutation, setSalutation] = React.useState('')
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salutation, first_name: firstName, last_name: lastName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save your profile.')
      window.location.reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '440px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '16px', padding: '28px' }}>
        <div style={{ color: C.textMuted, fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, marginBottom: '8px' }}>{roleLabel(role)} profile</div>
        <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 800, margin: '0 0 8px' }}>Add your name</h2>
        <p style={{ color: C.textMuted, fontSize: '14px', lineHeight: 1.6, margin: '0 0 20px' }}>
          Your email stays in the email section. Add your first and last name so messages, orders, and profiles show a real person.
        </p>
        {error && <div style={{ color: C.red, fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'grid', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: C.textMuted, fontWeight: 700 }}>
            Preferred salutation
            <select value={salutation} onChange={e => setSalutation(e.target.value)} style={gateInputStyle}>
              <option value="">No salutation</option>
              {['Mr.', 'Mrs.', 'Ms.', 'Mx.', 'Dr.', 'Prof.'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: C.textMuted, fontWeight: 700 }}>
            First name
            <input value={firstName} onChange={e => setFirstName(e.target.value)} style={gateInputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '6px', fontSize: '13px', color: C.textMuted, fontWeight: 700 }}>
            Last name
            <input value={lastName} onChange={e => setLastName(e.target.value)} style={gateInputStyle} />
          </label>
          <button type="button" onClick={save} disabled={saving} style={{ border: 'none', borderRadius: '999px', background: '#1F2937', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', padding: '12px 18px', fontWeight: 800 }}>
            {saving ? 'Saving...' : 'Continue'}
          </button>
          <button type="button" onClick={onLogout} style={{ border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer', padding: '6px', fontWeight: 700 }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

const gateInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 12px',
  border: `1px solid ${C.border2}`,
  borderRadius: '10px',
  background: C.surface2,
  color: C.text,
  fontFamily: 'inherit',
  fontSize: '14px',
}
