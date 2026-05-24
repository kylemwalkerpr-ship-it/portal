'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'
import { T, F } from './tokens'
import MarketplaceAuthNav from './MarketplaceAuthNav'
import { JurisdictionDropdown } from './JurisdictionDropdown'
import { CategoryBar } from './CategoryBar'

// Lazy-load the heavier section panels to keep initial bundle small
const FindAttorney  = dynamic(() => import('@/components/design/find-attorney'),  { ssr: false })
const MyInquiries   = dynamic(() => import('@/components/design/my-inquiries'),   { ssr: false })
const UnifiedInbox  = dynamic(() => import('@/components/messaging/UnifiedInbox'), { ssr: false })

// ─── types ────────────────────────────────────────────────────────────────────

type Role    = 'client' | 'attorney' | 'consultant' | 'admin' | null
type Section = 'browse' | 'orders' | 'attorneys' | 'inquiries' | 'messages' | 'queue' | 'mine' | 'earnings' | string

interface NavLink { icon: string; label: string; view: string }

// ─── nav configs per role ─────────────────────────────────────────────────────

const CLIENT_NAV: NavLink[] = [
  { icon: '🏬', label: 'Browse',        view: 'browse'    },
  { icon: '📦', label: 'My Orders',     view: 'orders'    },
  { icon: '⚖️', label: 'Find Attorney', view: 'attorneys' },
  { icon: '📥', label: 'Inquiries',     view: 'inquiries' },
  { icon: '💬', label: 'Messages',      view: 'messages'  },
]

const ATTORNEY_NAV: NavLink[] = [
  { icon: '🏬', label: 'Marketplace',    view: 'browse'   },
  { icon: '📥', label: 'Inquiry Queue',  view: 'queue'    },
  { icon: '📂', label: 'My Inquiries',   view: 'mine'     },
  { icon: '📦', label: 'Active Orders',  view: 'orders'   },
  { icon: '💬', label: 'Messages',       view: 'messages' },
]

const CONSULTANT_NAV: NavLink[] = [
  { icon: '🏬', label: 'Marketplace', view: 'browse'   },
  { icon: '📦', label: 'Orders',      view: 'orders'   },
  { icon: '💬', label: 'Messages',    view: 'messages' },
]

