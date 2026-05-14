'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLink {
  icon: string
  label: string
  href: string
  external?: boolean
}

interface RoleConfig {
  color: string       // active link accent
  links: NavLink[]
}

// Maps each role to the nav items their sidebar shows, translated to URLs.
// Dashboard SPA sections use /dashboard?goto=<section> — the dashboard reads
// this on mount and calls setPage() to jump straight to the right tab.
const ROLE_NAV: Record<string, RoleConfig> = {
  client: {
    color: '#1B2D4F',
    links: [
      { icon: '⬛', label: 'Dashboard',        href: '/dashboard' },
      { icon: '🏬', label: 'Marketplace',      href: '/marketplace' },
      { icon: '📦', label: 'My Orders',        href: '/dashboard?goto=orders' },
      { icon: '⚖️', label: 'Find Attorney',    href: '/dashboard?goto=attorneys' },
      { icon: '📥', label: 'Inquiries',        href: '/dashboard?goto=inquiries' },
      { icon: '💬', label: 'Messages',         href: '/dashboard?goto=messages' },
      { icon: '📋', label: 'Documents',        href: '/dashboard?goto=documents' },
      { icon: '💳', label: 'Billing',          href: '/dashboard?goto=billing' },
    ],
  },
  attorney: {
    color: '#1B2D4F',
    links: [
      { icon: '⬛', label: 'Overview',         href: '/dashboard' },
      { icon: '📥', label: 'Inquiry Queue',    href: '/dashboard?goto=queue' },
      { icon: '📂', label: 'My Inquiries',     href: '/dashboard?goto=mine' },
      { icon: '📦', label: 'Active Orders',    href: '/dashboard?goto=orders' },
      { icon: '💬', label: 'Messages',         href: '/dashboard?goto=messages' },
      { icon: '💼', label: 'Gigs',             href: '/dashboard/gigs' },
      { icon: '💰', label: 'Earnings',         href: '/dashboard?goto=earnings' },
      { icon: '🏬', label: 'Marketplace',      href: '/marketplace' },
    ],
  },
  consultant: {
    color: '#1B2D4F',
    links: [
      { icon: '⬛', label: 'Dashboard',        href: '/dashboard' },
      { icon: '📦', label: 'Orders',           href: '/dashboard?goto=orders' },
      { icon: '💬', label: 'Messages',         href: '/dashboard?goto=messages' },
      { icon: '💼', label: 'Gigs',             href: '/dashboard/gigs' },
      { icon: '💰', label: 'Earnings',         href: '/dashboard?goto=earnings' },
      { icon: '🏬', label: 'Marketplace',      href: '/marketplace' },
    ],
  },
  admin: {
    color: '#1B2D4F',
    links: [
      { icon: '⬛', label: 'Admin Dashboard',  href: '/dashboard' },
      { icon: '🏬', label: 'Marketplace',      href: '/marketplace' },
    ],
  },
}

const sans  = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

export default function MarketplaceNavHeader() {
  const pathname = usePathname()
  const [role, setRole]     = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.profile?.role) setRole(data.profile.role) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  // Don't render anything while loading to avoid flash
  if (loading || !role || !ROLE_NAV[role]) return null

  const { color, links } = ROLE_NAV[role]

  const isActive = (href: string) => {
    if (href === '/marketplace') return pathname === '/marketplace' || pathname.startsWith('/marketplace/')
    if (href === '/dashboard') return false   // dashboard link is never "active" on marketplace pages
    return pathname === href
  }

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 200,
      background: '#1B2D4F',
      boxShadow: scrolled ? '0 2px 12px rgba(0,0,0,0.22)' : '0 1px 0 rgba(255,255,255,0.06)',
      transition: 'box-shadow 0.2s ease',
      fontFamily: sans,
    }}>
      {/* Gold accent line */}
      <div style={{ height: '2px', background: 'linear-gradient(90deg, #9A7B3B 0%, #C4A45A 50%, #9A7B3B 100%)' }} />

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto' }}>

        {/* Brand */}
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px 0 0', marginRight: '4px', borderRight: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none', flexShrink: 0 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: '15px', fontWeight: 600, color: '#F7F5F0', letterSpacing: '0.01em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>YouSafe</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '1px', whiteSpace: 'nowrap' }}>
              {role === 'client' ? 'Client Portal' : role === 'attorney' ? 'Attorney Portal' : role === 'consultant' ? 'Consultant Portal' : 'Portal'}
            </div>
          </div>
        </Link>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {links.map((link) => {
            const active = isActive(link.href)
            return (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '0 14px',
                  height: '48px',
                  fontSize: '12.5px',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#FFFFFF' : 'rgba(255,255,255,0.52)',
                  textDecoration: 'none',
                  borderBottom: active ? `2px solid #C4A45A` : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  letterSpacing: active ? '0.01em' : '0',
                  flexShrink: 0,
                  transition: 'color 0.12s, border-color 0.12s',
                }}
              >
                <span style={{ fontSize: '13px', opacity: active ? 1 : 0.7 }}>{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Right side: back to dashboard pill */}
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
          <Link
            href="/dashboard"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '6px 12px', borderRadius: '5px',
              fontSize: '12px', fontWeight: 500,
              color: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.04)',
              textDecoration: 'none', whiteSpace: 'nowrap',
            }}
          >
            ← Dashboard
          </Link>
        </div>
      </div>
    </header>
  )
}
