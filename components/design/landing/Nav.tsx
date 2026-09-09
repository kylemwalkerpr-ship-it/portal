'use client'
import React from 'react'
import { T } from './tokens'
import { Arrow, ArrowUR, Home } from './icons'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { Btn } from '../shared'

interface NavProps {
  onOpenSignIn: () => void
}

export default function Nav({ onOpenSignIn }: NavProps) {
  const [scrolled, setScrolled] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  React.useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  const links = [
    { href: 'https://yousafeconsultancy.com/', label: 'Home' },
    { href: '/marketplace', label: 'Browse services' },
    { href: '#practices', label: 'Practices' },
    { href: '#how', label: 'How it works' },
    { href: '#faq', label: 'FAQ' },
  ]

  return (
    <nav
      className="ys-portal-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 40px',
        borderBottom: scrolled ? `1px solid ${T.rule}` : '1px solid transparent',
        background: scrolled ? 'rgba(250,250,248,0.88)' : 'rgba(250,250,248,0.55)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        transition: 'background 200ms ease, border-color 200ms ease',
        gap: '20px',
      }}
    >
      <a
        href="https://yousafeconsultancy.com/"
        aria-label="YouSafe Consultancy"
        className="ys-nav-brand"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          textDecoration: 'none',
          color: T.ink,
          flex: '0 0 auto',
        }}
      >
        <img
          src="/logo.png"
          alt="YouSafe Consultancy"
          width="42"
          height="42"
          style={{
            width: 42,
            height: 42,
            objectFit: 'contain',
          }}
        />
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
          <span
            style={{
              fontFamily: T.serif,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: '0.005em',
            }}
          >
            YouSafe
          </span>
          <span
            className="ys-nav-brand-tagline"
            style={{
              fontFamily: T.sans,
              fontSize: 11,
              fontWeight: 700,
              color: T.moss,
              marginTop: 4,
            }}
          >
            Your Safe Path to Success.
          </span>
        </span>
      </a>

      <div
        className="ys-nav-links"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
          flex: '1 1 auto',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <a
          href="https://yousafeconsultancy.com/"
          className="ys-nav-link ys-nav-home"
          aria-label="YouSafe Consultancy home"
          title="YouSafe Consultancy home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: T.inkMid,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            minHeight: 44,
            transition: 'color 140ms ease, background 140ms ease',
          }}
        >
          <Home size={16} stroke={1.7} />
          <span>Home</span>
          <ArrowUR size={10} stroke={2} style={{ color: T.inkDim, marginLeft: 1 }} />
        </a>
        <span aria-hidden="true" style={{ width: 1, height: 18, background: T.rule, margin: '0 4px' }} />
        <a href="/marketplace" className="ys-nav-link" style={navLinkStyle}>Browse services</a>
        <a href="#practices" className="ys-nav-link" style={navLinkStyle}>Practices</a>
        <a href="#how" className="ys-nav-link" style={navLinkStyle}>How it works</a>
        <a href="#faq" className="ys-nav-link" style={navLinkStyle}>FAQ</a>
      </div>

      <div className="ys-nav-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <div className="ys-nav-right-extras">
          <GlobalLanguageBar />
        </div>

        <span className="ys-nav-cta-account">
          <Btn
            variant="brand"
            size="sm"
            onClick={onOpenSignIn}
          >
            My Account
            <Arrow size={14} stroke={2} />
          </Btn>
        </span>
        <span className="ys-nav-cta-inquiry">
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = 'https://portal.yousafeconsultancy.com/sign-up/student'
            }}
          >
            Start an inquiry
          </Btn>
        </span>

        <button
          type="button"
          className="ys-nav-menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="ys-portal-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <div
          id="ys-portal-mobile-menu"
          className="ys-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
        >
          <button
            type="button"
            className="ys-nav-drawer-backdrop"
            aria-label="Close menu"
            onClick={closeMenu}
          />
          <div className="ys-nav-drawer-panel">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="ys-nav-drawer-link"
                onClick={closeMenu}
              >
                {link.label}
              </a>
            ))}
            <button
              type="button"
              className="ys-nav-drawer-link"
              onClick={() => {
                closeMenu()
                onOpenSignIn()
              }}
            >
              My Account
            </button>
            <a
              href="https://portal.yousafeconsultancy.com/sign-up/student"
              className="ys-nav-drawer-link ys-nav-drawer-cta"
              onClick={closeMenu}
            >
              Start an inquiry
            </a>
            <div className="ys-nav-drawer-lang">
              <GlobalLanguageBar />
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}

const navLinkStyle: React.CSSProperties = {
  color: T.inkMid,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 500,
  padding: '8px 14px',
  borderRadius: 8,
  whiteSpace: 'nowrap',
  minHeight: 44,
  display: 'inline-flex',
  alignItems: 'center',
  transition: 'color 140ms ease, background 140ms ease',
}
