'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { ThemePicker } from './ThemePicker'
import { T, F } from './tokens'
import MarketplaceAuthNav from './MarketplaceAuthNav'
import { JurisdictionDropdown } from './JurisdictionDropdown'
import { CategoryBar } from './CategoryBar'
import { CategoryBarSkeleton } from './MarketplaceRouteSkeleton'
import { marketplaceOrdersHref, readOrderIdFromSearch } from '@/lib/orderLinks'
import { writeMessengerThreadParam } from '@/lib/messaging/threadUrl'

// Lazy-load the heavier section panels to keep initial bundle small
const FindAttorney  = dynamic(() => import('@/components/design/find-attorney'),  { ssr: false })
const MyInquiries   = dynamic(() => import('@/components/design/my-inquiries'),   { ssr: false })
// Attorney-side inquiries component — calls /api/attorney/inquiries. The
// MyInquiries import above is CLIENT-side (/api/client/inquiries) and 403s
// when an attorney hits it, which is what produced the "Client account not
// active" banner the user screenshotted.
const AttorneyInquiries = dynamic(() => import('@/components/design/attorney-inquiries'), { ssr: false })
const UnifiedInbox  = dynamic(() => import('@/components/messaging/UnifiedInbox'), { ssr: false })
// Provider-only (attorney / consultant) Handshake-style feed of open student
// inquiries. Replaces the public "Live case briefs" strip on the landing.
const TrendingOpportunities = dynamic(() => import('@/components/marketplace/TrendingOpportunities'), { ssr: false })
const MarketplaceOrdersPanel = dynamic(() => import('@/components/marketplace/MarketplaceOrdersPanel'), { ssr: false })

// ─── types ────────────────────────────────────────────────────────────────────

type Role    = 'client' | 'attorney' | 'consultant' | 'admin' | null
type Section = 'browse' | 'orders' | 'attorneys' | 'inquiries' | 'messages' | 'queue' | 'mine' | 'earnings' | string

interface NavLink { icon: string; label: string; view: string }

// ─── nav configs per role ─────────────────────────────────────────────────────

const CLIENT_NAV: NavLink[] = [
  { icon: '🏬', label: 'Browse',        view: 'browse'    },
  { icon: '📦', label: 'My Orders',     view: 'orders'    },
  { icon: '⚖️', label: 'Find A Specialist', view: 'attorneys' },
  { icon: '📥', label: 'Inquiries',     view: 'inquiries' },
  { icon: '💬', label: 'Messages',      view: 'messages'  },
]

const ATTORNEY_NAV: NavLink[] = [
  { icon: '🏬', label: 'Marketplace',    view: 'browse'   },
  { icon: '📈', label: 'Trending Opportunities', view: 'opportunities' },
  { icon: '📥', label: 'Inquiry Queue',  view: 'queue'    },
  { icon: '📂', label: 'My Inquiries',   view: 'mine'     },
  { icon: '📦', label: 'Active Orders',  view: 'orders'   },
  { icon: '💬', label: 'Messages',       view: 'messages' },
]

const CONSULTANT_NAV: NavLink[] = [
  { icon: '🏬', label: 'Marketplace', view: 'browse'   },
  { icon: '📈', label: 'Trending Opportunities', view: 'opportunities' },
  { icon: '📦', label: 'Orders',      view: 'orders'   },
  { icon: '💬', label: 'Messages',    view: 'messages' },
]

function navLinksForRole(role: Role | null): NavLink[] {
  if (role === 'attorney')   return ATTORNEY_NAV
  if (role === 'consultant') return CONSULTANT_NAV
  if (role === 'client')     return CLIENT_NAV
  // public / unauthenticated
  return [
    { icon: '⚖️', label: 'Find A Specialist', view: 'attorneys' },
  ]
}

// ─── Embedded section panels ──────────────────────────────────────────────────

function MessagesPanel({ role }: { role: Role }) {
  if (!role) {
    return (
      <PanelShell title="Messages" icon="💬">
        <EmptyCard
          icon="💬"
          title="Log in to message attorneys + consultants"
          body="Create a YouSafe account to start a conversation, view your inbox, and track every chat in one place."
          cta={{ label: 'Create your account', view: 'open-portal' }}
        />
      </PanelShell>
    )
  }

  return (
    <div
      className="yousafe-messenger"
      style={{
        height: 'calc(100dvh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg, #F7F8FA)',
        color: 'var(--text, #0F172A)',
        colorScheme: 'light',
        isolation: 'isolate',
      }}
    >
      <UnifiedInbox
        canSendOffer={role === 'attorney' || role === 'consultant'}
        defaultThreadId={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('thread') : null}
        onThreadChange={(id: string | null) => writeMessengerThreadParam(id)}
      />
    </div>
  )
}

