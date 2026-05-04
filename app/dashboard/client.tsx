// @ts-nocheck
'use client'
import React from 'react'
import { useClerk } from '@clerk/nextjs'
import { C } from '@/components/design/shared'
import dynamic from 'next/dynamic'
import { roleLabel, signInForLane } from '@/lib/roleLanes'

const StudentApp = dynamic(() => import('@/components/design/student'), { ssr: false })
const ConsultantApp = dynamic(() => import('@/components/design/consultant'), { ssr: false })
const AdminApp = dynamic(() => import('@/components/design/admin'), { ssr: false })
const LANDING_URL = 'https://yousafeconsultancy.com'
const SUPPORT_URL = 'https://support.yousafeconsultancy.com'

export default function DashboardClient({ role, status, userName, userId, expectedRole, errorState }) {
  const { signOut } = useClerk()
  const handleLogout = async () => {
    try {
      await signOut({ redirectUrl: LANDING_URL })
    } finally {
      window.location.replace(LANDING_URL)
    }
  }

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

  if (role === 'consultant') return <ConsultantApp onLogout={handleLogout} />
  if (role === 'admin') return <AdminApp onLogout={handleLogout} />
  return <StudentApp onLogout={handleLogout} userId={userId} userName={userName} />
}
