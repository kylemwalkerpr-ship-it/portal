'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { GlobalLanguageBar } from '@/components/GlobalLanguageBar'

// Lazy-load the heavier section panels to keep initial bundle small
const FindAttorney  = dynamic(() => import('@/components/design/find-attorney'),  { ssr: false })
const MyInquiries   = dynamic(() => import('@/components/design/my-inquiries'),   { ssr: false })

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
    { icon: '🏬', label: 'Browse', view: 'browse' },
    { icon: '⚖️', label: 'Find Attorney', view: 'attorneys' },
  ]
}

// ─── design tokens ────────────────────────────────────────────────────────────

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans  = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

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
      .then(r => r.json())
      .then(data => {
        setOrders(data?.orders ?? data?.data?.orders ?? [])
      })
      .catch(() => setError('Could not load orders.'))
      .finally(() => setLoading(false))
  }, [role])

  const statusColor: Record<string, string> = {
    active:     '#1A6B45', in_progress: '#1A6B45', review: '#3D2B6B',
    completed:  '#1B2D4F', new:         '#8B5E0A', pending: '#8B5E0A',
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
        <div key={o.id} style={{ background: '#FFFFFF', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', boxShadow: '0 1px 3px rgba(27,45,79,0.05)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '16px', color: '#1B2D4F', lineHeight: 1.2, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o.service || o.title || 'Service order'}
            </div>
            <div style={{ fontSize: '12px', color: '#9097A8', lineHeight: 1.4 }}>
              {o.consultant || o.provider || ''}{o.created_at ? ` · ${new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
            </div>
          </div>
          <span style={{ flexShrink: 0, display: 'inline-block', padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' as const, background: `${statusColor[o.status] ?? '#9097A8'}15`, color: statusColor[o.status] ?? '#9097A8', border: `1px solid ${statusColor[o.status] ?? '#9097A8'}30` }}>
            {o.status?.replace(/_/g, ' ') ?? 'Unknown'}
          </span>
        </div>
      ))}
    </PanelShell>
  )
}

function MessagesPanel({ role }: { role: Role }) {
  const [chats, setChats]     = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError]     = React.useState('')

  React.useEffect(() => {
    const endpoint = role === 'attorney'   ? '/api/attorney/chats'
                   : role === 'client'     ? '/api/client/attorney-chats'
                   : null
    if (!endpoint) { setLoading(false); return }
    fetch(endpoint, { credentials: 'same-origin' })
      .then(r => r.json())
      .then(data => setChats(data?.chats ?? []))
      .catch(() => setError('Could not load messages.'))
      .finally(() => setLoading(false))
  }, [role])

  return (
    <PanelShell title="Messages" icon="💬">
      {loading && <LoadingRows />}
      {error   && <ErrorCard msg={error} />}
      {!loading && !error && chats.length === 0 && (
        <EmptyCard
          icon="💬"
          title="No conversations yet"
          body="Open an attorney profile or gig listing and click 'Message' to start a conversation."
          cta={{ label: 'Browse Marketplace', view: 'browse' }}
        />
      )}
      {!loading && !error && chats.map((c: any) => (
        <div key={c.id} style={{ background: '#FFFFFF', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(27,45,79,0.05)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#F2EFE9', border: '1px solid #DDD8CE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
            {(c.attorney_name || c.client_name || c.name || '?')[0]?.toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '14px', color: '#1B2D4F', marginBottom: '2px' }}>{c.attorney_name || c.client_name || c.name || 'Conversation'}</div>
            <div style={{ fontSize: '12px', color: '#9097A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message || 'No messages yet'}</div>
          </div>
          {c.pending_offers > 0 && (
            <span style={{ flexShrink: 0, background: '#F5EDD6', color: '#7A6030', border: '1px solid rgba(154,123,59,0.30)', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
              {c.pending_offers} offer{c.pending_offers > 1 ? 's' : ''}
            </span>
          )}
        </div>
      ))}
      {!loading && !error && chats.length > 0 && (
        <p style={{ fontSize: '12px', color: '#9097A8', textAlign: 'center', margin: '8px 0 0' }}>
          For full messaging, go to your{' '}
          <Link href="/dashboard?goto=messages" style={{ color: '#1B2D4F', fontWeight: 600, textDecoration: 'none' }}>Dashboard Messages →</Link>
        </p>
      )}
    </PanelShell>
  )
}

// ─── reusable primitives ──────────────────────────────────────────────────────

function PanelShell({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px 64px', fontFamily: sans }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <span style={{ fontSize: '22px' }}>{icon}</span>
        <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '28px', color: '#1B2D4F', margin: 0, letterSpacing: '-0.015em', lineHeight: 1.1 }}>{title}</h2>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '10px' }}>{children}</div>
    </div>
  )
}

function LoadingRows() {
  return (
    <>
      {[1, 2, 3].map(i => (
        <div key={i} style={{ background: '#FFFFFF', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '14px 18px', display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1, height: '16px', background: '#F2EFE9', borderRadius: '3px' }} />
          <div style={{ width: '60px', height: '22px', background: '#F7F5F0', borderRadius: '4px' }} />
        </div>
      ))}
    </>
  )
}

function ErrorCard({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.20)', borderRadius: '8px', padding: '16px 20px', fontSize: '13px', color: '#8B1A1A' }}>{msg}</div>
  )
}

function EmptyCard({ icon, title, body, cta }: { icon: string; title: string; body: string; cta?: { label: string; view: string } }) {
  const router = useRouter()
  return (
    <div style={{ background: '#FFFFFF', border: '1px dashed #C8C2B6', borderRadius: '8px', padding: '40px 24px', textAlign: 'center' as const }}>
      <div style={{ fontSize: '32px', marginBottom: '12px', opacity: 0.4 }}>{icon}</div>
      <div style={{ fontFamily: serif, fontWeight: 600, fontSize: '18px', color: '#1B2D4F', marginBottom: '8px' }}>{title}</div>
      <div style={{ fontSize: '13px', color: '#9097A8', lineHeight: 1.6, marginBottom: cta ? '20px' : 0 }}>{body}</div>
      {cta && (
        <button onClick={() => router.push(`/marketplace`)} style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 22px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#1B2D4F', color: '#FFFFFF', border: 'none', cursor: 'pointer', fontFamily: sans }}>
          {cta.label}
        </button>
      )}
    </div>
  )
}

// ─── top nav bar ─────────────────────────────────────────────────────────────

function TopNav({ role, activeView, onNav }: { role: Role; activeView: Section; onNav: (v: Section) => void }) {
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const links = navLinksForRole(role)

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 200, background: '#1B2D4F', boxShadow: scrolled ? '0 2px 16px rgba(0,0,0,0.26)' : '0 1px 0 rgba(255,255,255,0.06)', transition: 'box-shadow 0.2s', fontFamily: sans }}>
      {/* Gold line */}
      <div style={{ height: '2px', background: 'linear-gradient(90deg, #9A7B3B 0%, #C4A45A 50%, #9A7B3B 100%)' }} />

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 20px', display: 'flex', alignItems: 'stretch' }}>

        {/* Brand — clicking takes the user back to their dashboard */}
        <Link
          href="/dashboard"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px 0 0', marginRight: '2px', borderRight: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none', flexShrink: 0, height: '48px' }}
        >
          <div style={{ textAlign: 'left' as const }}>
            <div style={{ fontFamily: serif, fontSize: '15px', fontWeight: 600, color: '#F7F5F0', letterSpacing: '0.01em', lineHeight: 1.1, whiteSpace: 'nowrap' }}>YouSafe</div>
            <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.38)', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginTop: '1px', whiteSpace: 'nowrap' }}>
              {role === 'client' ? 'Marketplace' : role === 'attorney' ? 'Attorney Portal' : 'Consultant Portal'}
            </div>
          </div>
        </Link>

        {/* Nav tabs — all navigation stays inside the marketplace shell */}
        <nav style={{ display: 'flex', alignItems: 'stretch', flex: 1, overflowX: 'auto' as const, scrollbarWidth: 'none' as const }}>
          {links.map(link => {
            const active = link.view === activeView
            return (
              <button
                key={link.view}
                onClick={() => onNav(link.view as Section)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '0 16px', height: '48px',
                  fontSize: '12.5px', fontWeight: active ? 600 : 400,
                  color: active ? '#FFFFFF' : 'rgba(255,255,255,0.52)',
                  background: active ? 'rgba(255,255,255,0.06)' : 'none',
                  border: 'none',
                  borderBottom: active ? '2px solid #C4A45A' : '2px solid transparent',
                  cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  letterSpacing: active ? '0.01em' : '0',
                  flexShrink: 0,
                  transition: 'color 0.12s, border-color 0.12s, background 0.12s',
                  fontFamily: sans,
                }}
              >
                <span style={{ fontSize: '13px', opacity: active ? 1 : 0.7 }}>{link.icon}</span>
                {link.label}
              </button>
            )
          })}
        </nav>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '12px', borderLeft: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <GlobalLanguageBar />
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

  return (
    <div style={{ minHeight: '100vh', background: '#F7F5F0', fontFamily: sans }}>
      {/* Top nav — always visible once role is known */}
      {roleLoaded && (
        <TopNav role={role} activeView={section} onNav={handleNav} />
      )}

      {/* Section content OR marketplace pages */}
      {sectionContent ?? children}
    </div>
  )
}
