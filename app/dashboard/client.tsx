// @ts-nocheck
'use client'
import React from 'react'
import { useClerk } from '@clerk/nextjs'
import { C } from '@/components/design/shared'
import dynamic from 'next/dynamic'

const StudentApp = dynamic(() => import('@/components/design/student'), { ssr: false })
const ConsultantApp = dynamic(() => import('@/components/design/consultant'), { ssr: false })
const AdminApp = dynamic(() => import('@/components/design/admin'), { ssr: false })
const LANDING_URL = 'https://yousafeconsultancy.com'

export default function DashboardClient({ role, status, userName, userId }) {
  const { signOut } = useClerk()
  const handleLogout = async () => {
    try {
      await signOut({ redirectUrl: LANDING_URL })
    } finally {
      window.location.replace(LANDING_URL)
    }
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

  if (status === 'suspended') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚫</div>
          <h2 style={{ color: C.text, fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>Account Suspended</h2>
          <p style={{ color: C.textMuted }}>Contact support@yousafeconsultancy.com for help.</p>
        </div>
      </div>
    )
  }

  if (role === 'consultant') return <ConsultantApp onLogout={handleLogout} />
  if (role === 'admin') return <AdminApp onLogout={handleLogout} />
  return <StudentApp onLogout={handleLogout} userId={userId} userName={userName} />
}
