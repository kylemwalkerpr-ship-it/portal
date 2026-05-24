'use client'

import React from 'react'
import { useUser, useClerk } from '@clerk/nextjs'
import { T, F } from './tokens'

const PORTAL_URL = 'https://portal.yousafeconsultancy.com'

interface MarketplaceAuthNavProps {
  signUpHref: string
}

export default function MarketplaceAuthNav({ signUpHref }: MarketplaceAuthNavProps) {
  const { isSignedIn, user } = useUser()
  const clerk = useClerk()
  const [open, setOpen] = React.useState(false)
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // SSR / signed-out fallback
  if (!isSignedIn) {
    return (
      <nav className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 8 }} suppressHydrationWarning>
        <a
          href={`${PORTAL_URL}/sign-in/student`}
          style={{
            fontFamily: F.ui, fontSize: 13, fontWeight: 500,
            color: T.ink, textDecoration: 'none',
            padding: '8px 14px', borderRadius: 999,
          }}
        >Sign in</a>
        <a
          href={signUpHref}
          style={{
            fontFamily: F.ui, fontSize: 13, fontWeight: 600,
            color: '#fff', textDecoration: 'none',
            background: T.indigo, padding: '8px 16px', borderRadius: 999,
          }}
        >Open portal</a>
      </nav>
    )
  }

  const initials = user?.firstName?.[0] || user?.lastName?.[0] || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || '?'
  const fullName = user?.fullName || user?.firstName || user?.emailAddresses?.[0]?.emailAddress || 'User'
  const email = user?.emailAddresses?.[0]?.emailAddress || ''
  const imageUrl = user?.imageUrl

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} suppressHydrationWarning>
      <button
        ref={btnRef}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        style={{
          width: 36, height: 36, borderRadius: '50%',
          background: imageUrl ? undefined : T.indigoSoft,
          border: `1px solid ${T.rule}`,
          cursor: 'pointer', padding: 0, overflow: 'hidden',
          display: 'grid', placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <span style={{ fontFamily: F.display, fontSize: 14, fontWeight: 600, color: T.indigo }}>
            {initials}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 220,
            background: T.vellum,
            border: `1px solid ${T.rule}`,
            borderRadius: 12,
            boxShadow: '0 12px 32px -16px rgba(29,36,51,0.4)',
            zIndex: 300,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '12px 14px 10px' }}>
            <div style={{ fontFamily: F.display, fontWeight: 500, fontSize: 14, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fullName}
            </div>
            <div style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.inkSoft, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {email}
            </div>
          </div>
          <div style={{ height: 1, background: T.ruleSoft, margin: '0 14px' }} />

          {/* Links */}
          <a role="menuitem" href={`${PORTAL_URL}/dashboard`} style={linkStyle}>Go to Dashboard</a>
          <a role="menuitem" href={`${PORTAL_URL}/dashboard?page=orders`} style={linkStyle}>My Orders</a>
          <a role="menuitem" href={`${PORTAL_URL}/dashboard?page=messages`} style={linkStyle}>Messages</a>
          <a role="menuitem" href={`${PORTAL_URL}/dashboard?page=settings`} style={linkStyle}>Profile settings</a>

          <div style={{ height: 1, background: T.ruleSoft, margin: '4px 14px' }} />

          <button
            role="menuitem"
            onClick={() => clerk.signOut({ redirectUrl: PORTAL_URL })}
            style={{ ...linkStyle, color: T.brick, width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F.ui }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = T.paper2 }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

const linkStyle: React.CSSProperties = {
  display: 'block',
  padding: '10px 14px',
  fontFamily: F.ui,
  fontSize: 14,
  color: T.ink,
  textDecoration: 'none',
  transition: 'background 0.08s',
}