// ─── reusable primitives ──────────────────────────────────────────────────────

function PanelShell({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px 64px', fontFamily: F.ui }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <span style={{ fontSize: '22px' }}>{icon}</span>
        <h2 style={{ fontFamily: F.display, fontWeight: 600, fontSize: '28px', color: T.ink, margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>{children}</div>
    </div>
  )
}

function EmptyCard({ icon, title, body, cta }: { icon: string; title: string; body: string; cta?: { label: string; view: string } }) {
  const router = useRouter()
  const handleCta = () => {
    if (!cta) return
    if (cta.view === 'open-portal') {
      window.location.href = 'https://portal.yousafeconsultancy.com/sign-up/student?lane=student&source=market_messages_empty'
      return
    }
    if (cta.view === 'browse') {
      router.push('/')
      return
    }
    router.push(`/?view=${cta.view}`)
  }
  return (
    <div style={{ background: T.vellum, border: `1px dashed ${T.rule}`, borderRadius: '8px', padding: '40px 24px', textAlign: 'center' as const }}>
      <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.4 }}>{icon}</div>
      <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: '18px', color: T.ink, marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: T.inkSoft, lineHeight: 1.6, marginBottom: cta ? '20px' : 0 }}>{body}</div>
      {cta && (
        <button onClick={handleCta} style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 22px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: T.indigo, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: F.ui }}>
          {cta.label}
        </button>
      )}
    </div>
  )
}

// ─── mobile menu (viewport-locked sheet) ─────────────────────────────────────
//
// Rendered through a portal on document.body so it is NEVER a descendant of
// the sticky header. The header still has an inline backdrop-filter; that
// creates a containing block for position:fixed children on iOS Safari, which
// is what made the old in-header drawer grow the navbar to 100dvh and "dislodge"
// it from the top of the screen. The sheet is sized from the visual viewport
// (see app/mobile-visual-viewport.css) so it stays on-screen regardless of
// document length or scroll position.

function copyMarketCssVars(dest: HTMLElement) {
  const src = document.querySelector('.cw-market')
  if (!(src instanceof HTMLElement)) return
  const cs = getComputedStyle(src)
  for (let i = 0; i < cs.length; i += 1) {
    const key = cs.item(i)
    if (key.startsWith('--ys-') || key.startsWith('--font-')) {
      dest.style.setProperty(key, cs.getPropertyValue(key).trim())
    }
  }
}

function useMarketplaceMenuLock(open: boolean, onClose: () => void) {
  React.useEffect(() => {
    if (!open) return

    const html = document.documentElement
    const body = document.body
    const scrollY = window.scrollY
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
    }

    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    html.classList.add('ys-market-menu-open')
    body.classList.add('ys-market-menu-open')

    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)

    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      body.style.position = prev.bodyPosition
      body.style.top = prev.bodyTop
      body.style.left = prev.bodyLeft
      body.style.right = prev.bodyRight
      body.style.width = prev.bodyWidth
      html.classList.remove('ys-market-menu-open')
      body.classList.remove('ys-market-menu-open')
      document.removeEventListener('keydown', onKey)
      window.scrollTo(0, scrollY)
    }
  }, [open, onClose])
}

