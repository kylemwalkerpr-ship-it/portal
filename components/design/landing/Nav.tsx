'use client'
import React from 'react'
import { T } from './tokens'
import { Arrow, ArrowUR, Home, Globe, ChevronDown } from './icons'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { Btn } from '../shared'

interface NavProps {
  onOpenSignIn: () => void
}

export default function Nav({ onOpenSignIn }: NavProps) {
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
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
      {/* Brand */}
      <a
        href="https://yousafeconsultancy.com/"
        aria-label="YouSafe Consultancy"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          textDecoration: 'none',
          color: T.ink,
          flex: '0 0 auto',
        }}
      >
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: T.indigo,
            color: '#fff',
            fontFamily: T.serif,
            fontWeight: 600,
            fontSize: 20,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 16px rgba(60,59,110,0.22)',
            position: 'relative',
          }}
        >
          Y
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: T.gold,
              border: '2px solid #FAFAF8',
            }}
            aria-hidden="true"
          />
        </span>
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
            style={{
              fontFamily: T.mono,
              fontSize: 9.5,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: T.inkSoft,
              marginTop: 4,
            }}
          >
            The Portal
          </span>
        </span>
      </a>

      {/* Center links */}
      <div
        className="ys-nav-links"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
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
            paddingLeft: 12,
            paddingRight: 12,
            color: T.inkMid,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 14px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
            transition: 'color 140ms ease, background 140ms ease',
          }}
        >
          <Home size={16} stroke={1.7} />
          <span>Home</span>
          <ArrowUR size={10} stroke={2} style={{ color: T.inkDim, marginLeft: 1 }} />
        </a>
        <span aria-hidden="true" style={{ width: 1, height: 18, background: T.rule, margin: '0 4px' }} />
        <a href="#categories" className="ys-nav-link" style={navLinkStyle}>Categories</a>
        <a href="#practices" className="ys-nav-link" style={navLinkStyle}>Practices</a>
        <a href="#how" className="ys-nav-link" style={navLinkStyle}>How it works</a>
        <a href="#trust" className="ys-nav-link" style={navLinkStyle}>Trust &amp; safety</a>
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <GlobalLanguageBar />

        <Btn variant="ghost" size="sm" onClick={onOpenSignIn}>
          Sign in
        </Btn>
        <Btn
          variant="brand"
          size="sm"
          onClick={() => {
            window.location.href = 'https://portal.yousafeconsultancy.com/sign-up/student'
          }}
        >
          Start an inquiry
          <Arrow size={14} stroke={2} />
        </Btn>
      </div>
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
  transition: 'color 140ms ease, background 140ms ease',
}
