'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SellerShellProps {
  title: string
  children: React.ReactNode
}

// Core seller center pages — messages/earnings/promotions live in the
// main role dashboard (attorney.jsx / consultant.jsx) until dedicated
// seller-center routes are built for those sections.
const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Gigs', href: '/dashboard/gigs' },
  { label: 'Orders', href: '/dashboard/orders' },
]

// Features not yet wired to dedicated routes — still accessible via main dashboard
const COMING_LINKS = [
  { label: 'Messages · Dashboard', note: 'available in Dashboard' },
  { label: 'Promotions · Coming Soon', note: 'coming soon' },
]

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

export default function SellerShell({ title, children }: SellerShellProps) {
  const pathname = usePathname()

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0', fontFamily: sans, color: '#1A1F2E' }}>
      {/* Top nav bar */}
      <nav style={{ background: '#1B2D4F', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', paddingRight: '28px', borderRight: '1px solid rgba(255,255,255,0.10)', marginRight: '4px' }}>
            <span style={{
              fontFamily: serif,
              fontSize: '16px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: '#F7F5F0',
              whiteSpace: 'nowrap',
            }}>
              Seller Centre
            </span>
          </div>

          {/* Nav links */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 18px',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.60)',
                    textDecoration: 'none',
                    borderBottom: isActive ? '2px solid #9A7B3B' : '2px solid transparent',
                    transition: 'color 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap',
                    height: '52px',
                  }}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Coming-soon chips */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '20px', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
            {COMING_LINKS.map((item) => (
              <span
                key={item.label}
                title={item.note}
                style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: '999px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.45)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: 'rgba(255,255,255,0.05)',
                  whiteSpace: 'nowrap',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main style={{ maxWidth: '1180px', margin: '0 auto', padding: '36px 24px 60px' }}>
        <h1 style={{
          fontFamily: serif,
          fontSize: '36px',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: '#1B2D4F',
          marginBottom: '28px',
          lineHeight: 1.15,
        }}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  )
}