function MarketMobileDrawer({
  open,
  onClose,
  role,
  links,
  activeView,
  shopActive,
  country,
  onNav,
}: {
  open: boolean
  onClose: () => void
  role: Role
  links: NavLink[]
  activeView: Section
  shopActive?: boolean
  country: 'all' | 'us' | 'uk' | 'ca' | 'au'
  onNav: (v: Section) => void
}) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const closeRef = React.useRef<HTMLButtonElement | null>(null)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => { setMounted(true) }, [])
  useMarketplaceMenuLock(open, onClose)

  React.useLayoutEffect(() => {
    if (!open) return
    const dest = rootRef.current
    if (dest) copyMarketCssVars(dest)
    closeRef.current?.focus()
  }, [open])

  const go = React.useCallback((view: Section) => {
    onClose()
    onNav(view)
  }, [onClose, onNav])

  if (!open || !mounted) return null

  const homeCurrent = !shopActive && activeView === 'browse'
  const shopCurrent = Boolean(shopActive)

  return createPortal(
    <div
      ref={rootRef}
      id="ys-market-mobile-menu"
      className="ys-shell-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Marketplace menu"
    >
      <button
        type="button"
        className="ys-shell-drawer-backdrop"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="ys-shell-drawer-panel">
        <div className="ys-shell-drawer-head">
          <p id="ys-market-menu-title" className="ys-shell-drawer-title">Marketplace</p>
          <button
            ref={closeRef}
            id="ys-market-menu-close"
            type="button"
            className="ys-shell-drawer-close"
            aria-label="Close menu"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <nav className="ys-shell-drawer-nav" aria-label="Marketplace">
          <a
            href="/"
            className="ys-shell-drawer-link"
            aria-current={homeCurrent ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); go('browse') }}
          >
            Home
          </a>
          <a
            href="https://portal.yousafeconsultancy.com/dashboard"
            className="ys-shell-drawer-link"
            onClick={onClose}
          >
            Dashboard
          </a>
          <a
            href="https://market.yousafeconsultancy.com/shop"
            className="ys-shell-drawer-link"
            aria-current={shopCurrent ? 'page' : undefined}
            onClick={onClose}
          >
            File shop
          </a>
          {links.map((link) => {
            const current = !shopActive && link.view === activeView
            return (
              <button
                key={link.view}
                type="button"
                className="ys-shell-drawer-link"
                aria-current={current ? 'page' : undefined}
                onClick={() => go(link.view as Section)}
              >
                {link.label}
              </button>
            )
          })}
        </nav>
        <div className="ys-shell-drawer-extras">
          <p className="ys-shell-drawer-kicker">Preferences</p>
          {role !== null && (
            <React.Suspense fallback={null}>
              <JurisdictionDropdown active={country} />
            </React.Suspense>
          )}
          <GlobalLanguageBar />
          <ThemePicker />
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── top nav bar ─────────────────────────────────────────────────────────────

