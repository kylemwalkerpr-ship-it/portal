'use client'

import React from 'react'
import Link from 'next/link'
import { PhoneVerificationCard } from '@/components/PhoneVerificationCard'
import { TwoFactorCard } from '@/components/TwoFactorCard'

const sans = "var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif)"
const serif = "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)"

// Standalone security hub for ALL roles. Embeds the same
// PhoneVerificationCard and TwoFactorCard used on /dashboard/compliance
// so security state lives in one component family — fix it here,
// fix it everywhere.
export default function SecurityHubView({ role }: { role: string }) {
  const isSeller = role === 'attorney' || role === 'consultant'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#F7F5F0',
      fontFamily: sans,
      color: '#1A1F2E',
    }}>
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #9A7B3B 0%, #C4A45A 50%, #9A7B3B 100%)' }} />

      <header style={{ background: '#FFFFFF', borderBottom: '1px solid #DDD8CE' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' as const }}>
            <Link href="/dashboard" style={{ fontSize: '12px', color: '#5C6070', textDecoration: 'none', fontWeight: 600 }}>
              ← Dashboard
            </Link>
            <span style={{ color: '#DDD8CE' }}>/</span>
            <span style={{ fontSize: '12px', color: '#9097A8' }}>Account security</span>
          </div>
          <h1 style={{
            fontFamily: serif,
            fontSize: 'clamp(24px, 4vw, 32px)',
            fontWeight: 600,
            color: '#0F172A',
            margin: '8px 0 4px',
            letterSpacing: '-0.015em',
          }}>
            Account security
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#5C6070' }}>
            Verify your phone, enable two-factor authentication, and manage backup codes.
          </p>
        </div>
      </header>

      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 24px 80px', display: 'grid', gap: '16px' }}>

        <PhoneVerificationCard />

        <TwoFactorCard />

        {/* Pointer to the Clerk-managed surface for advanced ops:
            password change, session management, identity providers. */}
        <div style={{
          padding: '14px 18px',
          background: '#FFFFFF',
          border: '1px solid #E8E4DC',
          borderRadius: '10px',
          fontSize: '13px',
          color: '#5C6070',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: '4px' }}>
            Need more? Password, active sessions, connected accounts
          </div>
          <p style={{ margin: 0 }}>
            For password changes, signing out of other devices, or managing your Google sign-in,
            open the full security panel at{' '}
            <Link href="/user/security" style={{ color: '#3C3B6E', fontWeight: 600 }}>
              /user/security
            </Link>.
          </p>
        </div>

        {isSeller && (
          <div style={{
            padding: '14px 18px',
            background: 'rgba(60,59,110,0.05)',
            border: '1px solid rgba(60,59,110,0.20)',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#5C6070',
            lineHeight: 1.55,
          }}>
            <strong style={{ color: '#3C3B6E' }}>You&apos;re a {role}.</strong>{' '}
            Phone verification and 2FA are also tracked on{' '}
            <Link href="/dashboard/compliance" style={{ color: '#3C3B6E', fontWeight: 600 }}>
              your compliance page
            </Link>{' '}
            — both surfaces share the same status, so verifying here updates compliance immediately.
          </div>
        )}
      </main>
    </div>
  )
}
