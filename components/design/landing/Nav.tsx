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
      className="ys-portal-nav"
      style={{
        display: 'flex',
        alignItems: 'center',
        // Desktop: spread items out across the width. Mobile (≤900px) gets
        // an override in app/globals.css that turns the whole nav into a
        // single horizontally scrollable strip — brand at the start, CTA
        // at the end, no fixed elements eating the middle. Justify-start
        // is correct for the scrollable variant; the desktop view restores
        // space-between via the media query.
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

      {/* Center links — horizontally scrollable on mobile so a narrow
          phone never truncates the link strip. Scrollbar is hidden via
          .ys-nav-links::-webkit-scrollbar in app/globals.css; the row
          still scrolls with touch/swipe + arrow keys. */}
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
        {/* Categories goes to the real marketplace browse page — the
            #categories anchor pointed at PopularCategories.tsx which
            isn't rendered in the trimmed 7-section landing. */}
        <a href="/marketplace" className="ys-nav-link" style={navLinkStyle}>Browse services</a>
        <a href="#practices" className="ys-nav-link" style={navLinkStyle}>Practices</a>
        <a href="#how" className="ys-nav-link" style={navLinkStyle}>How it works</a>
        <a href="#faq" className="ys-nav-link" style={navLinkStyle}>FAQ</a>
      </div>

      {/* Right side. On mobile we collapse to just the brand CTA so the
          row never overflows. The scrollable .ys-nav-links handles
          discovery of the rest of the page. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <div className="ys-nav-right-extras">
          <GlobalLanguageBar />
        </div>

        {/* Sign-in promoted from a tertiary ghost button to a primary "My
            Account" CTA — matches the "members area" framing the rest of
            the landing uses and gives returning users a single dominant
            action on the nav. The Clerk modal still opens via the same
            onOpenSignIn handler; only the label + variant changed. */}
        <Btn
          variant="brand"
          size="sm"
          onClick={onOpenSignIn}
        >
          My Account
          <Arrow size={14} stroke={2} />
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          onClick={() => {
            window.location.href = 'https://portal.yousafeconsultancy.com/sign-up/student'
          }}
        >
          Start an inquiry
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