function navLinksForRole(role: Role | null): NavLink[] {
  if (role === 'attorney')   return ATTORNEY_NAV
  if (role === 'consultant') return CONSULTANT_NAV
  if (role === 'client')     return CLIENT_NAV
  // public / unauthenticated
  return [
    { icon: '⚖️', label: 'Find Attorney', view: 'attorneys' },
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

function TopNav({ role, activeView, onNav, country }: { role: Role; activeView: Section; onNav: (v: Section) => void; country: 'all' | 'us' | 'uk' | 'ca' }) {
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const links = navLinksForRole(role)

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 200,
        background: 'rgba(251,250,247,0.92)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderBottom: `1px solid ${T.rule}`,
        boxShadow: scrolled ? '0 2px 16px rgba(29,36,51,0.10)' : '0 1px 0 rgba(29,36,51,0.04)',
        transition: 'box-shadow 0.2s',
        fontFamily: F.ui,
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', height: 72 }}>

        {/* Brand */}
        <Link
          href={role === null ? '/marketplace' : 'https://portal.yousafeconsultancy.com/dashboard'}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px 0 0', marginRight: '2px', textDecoration: 'none', flexShrink: 0 }}
        >
          {role === null ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 4,
                background: T.indigo, color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: F.display, fontWeight: 600, fontSize: 14,
              }}>Y</span>
              <span style={{
                fontFamily: F.display, fontSize: 19, fontWeight: 600,
                color: T.ink, letterSpacing: '0.005em',
              }}>YouSafe</span>
            </div>
          ) : (
            <div style={{ textAlign: 'left' as const }}>
              <div style={{ fontFamily: F.display, fontSize: '15px', fontWeight: 600, color: T.ink, letterSpacing: '0.01em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>YouSafe</div>
              <div style={{ fontSize: '9px', color: T.inkSoft, letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginTop: '1px', whiteSpace: 'nowrap' }}>
                {role === 'client' ? 'Marketplace' : role === 'attorney' ? 'Attorney Portal' : role === 'consultant' ? 'Consultant Portal' : 'Marketplace'}
              </div>
            </div>
          )}
        </Link>

        {/* Home — links to the brand marketing site */}
        <a
          href="https://yousafeconsultancy.com/"
          aria-label="YouSafe Consultancy home"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 14px',
            marginRight: 4,
            color: T.inkSoft,
            fontSize: 13,
            fontWeight: 500,
            fontFamily: F.ui,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            transition: 'color 120ms ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = T.ink }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = T.inkSoft }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
          </svg>
          <span>Home</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.55 }}>
            <path d="M7 17 17 7" />
            <path d="M9 7h8v8" />
          </svg>
        </a>

        {/* Nav tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', flex: 1, overflowX: 'auto' as const, scrollbarWidth: 'none' as const }}>
          {links.map(link => {
            const active = link.view === activeView
            return (
              <button
                key={link.view}
                onClick={() => onNav(link.view as Section)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '0 18px',
                  fontSize: '13.5px', fontWeight: active ? 600 : 500,
                  color: active ? T.ink : T.inkSoft,
                  background: active ? T.indigoSoft : 'none',
                  border: 'none',
                  borderBottom: active ? `2px solid ${T.gold}` : '2px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  letterSpacing: active ? '0.01em' : '0',
                  flexShrink: 0,
                  transition: 'color 0.12s, border-color 0.12s, background 0.12s',
                  fontFamily: F.ui,
                }}
              >
                <span style={{ fontSize: '13px', opacity: active ? 1 : 0.7 }}>{link.icon}</span>
                {link.label}
              </button>
            )
          })}
        </nav>

        {role !== null && (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
            <JurisdictionDropdown active={country} />
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
          <GlobalLanguageBar />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', flexShrink: 0 }}>
          <MarketplaceAuthNav signUpHref="https://portal.yousafeconsultancy.com/sign-up/student?lane=student&source=market_shell" />
        </div>
      </div>
    </header>
  )
}

// ─── shell ────────────────────────────────────────────────────────────────────

export default function MarketplaceShell({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [role, setRole]       = React.useState<Role>(null)
  const [roleLoaded, setRoleLoaded] = React.useState(false)
  const [section, setSection] = React.useState<Section>('browse')

  // Resolve role once on mount
  React.useEffect(() => {
    fetch('/api/profile', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.profile?.role) setRole(d.profile.role) })
      .catch(() => {})
      .finally(() => setRoleLoaded(true))
  }, [])

  // Sync section from URL ?view= param (so back/forward works and direct links work)
  React.useEffect(() => {
    const view = searchParams?.get('view')
    if (view) setSection(view as Section)
    else if (pathname !== '/marketplace' && !pathname.includes('?')) setSection('browse')
  }, [searchParams, pathname])

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

  // Render section content
  const sectionContent = React.useMemo(() => {
    if (section === 'browse')     return null                      // render children
    if (section === 'orders')     return <OrdersPanel role={role} />
    if (section === 'messages')   return <MessagesPanel role={role} />
    if (section === 'attorneys')  return <FindAttorney />
    if (section === 'inquiries')  return <MyInquiries />
    if (section === 'queue')      return <MyInquiries />           // attorney inquiry queue fallback
    if (section === 'mine')       return <MyInquiries />
    return null // unknown view → fall through to children
  }, [section, role])

  const country = (searchParams?.get('country') as 'all' | 'us' | 'uk' | 'ca') ?? 'all'

  return (
    <div className="cw-market" style={{ minHeight: '100vh', background: T.paper, fontFamily: F.ui }}>
      {/* Top nav — always visible once role is known */}
      {roleLoaded && (
        <TopNav role={role} activeView={section} onNav={handleNav} country={country} />
      )}

      {/* Sub-nav — category bar, visible on browse for all users */}
      {roleLoaded && section === 'browse' && (
        <CategoryBar country={country} />
      )}

      {/* Section content OR marketplace pages */}
      {sectionContent ?? children}
    </div>
  )
}
