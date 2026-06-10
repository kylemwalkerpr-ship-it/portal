'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface SellerShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Services', href: '/dashboard/gigs' },
  { label: 'Orders', href: '/dashboard/orders' },
  { label: 'Marketplace', href: '/dashboard/marketplace' },
  { label: 'Compliance', href: '/dashboard/compliance' },
]

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

export default function SellerShell({ title, subtitle, children }: SellerShellProps) {
  const pathname = usePathname()

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0', fontFamily: sans, color: '#1A1F2E' }}>

      {/* Gold accent line at very top */}
      <div style={{ height: '3px', background: 'linear-gradient(90deg, #9A7B3B 0%, #C4A45A 50%, #9A7B3B 100%)' }} />

      {/* Top navigation */}
      <nav style={{ background: '#0F172A', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: '8px' }}>

          {/* Brand mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px', marginRight: '4px', borderRight: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <img
              src="/logo.png"
              alt="YouSafe Consultancy"
              width="32"
              height="32"
              style={{ width: 32, height: 32, objectFit: 'contain', background: '#fff', borderRadius: 4 }}
            />
            <div>
              <div style={{ fontFamily: serif, fontSize: '17px', fontWeight: 600, color: '#F7F5F0', letterSpacing: '0.01em', lineHeight: 1.1 }}>
                YouSafe
              </div>
              <div style={{ fontSize: '10px', color: '#C4A45A', marginTop: '1px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                Your Safe Path to Success.
              </div>
            </div>
          </div>

          {/* Nav links — horizontally scrollable on narrow screens */}
          <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, minWidth: 0, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {NAV_LINKS.map((link) => {
              const isActive = link.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)',
                    textDecoration: 'none',
                    borderBottom: isActive ? '2px solid #C4A45A' : '2px solid transparent',
                    height: '56px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    letterSpacing: isActive ? '0.01em' : '0',
                    transition: 'all 0.15s ease',
                    position: 'relative',
                  }}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Right side: context links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '5px', fontSize: '12px', color: 'rgba(255,255,255,0.50)', border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(255,255,255,0.04)', textDecoration: 'none', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
              ← Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Page header */}
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #DDD8CE', boxShadow: '0 1px 0 rgba(27,45,79,0.04)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(20px, 4vw, 28px) clamp(16px, 4vw, 32px) clamp(18px, 3vw, 24px)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 240px' }}>
              <h1 style={{
                fontFamily: serif,
                fontSize: 'clamp(22px, 5vw, 32px)',
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: '#0F172A',
                margin: 0,
                lineHeight: 1.15,
              }}>
                {title}
              </h1>
              {subtitle && (
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#5C6070', lineHeight: 1.5 }}>
                  {subtitle}
                </p>
              )}
            </div>
            {/* Decorative gold rule */}
            <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, #DDD8CE, #F7F5F0)', maxWidth: '160px', marginBottom: '6px' }} />
          </div>
        </div>
      </div>

      {/* Page content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(20px, 4vw, 32px) clamp(16px, 4vw, 32px) clamp(40px, 6vw, 80px)' }}>
        {children}
      </main>
    </div>
  )
}