function TopNav({ role, activeView, onNav, country, shopActive }: { role: Role; activeView: Section; onNav: (v: Section) => void; country: 'all' | 'us' | 'uk' | 'ca' | 'au'; shopActive?: boolean }) {
  const [scrolled, setScrolled] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  // Refs for the scrollable nav strip + the currently-active button so we
  // can auto-scroll the active tab into view on mobile. Without this, when
  // the user is at the rightmost tab and the strip wraps to a second mount
  // (deep link, role change), they see the leftmost tabs instead of where
  // they actually are.
  const navScrollRef = React.useRef<HTMLElement | null>(null)
  const activeNavRef = React.useRef<HTMLButtonElement | null>(null)
  const closeMenu = React.useCallback(() => setMenuOpen(false), [])

  React.useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Centre the active tab in the strip whenever activeView changes. Uses
  // `inline: 'center'` so the chosen item sits in the middle of the
  // viewport — feels like a sticky cursor.
  React.useEffect(() => {
    const el = activeNavRef.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    // requestAnimationFrame so the layout has settled before we measure
    const id = requestAnimationFrame(() => {
      try {
        el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      } catch {
        // Older browsers may not support the options object — fall back
        // to the legacy boolean form (alignToTop=true).
        el.scrollIntoView(true)
      }
    })
    return () => cancelAnimationFrame(id)
  }, [activeView])

  const links = navLinksForRole(role)

  return (
    <header
      className="ys-shell-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        background: T.vellum,
        borderBottom: `1px solid ${T.rule}`,
        boxShadow: scrolled ? '0 8px 24px rgba(15,23,42,0.08), 0 1px 0 rgba(15,23,42,0.04)' : '0 1px 0 rgba(15,23,42,0.04)',
        transition: 'box-shadow 0.22s cubic-bezier(0.22,1,0.36,1)',
        fontFamily: F.ui,
      }}
    >
      <div className="ys-shell-header-inner" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', height: 72 }}>

        {/* Brand */}
        <a
          href="https://yousafeconsultancy.com/"
          className="ys-shell-brand"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px 0 0', marginRight: '2px', textDecoration: 'none', flexShrink: 0 }}
        >
          {role === null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src="/logo.png"
                alt="YouSafe Consultancy"
                width="30"
                height="30"
                style={{ width: 30, height: 30, objectFit: 'contain' }}
              />
              <span style={{
                fontFamily: F.ui, fontSize: 19, fontWeight: 800,
                color: T.onPaper, letterSpacing: '-0.02em',
              }}>YouSafe</span>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src="/logo.png"
                alt="YouSafe Consultancy"
                width="30"
                height="30"
                style={{ width: 30, height: 30, objectFit: 'contain' }}
              />
              <div style={{ textAlign: 'left' as const }}>
                <div style={{ fontFamily: F.ui, fontSize: '15px', fontWeight: 800, color: T.onPaper, letterSpacing: '-0.015em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>YouSafe</div>
                <div className="ys-shell-brand-sub" style={{ fontSize: '9px', color: T.onPaperSoft, letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginTop: '1px', whiteSpace: 'nowrap' }}>
                  {role === 'client' ? 'Marketplace' : role === 'attorney' ? 'Attorney Portal' : role === 'consultant' ? 'Consultant Portal' : 'Marketplace'}
                </div>
              </div>
            </div>
          )}
        </a>

        {/* Uniform pill buttons — Home, Dashboard, File shop */}
        {[
          { label: 'Home', href: '/', external: false, icon: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z' },
          { label: 'Dashboard', href: 'https://portal.yousafeconsultancy.com/dashboard', external: false, icon: '' },
          { label: 'File shop', href: 'https://market.yousafeconsultancy.com/shop', external: false, icon: '' },
        ].map((btn) => {
          const isActive = btn.label === 'File shop'
            ? shopActive
            : btn.label === 'Home'
              ? !shopActive && activeView === 'browse'
              : false
          const sharedStyle: React.CSSProperties = {
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0 16px', marginRight: 6,
            height: 36, borderRadius: 999,
            fontSize: 13, fontWeight: 600, fontFamily: F.ui,
            textDecoration: 'none', whiteSpace: 'nowrap' as const, flexShrink: 0,
            border: isActive ? 'none' : `1px solid ${T.rule}`,
            background: isActive ? T.indigo : 'transparent',
            color: isActive ? '#fff' : T.onPaper,
            transition: 'all 150ms ease',
          }
          const hoverIn = (e: React.MouseEvent) => {
            const el = e.currentTarget as HTMLElement
            if (!isActive) { el.style.background = 'rgba(15,23,42,0.045)'; el.style.borderColor = 'rgba(15,23,42,0.14)'; el.style.color = '#0F172A' }
          }
          const hoverOut = (e: React.MouseEvent) => {
            const el = e.currentTarget as HTMLElement
            if (!isActive) { el.style.background = 'transparent'; el.style.borderColor = T.rule; el.style.color = T.onPaper }
          }
          if (btn.external) {
            return (
              <a key={btn.label} href={btn.href} target="_blank" rel="noopener" className="ys-shell-desktop-pill" style={sharedStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                {btn.label}
              </a>
            )
          }
          return (
            <Link
              key={btn.label}
              href={btn.href}
              className="ys-shell-desktop-pill"
              style={sharedStyle}
              onMouseEnter={hoverIn}
              onMouseLeave={hoverOut}
              onClick={(e) => {
                if (btn.label !== 'Home') return
                e.preventDefault()
                onNav('browse')
              }}
            >
              {btn.icon && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={btn.icon} />
                </svg>
              )}
              {btn.label}
            </Link>
          )
        })}

        {/* Nav tabs — scrollable on mobile; the active item scrolls itself
            into view so the user always sees which section they're on
            even after they've scrolled the tab strip sideways. */}
        <nav
          ref={navScrollRef}
          className="ys-market-nav"
          style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflowX: 'auto' as const, scrollbarWidth: 'none' as const, scrollSnapType: 'x mandatory' as const, WebkitOverflowScrolling: 'touch' as const }}
        >
          {links.map(link => {
            const active = link.view === activeView && !shopActive
            return (
              <button
                key={link.view}
                ref={(el) => { if (active) activeNavRef.current = el }}
                onClick={() => onNav(link.view as Section)}
                onMouseEnter={(e) => {
                  if (active) return
                  const el = e.currentTarget as HTMLElement
                  el.style.background = 'rgba(15,23,42,0.045)'
                  el.style.borderColor = 'rgba(15,23,42,0.14)'
                  el.style.color = '#0F172A'
                }}
                onMouseLeave={(e) => {
                  if (active) return
                  const el = e.currentTarget as HTMLElement
                  el.style.background = 'transparent'
                  el.style.borderColor = T.rule
                  el.style.color = T.onPaper
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '0 16px',
                  height: 36,
                  borderRadius: 999,
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  color: active ? '#fff' : T.onPaper,
                  background: active ? T.indigo : 'transparent',
                  border: active ? 'none' : `1px solid ${T.rule}`,
                  cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  flexShrink: 0,
                  scrollSnapAlign: 'start' as const,
                  transition: 'all 150ms ease',
                  fontFamily: F.ui,
                }}
              >
                {link.label}
              </button>
            )
          })}
        </nav>

        {role !== null && (
          <div className="ys-shell-jx" style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
            <React.Suspense fallback={null}>
              <JurisdictionDropdown active={country} />
            </React.Suspense>
          </div>
        )}

        <div className="ys-shell-aux" style={{ display: 'flex', alignItems: 'center', paddingLeft: '8px', flexShrink: 0 }}>
          <GlobalLanguageBar />
        </div>
        <div className="ys-shell-aux" style={{ display: 'flex', alignItems: 'center', paddingLeft: '6px', flexShrink: 0 }}>
          <ThemePicker />
        </div>
        <div className="ys-shell-aux ys-shell-auth" style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
          <MarketplaceAuthNav signUpHref="https://portal.yousafeconsultancy.com/sign-up/student?lane=student&source=market_shell" />
        </div>
        <button
          type="button"
          className="ys-shell-menu-toggle"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="ys-market-mobile-menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? '×' : '☰'}
        </button>
      </div>
      <MarketMobileDrawer
        open={menuOpen}
        onClose={closeMenu}
        role={role}
        links={links}
        activeView={activeView}
        shopActive={shopActive}
        country={country}
        onNav={onNav}
      />
    </header>
  )
}

