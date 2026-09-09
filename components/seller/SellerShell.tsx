'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { DEFAULT_PALETTE_NAME, getPalette } from '@/components/marketplace/palettes'
import { T, paletteCssVars } from '@/components/marketplace/tokens'

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

const serif = "var(--portal-font-display, 'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif)"
const sans = "var(--portal-font-body, -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif)"

const sellerPalette = getPalette(DEFAULT_PALETTE_NAME).tokens
const sellerTheme = {
  ...paletteCssVars(sellerPalette),
  '--portal-bg': '#F4F6F8',
  '--portal-surface': '#FFFFFF',
  '--portal-surface-2': '#F7F8FA',
  '--portal-surface-3': '#EEF1F4',
  '--portal-rule': 'rgba(15,23,42,0.10)',
  '--portal-rule-soft': 'rgba(15,23,42,0.06)',
  '--portal-accent': sellerPalette.indigo,
  '--portal-accent-deep': sellerPalette.indigoDeep,
  '--portal-accent-soft': sellerPalette.indigoSoft,
  '--portal-ink': sellerPalette.ink,
  '--portal-ink-mid': sellerPalette.inkMid,
  '--portal-ink-soft': sellerPalette.inkSoft,
  '--portal-moss': sellerPalette.moss,
  '--portal-brick': sellerPalette.brick,
  '--ui-primary': sellerPalette.indigo,
  '--ui-brand': sellerPalette.indigoDeep,
  '--ui-accent': sellerPalette.indigo,
  '--ui-accent-deep': sellerPalette.indigoDeep,
  '--ui-accent-soft': sellerPalette.indigoSoft,
} as React.CSSProperties

export default function SellerShell({ title, subtitle, children }: SellerShellProps) {
  const pathname = usePathname()

  return (
    <div
      className="ys-seller-marketplace"
      style={{
        ...sellerTheme,
        minHeight: '100vh',
        background: T.cream,
        fontFamily: sans,
        color: T.ink,
      }}
    >
      {/*
        Seller Marketplace UI uses the same light-professional contract as the
        public Marketplace. Form controls stay white, readable, and keyboard-visible.
      */}
      <style>{`
        .ys-seller-marketplace input:not([type='checkbox']):not([type='radio']),
        .ys-seller-marketplace textarea,
        .ys-seller-marketplace select {
          background: var(--ys-vellum, #FFFFFF) !important;
          color: var(--ys-ink, #0F172A) !important;
          border-color: var(--ys-rule, rgba(15,23,42,0.12)) !important;
        }
        .ys-seller-marketplace input:not([type='checkbox']):not([type='radio']):focus,
        .ys-seller-marketplace textarea:focus,
        .ys-seller-marketplace select:focus {
          border-color: var(--ys-indigo, #3C3B6E) !important;
          box-shadow: 0 0 0 3px var(--ys-indigoSoft, rgba(60,59,110,0.12)) !important;
          outline: none !important;
        }
        .ys-seller-marketplace input::placeholder,
        .ys-seller-marketplace textarea::placeholder {
          color: var(--ys-inkSoft, #526072) !important;
          opacity: 0.82;
        }
        .ys-seller-marketplace button:focus-visible,
        .ys-seller-marketplace a:focus-visible {
          outline: 3px solid var(--ys-indigo, #3C3B6E);
          outline-offset: 3px;
        }
      `}</style>

      {/* Studio accent line */}
      <div style={{ height: '3px', background: `linear-gradient(90deg, ${sellerPalette.indigo} 0%, ${sellerPalette.indigoDeep} 100%)` }} />

      {/* Top navigation */}
      <nav style={{ background: T.vellum, borderBottom: `1px solid ${T.rule}`, boxShadow: '0 8px 24px rgba(15,23,42,0.06)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px', display: 'flex', alignItems: 'stretch', flexWrap: 'wrap', gap: '8px' }}>
          {/* Brand mark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: '16px', marginRight: '4px', borderRight: `1px solid ${T.rule}`, flexShrink: 0 }}>
            <img
              src="/logo.png"
              alt="YouSafe Consultancy"
              width="32"
              height="32"
              style={{ width: 32, height: 32, objectFit: 'contain', background: '#fff', borderRadius: 6 }}
            />
            <div>
              <div style={{ fontFamily: serif, fontSize: '17px', fontWeight: 600, color: T.onPaper, letterSpacing: '0.01em', lineHeight: 1.1 }}>
                YouSafe
              </div>
              <div style={{ fontSize: '10px', color: T.inkSoft, marginTop: '2px', whiteSpace: 'nowrap', fontWeight: 700 }}>
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
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? T.indigo : T.inkMid,
                    textDecoration: 'none',
                    borderBottom: isActive ? `3px solid ${T.indigo}` : '3px solid transparent',
                    height: '56px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    letterSpacing: isActive ? '0.01em' : '0',
                    transition: 'color 0.15s ease, background 0.15s ease, border-color 0.15s ease',
                    position: 'relative',
                  }}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Right side: context link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <Link
              href="/dashboard"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px',
                borderRadius: '8px', fontSize: '12px', color: T.inkMid,
                border: `1px solid ${T.rule}`, background: T.cream,
                textDecoration: 'none', letterSpacing: '0.01em', whiteSpace: 'nowrap',
              }}
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Page header */}
      <div style={{ background: T.vellum, borderBottom: `1px solid ${T.rule}`, boxShadow: '0 1px 0 rgba(15,23,42,0.03)' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'clamp(20px, 4vw, 28px) clamp(16px, 4vw, 32px) clamp(18px, 3vw, 24px)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: '1 1 240px' }}>
              <h1 style={{
                fontFamily: serif,
                fontSize: 'clamp(22px, 5vw, 32px)',
                fontWeight: 600,
                letterSpacing: '-0.015em',
                color: T.ink,
                margin: 0,
                lineHeight: 1.15,
              }}>
                {title}
              </h1>
              {subtitle && (
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: T.inkMid, lineHeight: 1.55 }}>
                  {subtitle}
                </p>
              )}
            </div>
            <div style={{ flex: 1, height: '2px', background: 'linear-gradient(90deg, rgba(8,122,91,0.32), rgba(8,122,91,0.04))', maxWidth: '160px', marginBottom: '6px' }} />
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
