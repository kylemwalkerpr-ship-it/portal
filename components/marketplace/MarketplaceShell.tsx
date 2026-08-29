'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { ThemePicker } from './ThemePicker'
import { T, F } from './tokens'
import MarketplaceAuthNav from './MarketplaceAuthNav'
import { JurisdictionDropdown } from './JurisdictionDropdown'
import { CategoryBar } from './CategoryBar'

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

function OrdersPanel({ role }: { role: Role }) {
  const [orders, setOrders]   = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState('')

  React.useEffect(() => {
    const endpoint = role === 'attorney'   ? '/api/attorney/data'
                   : role === 'consultant' ? '/api/consultant/data'
                   : '/api/student/data'
    fetch(endpoint, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setOrders(data?.orders ?? data?.data?.orders ?? [])
      })
      .catch(() => setError('Could not load orders.'))
      .finally(() => setLoading(false))
  }, [role])

  const statusColor: Record<string, string> = {
    active:     '#1A6B45', in_progress: '#1A6B45', review: '#3D2B6B',
    completed:  T.ink,     new:         '#8B5E0A', pending: '#8B5E0A',
    cancelled:  '#8B1A1A', refunded:    '#8B1A1A',
  }

  return (
    <PanelShell title="My Orders" icon="📦">
      {loading && <LoadingRows />}
      {error   && <ErrorCard msg={error} />}
      {!loading && !error && orders.length === 0 && (
        <EmptyCard
          icon="📦"
          title="No orders yet"
          body="Browse the marketplace and place your first order to see it here."
          cta={{ label: 'Browse Marketplace', view: 'browse' }}
        />
      )}
      {!loading && !error && orders.map((o: any) => (
        <div key={o.id} style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', boxShadow: '0 1px 3px rgba(29,36,51,0.05)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: '16px', color: T.ink, lineHeight: 1.2, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o.service || o.title || 'Service order'}
            </div>
            <div style={{ fontSize: '12px', color: T.inkSoft, lineHeight: 1.4 }}>
              {o.consultant || o.provider || ''}{o.created_at ? ` · ${new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
          <span style={{ flexShrink: 0, display: 'inline-block', padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, background: `${statusColor[o.status] ?? T.inkSoft}15`, color: statusColor[o.status] ?? T.inkSoft, border: `1px solid ${statusColor[o.status] ?? T.inkSoft}30` }}>
            {o.status?.replace(/_/g, ' ') ?? 'Unknown'}
          </span>
        </div>
      ))}
    </PanelShell>
  )
}

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
    <div className="yousafe-messenger" style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <UnifiedInbox
        canSendOffer={role === 'attorney' || role === 'consultant'}
        defaultThreadId={typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('thread') : null}
        onThreadChange={(id: string | null) => {
          if (typeof window === 'undefined') return
          const url = new URL(window.location.href)
          if (id) url.searchParams.set('thread', id); else url.searchParams.delete('thread')
          window.history.replaceState({}, '', url.toString())
        }}
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

function LoadingRows() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: '8px', padding: '14px 18px', display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1, height: '16px', background: T.paper2, borderRadius: '3px' }} />
          <div style={{ width: '60px', height: '22px', background: T.paper, borderRadius: '4px' }} />
        </div>
      ))}
    </>
  )
}

function ErrorCard({ msg }: { msg: string }) {
  return (
    <div style={{ background: 'rgba(178,34,52,0.06)', border: '1px solid rgba(178,34,52,0.20)', borderRadius: '8px', padding: '16px 20px', fontSize: '13px', color: T.brick }}>{msg}</div>
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
      router.push('/marketplace')
      return
    }
    router.push(`/marketplace?view=${cta.view}`)
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

// ─── top nav bar ─────────────────────────────────────────────────────────────

function TopNav({ role, activeView, onNav, country, shopActive }: { role: Role; activeView: Section; onNav: (v: Section) => void; country: 'all' | 'us' | 'uk' | 'ca' | 'au'; shopActive?: boolean }) {
  const [scrolled, setScrolled] = React.useState(false)
  // Refs for the scrollable nav strip + the currently-active button so we
  // can auto-scroll the active tab into view on mobile. Without this, when
  // the user is at the rightmost tab and the strip wraps to a second mount
  // (deep link, role change), they see the leftmost tabs instead of where
  // they actually are.
  const navScrollRef = React.useRef<HTMLElement | null>(null)
  const activeNavRef = React.useRef<HTMLButtonElement | null>(null)

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
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        background: T.paper2,
        backdropFilter: 'blur(16px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        borderBottom: `1px solid ${T.rule}`,
        boxShadow: scrolled ? '0 12px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)' : 'inset 0 1px 0 rgba(255,255,255,0.05)',
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
          { label: 'Home', href: '/marketplace', external: false, icon: 'M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z' },
          { label: 'Dashboard', href: 'https://portal.yousafeconsultancy.com/dashboard', external: false, icon: '' },
          { label: 'File shop', href: 'https://market.yousafeconsultancy.com/shop', external: false, icon: '' },
        ].map((btn) => {
          const isActive = btn.label === 'File shop'
            ? shopActive
            : btn.label === 'Home'
              ? !shopActive && section === 'browse'
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
            if (!isActive) { el.style.background = 'rgba(255,255,255,0.10)'; el.style.borderColor = 'rgba(255,255,255,0.32)'; el.style.color = '#FFFFFF' }
          }
          const hoverOut = (e: React.MouseEvent) => {
            const el = e.currentTarget as HTMLElement
            if (!isActive) { el.style.background = 'transparent'; el.style.borderColor = T.rule; el.style.color = T.onPaper }
          }
          if (btn.external) {
            return (
              <a key={btn.label} href={btn.href} target="_blank" rel="noopener" style={sharedStyle} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>
                {btn.label}
              </a>
            )
          }
          return (
            <Link
              key={btn.label}
              href={btn.href}
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
                  el.style.background = 'rgba(255,255,255,0.10)'
                  el.style.borderColor = 'rgba(255,255,255,0.32)'
                  el.style.color = '#FFFFFF'
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
        <div className="ys-shell-aux" style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
          <MarketplaceAuthNav signUpHref="https://portal.yousafeconsultancy.com/sign-up/student?lane=student&source=market_shell" />
        </div>
      </div>
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
    if (view === 'browse') {
      router.push('/marketplace')
    } else {
      router.push(`/marketplace?view=${view}`)
    }
  }, [router])

  // Render section content. Attorneys see the attorney-side inquiry
  // queue / "mine" tab; clients see /api/client/inquiries. Routing both
  // roles to the same MyInquiries component was the bug that produced
  // "Client account not active." on the attorney marketplace.
  const sectionContent = React.useMemo(() => {
    if (section === 'browse')     return null                      // render children
    if (section === 'orders')     return <OrdersPanel role={role} />
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
  }, [section, role])

  return (
    <div className="cw-market" style={{ minHeight: '100vh', backgroundColor: T.paper, fontFamily: F.ui, position: 'relative', isolation: 'isolate' }}>
      {/* Base CSS for the pattern picker ::before pseudo-element and
          consistent marketplace styling across ALL pages (landing + siblings). */}
      <style>{`
        /* Pattern contract (single source of truth, mirrored in the landing):
           the fixed ::before texture sits ABOVE the shell's solid paper fill
           (z-index: 0) and BELOW all page content (direct children are
           raised to z-index: 1). pointer-events: none keeps it inert.
           PatternPicker / ThemePicker inject background-image here — nothing
           may zero it except the picker's "Solid" option. */
        .cw-market::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none; background-color: transparent; opacity: 0.5; }
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
           The marketplace has exactly two surface classes and each owns
           its ink colour. Every page and subpage inherits this contract
           from the shell — no component may fight it.

             DARK surface  (paper / paper2 / paper3 — page bg, header,
             footer)        → light text: var(--ys-onPaper)
             LIGHT surface (vellum / cream — cards, sheets, modals)
                            → dark text:  var(--ys-ink)

           Solid accent fills (indigo / indigoDeep / tealDeep) always
           carry white labels. */

        /* 1. The page owns the palette: text sitting directly on the dark
              paper background defaults to light. Pages that set their own
              cream color still work — this is the inherited fallback. */
        .cw-market { color: var(--ys-onPaper, #F7EDE0); }

        /* 1b. Split headlines ("This week's <em>…</em>") keep BOTH halves
              light on dark paper: plain text = onPaper, italic em =
              onPaperEm (bright cream-gold, ≥ 4.5:1 vs paper* — verified in
              tests/marketplace-palette-contrast.test.ts). Kickers on dark
              paper use the same em token. Applies to every market route. */
        .cw-market .section-head h2,
        .cw-market .faq-heading,
        .cw-market .cw-files-rail-head h2 {
          color: var(--ys-onPaper, #F7EDE0);
        }
        .cw-market .section-head h2 em,
        .cw-market .seller-card h2 em,
        .cw-market .cw-files-rail-head h2 em {
          font-style: italic;
          color: var(--ys-onPaperEm, var(--ys-onPaper, #F7EDE0));
        }
        .cw-market .section-head .meta,
        .cw-market .section-head .meta a {
          color: var(--ys-onPaperSoft, rgba(247,237,224,0.72));
        }

        /* 2. Dark paper surfaces always carry light text (fixes any
              component that hardcodes ink on a paper background). */
        .cw-market [style*="background: var(--ys-paper)"],
        .cw-market [style*="background-color: var(--ys-paper)"],
        .cw-market [style*="background: var(--ys-paper2)"],
        .cw-market [style*="background-color: var(--ys-paper2)"],
        .cw-market [style*="background: var(--ys-paper3)"],
        .cw-market [style*="background-color: var(--ys-paper3)"] {
          color: var(--ys-onPaper, #F7EDE0) !important;
        }

        /* 3. Light card surfaces always carry dark ink — palette switching
              can never create cream-on-white or gold-on-white. */
        .cw-market [style*="background: var(--ys-vellum"],
        .cw-market [style*="background-color: var(--ys-vellum"],
        .cw-market [style*="background: var(--ys-cream"],
        .cw-market [style*="background-color: var(--ys-cream"] {
          color: var(--ys-ink, #1C1410) !important;
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

        @media (max-width: 720px) {
          .ys-shell-header-inner { padding: 0 12px !important; height: 60px !important; }
          .ys-market-nav { scrollbar-width: none; }
          .ys-market-nav::-webkit-scrollbar { display: none; }
          .ys-shell-brand { padding-right: 10px !important; }
          .ys-shell-brand-sub { display: none !important; }
          .ys-shell-aux { padding-left: 6px !important; }
          .ys-shell-jx { padding-left: 6px !important; }
          .ys-cat-bar-inner { padding: 0 12px !important; height: 46px !important; }
        }
        @media (max-width: 480px) {
          .ys-shell-jx { display: none !important; }
        }
      `}</style>
      {/* Top nav — renders immediately on every navigation; auth-only links
          appear once the (cached or fetched) role resolves. Never gated on a
          network round-trip. */}
      <TopNav role={role} activeView={section} onNav={handleNav} country={country} shopActive={onShop} />

      {/* Sub-nav — visa category bar stays on marketplace browse, not the file shop */}
      {section === 'browse' && !onShop && (
        <React.Suspense fallback={null}>
          <CategoryBar country={country} />
        </React.Suspense>
      )}

      {/* Section content OR marketplace pages */}
      {sectionContent ?? children}
    </div>
  )
}