// ─── shell ────────────────────────────────────────────────────────────────────

// Role cache: sessionStorage keeps /api/profile from firing on every market
// navigation. Fresh cache (<60s) renders the correct nav instantly.
const ROLE_CACHE_KEY = 'ys-market-role-cache'
const ROLE_CACHE_MS = 60_000

function readCachedRole(): { role: Role; fresh: boolean } {
  if (typeof window === 'undefined') return { role: null, fresh: false }
  try {
    const raw = window.sessionStorage.getItem(ROLE_CACHE_KEY)
    if (!raw) return { role: null, fresh: false }
    const parsed = JSON.parse(raw)
    const fresh = typeof parsed?.t === 'number' && Date.now() - parsed.t < ROLE_CACHE_MS
    return { role: (parsed?.role as Role) || null, fresh }
  } catch {
    return { role: null, fresh: false }
  }
}

export default function MarketplaceShell({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname()
  const router       = useRouter()

  const [role, setRole] = React.useState<Role>(() => readCachedRole().role)
  const [country, setCountry] = React.useState<'all' | 'us' | 'uk' | 'ca'>('all')
  const [section, setSection] = React.useState<Section>('browse')
  const [openOrderId, setOpenOrderId] = React.useState<string | null>(null)

  // Resolve role on mount AND whenever the tab regains focus or the
  // pathname changes. Without revalidation the shell kept whichever
  // role it loaded at mount even after the user signed out in another
  // tab -- the navbar still showed Browse / My Orders / Inquiries /
  // Messages for what is now an anon visitor. We also have to set the
  // role explicitly (including to null) so subsequent calls can CLEAR
  // a stale value, not just set it on first sight.
  // A <60s sessionStorage cache satisfies the fetch instead so inner
  // navigations never wait on /api/profile.
  const refreshRole = React.useCallback(() => {
    const cached = readCachedRole()
    if (cached.fresh) {
      setRole(cached.role)
      return
    }
    fetch('/api/profile', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const nextRole = (d?.profile?.role as Role) || null
        setRole(nextRole)
        try { window.sessionStorage.setItem(ROLE_CACHE_KEY, JSON.stringify({ role: nextRole, t: Date.now() })) } catch { /* storage blocked */ }
      })
      .catch(() => { setRole(null) })
  }, [])

  React.useEffect(() => {
    refreshRole()
  }, [refreshRole, pathname])

  React.useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshRole()
      }
    }
    const onFocus = () => refreshRole()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshRole])

  // Sync section + country from the URL. Read via window.location instead of
  // useSearchParams() so the shell never suspends (and never drags the whole
  // page tree into a Suspense fallback) on client navigations.
  const onShop = pathname === '/shop' || pathname.startsWith('/shop/')

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const view = sp.get('view')
    setCountry(((sp.get('country') as 'all' | 'us' | 'uk' | 'ca') || 'all'))
    if (onShop) setSection('shop')
    else if (view) setSection(view as Section)
    else setSection('browse')
    setOpenOrderId(view === 'orders' ? readOrderIdFromSearch(window.location.search) : null)
  }, [pathname, onShop])

  // Palette transitions must read as instant token application, not a 350ms
  // "theme load". Suppress them from first paint and for 100ms after every
  // navigation; the CSS below only runs transitions once this flag is set.
  React.useEffect(() => {
    const el = document.documentElement
    el.removeAttribute('data-ys-palette-ready')
    const t = window.setTimeout(() => el.setAttribute('data-ys-palette-ready', ''), 100)
    return () => window.clearTimeout(t)
  }, [pathname])

  // When a nav button is clicked, update state AND URL so browser history works
  const handleNav = React.useCallback((view: Section) => {
    if (view === 'open-portal') {
      window.location.href = 'https://portal.yousafeconsultancy.com/sign-up/student?lane=student&source=market_messages_empty'
      return
    }
    setSection(view)
    setOpenOrderId(null)
    if (view === 'browse') {
      router.push('/')
    } else if (view === 'orders') {
      router.push(marketplaceOrdersHref())
    } else {
      router.push(`/?view=${view}`)
    }
  }, [router])

  const openOrder = React.useCallback((id: string) => {
    setSection('orders')
    setOpenOrderId(id)
    router.push(marketplaceOrdersHref(id))
  }, [router])

  const closeOrder = React.useCallback(() => {
    setOpenOrderId(null)
    setSection('orders')
    router.push(marketplaceOrdersHref())
  }, [router])

  React.useEffect(() => {
    const onOpen = (e: Event) => {
      const orderId = (e as CustomEvent)?.detail?.orderId
      if (!orderId) return
      openOrder(String(orderId))
    }
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {}
      if (detail.page === 'orders' || detail.page === 'order-detail') {
        if (detail.orderId) openOrder(String(detail.orderId))
        else handleNav('orders')
        return
      }
      if (detail.page === 'messages') handleNav('messages')
      if (detail.page === 'inquiries') handleNav('inquiries')
      if (detail.page === 'attorneys') handleNav('attorneys')
      if (detail.page === 'billing') {
        window.location.href = '/dashboard?page=billing'
      }
    }
    window.addEventListener('yousafe-open-order', onOpen as EventListener)
    window.addEventListener('yousafe-navigate', onNav as EventListener)
    return () => {
      window.removeEventListener('yousafe-open-order', onOpen as EventListener)
      window.removeEventListener('yousafe-navigate', onNav as EventListener)
    }
  }, [handleNav, openOrder])

  // Render section content. Attorneys see the attorney-side inquiry
  // queue / "mine" tab; clients see /api/client/inquiries. Routing both
  // roles to the same MyInquiries component was the bug that produced
  // "Client account not active." on the attorney marketplace.
  const sectionContent = React.useMemo(() => {
    if (section === 'browse')     return null                      // render children
    if (section === 'orders')     return (
      <MarketplaceOrdersPanel
        role={role}
        orderId={openOrderId}
        onOpenOrder={openOrder}
        onBack={closeOrder}
        onBrowse={() => handleNav('browse')}
      />
    )
    if (section === 'messages')   return <MessagesPanel role={role} />
    if (section === 'attorneys')  return <FindAttorney />
    if (section === 'inquiries')  {
      if (role === 'attorney') return <AttorneyInquiries mode="queue" />
      return <MyInquiries />
    }
    if (section === 'queue')      return <AttorneyInquiries mode="queue" />
    if (section === 'mine')       return <AttorneyInquiries mode="mine" />
    if (section === 'opportunities') {
      // Provider-only: anyone else deep-linking here falls through to browse.
      if (role === 'attorney' || role === 'consultant') return <TrendingOpportunities role={role} />
      return null
    }
    return null // unknown view → fall through to children
  }, [section, role, openOrderId, openOrder, closeOrder, handleNav])

  return (
    <div className="cw-market" style={{ minHeight: '100dvh', backgroundColor: T.paper, fontFamily: F.ui, position: 'relative', isolation: 'isolate' }}>
      {/* Base CSS for the pattern picker ::before pseudo-element and
          consistent marketplace styling across ALL pages (landing + siblings). */}
      <style>{`
        /* Pattern contract (single source of truth, mirrored in the landing):
           the fixed ::before texture sits ABOVE the shell's solid paper fill
           (z-index: 0) and BELOW all page content (direct children are
           raised to z-index: 1). pointer-events: none keeps it inert.
           PatternPicker / ThemePicker inject background-image here — nothing
           may zero it except the picker's "Solid" option. */
        .cw-market::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none; background-color: transparent; opacity: 0.22; }
        .cw-market::after { content: none; }
        .cw-market > * { position: relative; z-index: 1; }
        .cw-market, .cw-market *, .cw-market *::before, .cw-market *::after { box-sizing: border-box; }
        .cw-market a { color: inherit; text-decoration: none; }
        .cw-market button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
        .cw-market img, .cw-market svg { display: block; max-width: 100%; }

        /* Palette changes transition smoothly (~350ms). Only paint props
           transition — never "all", and no opacity-based "theme load"
           animation. Scoped to the shell chrome + card surfaces, not "*". */
        .cw-market,
        .cw-market header, .cw-market footer, .cw-market nav,
        .cw-market section, .cw-market aside,
        .cw-market .gig, .cw-market .seller-card, .cw-market .faq-item,
        .cw-market .cw-files-card, .cw-market .cw-all-card, .cw-market .quote,
        .cw-market .trust, .cw-market .hero, .cw-market .pill-mini,
        .cw-market .topbar, .cw-market .country-bar, .cw-market .ys-cat-bar,
        .cw-market .cw-all-drawer, .cw-market .cw-help-panel, .cw-market .chat-side-pane,
        .cw-market button, .cw-market a, .cw-market input {
          transition-property: background-color, color, border-color, fill, stroke;
          transition-duration: 0.35s;
          transition-timing-function: ease;
        }

        /* Navigation / first paint: tokens must apply instantly. Transitions
           only run once the shell marks the route settled
           (data-ys-palette-ready, set 100ms after the pathname settles), so a
           palette change never reads as a slow "theme load" on navigation. */
        html:not([data-ys-palette-ready]) .cw-market,
        html:not([data-ys-palette-ready]) .cw-market *,
        html:not([data-ys-palette-ready]) .cw-market *::before,
        html:not([data-ys-palette-ready]) .cw-market *::after {
          transition: none !important;
        }
        @media (prefers-reduced-motion: reduce) {
          .cw-market, .cw-market *, .cw-market *::before, .cw-market *::after {
            transition: none !important;
          }
        }

        /* ══════════ PALETTE / LEGIBILITY CONTRACT ══════════
           Light professional chrome matching Portal Messages.

             LIGHT chrome (paper / paper2 / paper3 / footer — page bg,
             header, rails)     → dark text: var(--ys-onPaper)
             LIGHT cards  (vellum / cream — sheets, modals)
                                → dark text:  var(--ys-ink)

           Solid accent fills (indigo / indigoDeep) always carry white labels. */

        /* 1. The page owns the palette: text sitting directly on light
              paper defaults to charcoal. */
        .cw-market { color: var(--ys-onPaper, #0F172A); }

        /* 1b. Split headlines keep BOTH halves dark on light paper. */
        .cw-market .section-head h2,
        .cw-market .faq-heading,
        .cw-market .cw-files-rail-head h2 {
          color: var(--ys-onPaper, #0F172A);
        }
        .cw-market .section-head h2 em,
        .cw-market .seller-card h2 em,
        .cw-market .cw-files-rail-head h2 em {
          font-style: italic;
          color: var(--ys-onPaperEm, var(--ys-onPaper, #0F172A));
        }
        .cw-market .section-head .meta,
        .cw-market .section-head .meta a {
          color: var(--ys-onPaperSoft, rgba(15,23,42,0.72));
        }

        /* 2. Light paper surfaces always carry dark text. */
        .cw-market [style*="background: var(--ys-paper)"],
        .cw-market [style*="background-color: var(--ys-paper)"],
        .cw-market [style*="background: var(--ys-paper2)"],
        .cw-market [style*="background-color: var(--ys-paper2)"],
        .cw-market [style*="background: var(--ys-paper3)"],
        .cw-market [style*="background-color: var(--ys-paper3)"],
        .cw-market [style*="background: var(--ys-footer)"],
        .cw-market [style*="background-color: var(--ys-footer)"] {
          color: var(--ys-onPaper, #0F172A) !important;
        }

        /* 3. Light card surfaces always carry dark ink. */
        .cw-market [style*="background: var(--ys-vellum"],
        .cw-market [style*="background-color: var(--ys-vellum"],
        .cw-market [style*="background: var(--ys-cream"],
        .cw-market [style*="background-color: var(--ys-cream"] {
          color: var(--ys-ink, #0F172A) !important;
        }

        /* 4. Solid accent fills always carry white labels (exact-match so
              indigoSoft / indigoDeep tints are not caught). */
        .cw-market [style*="background: var(--ys-indigo)"],
        .cw-market [style*="background-color: var(--ys-indigo)"],
        .cw-market [style*="background: var(--ys-indigoDeep)"],
        .cw-market [style*="background-color: var(--ys-indigoDeep)"],
        .cw-market [style*="background: var(--ys-tealDeep)"],
        .cw-market [style*="background-color: var(--ys-tealDeep)"] {
          color: #FFFFFF !important;
        }

        .ys-shell-menu-toggle { display: none; }
        .ys-shell-menu-toggle {
          width: 44px; height: 44px; min-width: 44px; min-height: 44px;
          margin-left: 8px; border-radius: 999px; border: 1px solid var(--ys-rule, rgba(15,23,42,0.10));
          color: var(--ys-onPaper, #0F172A); font-size: 20px; line-height: 1; cursor: pointer;
          align-items: center; justify-content: center; touch-action: manipulation; flex-shrink: 0;
          background: var(--ys-vellum, #FFFFFF);
        }
        .ys-shell-drawer {
          position: fixed;
          top: var(--ys-visual-viewport-offset-top, 0px);
          left: 0;
          right: 0;
          width: 100%;
          height: var(--ys-visual-viewport-block-size, 100dvh);
          max-height: var(--ys-visual-viewport-block-size, 100dvh);
          z-index: 2147483642;
          overflow: hidden;
          pointer-events: auto;
        }
        .ys-shell-drawer-backdrop {
          position: absolute; inset: 0; width: 100%; height: 100%;
          background: rgba(15,23,42,0.32); border: 0; cursor: pointer;
          touch-action: none; overscroll-behavior: none;
        }
        .ys-shell-drawer-panel {
          position: absolute; top: 0; right: 0; bottom: 0;
          width: min(360px, 88vw); height: auto; max-height: 100%;
          background: var(--ys-vellum, #FFFFFF); color: var(--ys-onPaper, #0F172A);
          display: flex; flex-direction: column;
          overflow: hidden;
          border-left: 1px solid var(--ys-rule, rgba(15,23,42,0.10));
        }
        .ys-shell-drawer-head {
          flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 14px 16px 8px;
          padding-top: max(14px, env(safe-area-inset-top));
        }
        .ys-shell-drawer-title {
          margin: 0; font-size: 15px; font-weight: 800; letter-spacing: -0.015em; line-height: 1.2;
        }
        .ys-shell-drawer-close {
          width: 44px; height: 44px; min-width: 44px; min-height: 44px; border-radius: 999px;
          border: 1px solid var(--ys-rule, rgba(15,23,42,0.12));
          background: var(--ys-vellum, #FFFFFF); color: inherit;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; touch-action: manipulation; flex-shrink: 0;
        }
        .ys-shell-drawer-nav {
          flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch; padding: 4px 16px 8px;
          display: flex; flex-direction: column; gap: 2px;
        }
        .ys-shell-drawer-link {
          display: flex; align-items: center; min-height: 44px; padding: 10px 12px; border-radius: 10px;
          color: inherit; text-decoration: none; font-size: 16px; font-weight: 600; text-align: left;
          background: transparent; border: 0; cursor: pointer; font-family: inherit; touch-action: manipulation;
        }
        .ys-shell-drawer-extras {
          flex: 0 0 auto; display: flex; flex-direction: column; gap: 12px;
          margin: 0 16px 0; padding: 16px 0 calc(18px + env(safe-area-inset-bottom));
          border-top: 1px solid var(--ys-rule, rgba(15,23,42,0.10));
        }
        .ys-shell-drawer-kicker {
          margin: 0; font-size: 10px; font-weight: 800; letter-spacing: 0.11em;
          text-transform: uppercase; color: var(--ys-inkSoft, #526072);
        }
        @media (max-width: 768px) {
          .ys-shell-header-inner { padding: 8px 12px !important; height: 60px !important; min-height: 60px !important; flex-wrap: nowrap !important; }
          .ys-shell-desktop-pill, .ys-market-nav, .ys-shell-jx, .ys-shell-aux:not(.ys-shell-auth) { display: none !important; }
          .ys-shell-menu-toggle { display: inline-flex !important; }
          .ys-shell-brand { padding-right: 8px !important; }
          .ys-shell-brand-sub { display: none !important; }
          .ys-cat-bar-inner { padding: 0 12px !important; height: 46px !important; }
        }
      `}</style>
      {/* Top nav — renders immediately on every navigation; auth-only links
          appear once the (cached or fetched) role resolves. Never gated on a
          network round-trip. */}
      <TopNav role={role} activeView={section} onNav={handleNav} country={country} shopActive={onShop} />

      {/* Sub-nav — visa category bar stays on marketplace browse, not the file shop */}
      {section === 'browse' && !onShop && (
        <React.Suspense fallback={<CategoryBarSkeleton />}>
          <CategoryBar country={country} />
        </React.Suspense>
      )}

      {/* Section content OR marketplace pages */}
      {sectionContent ?? children}
    </div>
  )
}
