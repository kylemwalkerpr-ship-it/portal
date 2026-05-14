'use client'

import React from 'react'
import Link from 'next/link'
import SellerGigCard from './SellerGigCard'

interface GigMetrics {
  impressions: number
  clicks: number
  saves: number
}

interface Gig {
  id: string
  slug: string
  title: string
  status: string
  category: string | null
  pitch: string
  content_score: number
  metrics: GigMetrics | null
}

interface ApiResponse {
  gigs: Gig[]
  count: number
  limit: number
  byStatus: Record<string, number>
}

const ALL_TABS = ['All', 'Draft', 'Active', 'Suspended', 'Archived', 'Deleted'] as const
type Tab = typeof ALL_TABS[number]

const GIG_LIMIT = 5

const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"

async function requestJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers:
      options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(options.headers as Record<string, string> || {}) }
        : options.headers,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      (payload?.error?.message as string) || (payload?.error as string) || `Request failed (${res.status})`
    throw new Error(message)
  }
  return (payload?.data ?? payload) as unknown
}

export default function SellerGigManager() {
  const [gigs, setGigs] = React.useState<Gig[]>([])
  const [count, setCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<Tab>('All')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = (await requestJson('/api/gigs')) as ApiResponse
      setGigs(data.gigs ?? [])
      setCount(data.count ?? (data.gigs ?? []).length)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load gigs.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const handleStatusChange = async (id: string, status: string) => {
    setNotice('')
    try {
      await requestJson(`/api/gigs/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setNotice(`Gig ${status}.`)
      await load()
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Status update failed.')
    }
  }

  const handlePublish = async (id: string) => {
    setNotice('')
    try {
      await requestJson(`/api/gigs/${id}/publish`, { method: 'POST' })
      setNotice('Gig published.')
      await load()
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Publish failed.')
    }
  }

  const filteredGigs =
    activeTab === 'All'
      ? gigs
      : gigs.filter((g) => g.status === activeTab.toLowerCase())

  const atLimit = count >= GIG_LIMIT
  const isError = (msg: string) => msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error')

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', fontFamily: sans }}>
        <span style={{ color: '#9097A8', fontSize: '14px', letterSpacing: '0.02em' }}>Loading your services…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        background: '#FAEAEA',
        border: '1px solid rgba(139,26,26,0.20)',
        borderRadius: '8px',
        padding: '24px',
        fontFamily: sans,
      }}>
        <div style={{ color: '#8B1A1A', fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}>Unable to load services</div>
        <div style={{ color: '#5C6070', fontSize: '13px', marginBottom: '16px' }}>{error}</div>
        <button
          type="button"
          onClick={load}
          style={{
            padding: '7px 18px',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 600,
            background: '#1B2D4F',
            color: '#FFFFFF',
            border: 'none',
            cursor: 'pointer',
            fontFamily: sans,
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px', fontFamily: sans }}>
      {/* Limit banner */}
      {atLimit && (
        <div style={{
          background: '#FEF5E4',
          border: '1px solid rgba(139,94,10,0.22)',
          borderRadius: '8px',
          padding: '11px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontWeight: 700, color: '#8B5E0A', fontSize: '13px' }}>Service limit reached.</span>
          <span style={{ color: '#5C6070', fontSize: '13px' }}>Archive or delete a service to create a new one.</span>
        </div>
      )}

      {/* Toolbar: tabs + create button */}
      <div style={{
        background: '#F2EFE9',
        border: '1px solid #DDD8CE',
        borderRadius: '8px',
        padding: '0 16px',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        {/* Underline tabs */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, overflowX: 'auto' }}>
          {ALL_TABS.map((tab) => {
            const isActive = activeTab === tab
            const tabCount = tab === 'All'
              ? gigs.length
              : gigs.filter((g) => g.status === tab.toLowerCase()).length
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '13px 14px',
                  fontSize: '13px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #1B2D4F' : '2px solid transparent',
                  background: 'transparent',
                  color: isActive ? '#1B2D4F' : '#5C6070',
                  whiteSpace: 'nowrap' as const,
                  transition: 'color 0.12s, border-color 0.12s',
                  fontFamily: sans,
                }}
              >
                {tab}
                <span style={{ marginLeft: '5px', opacity: 0.6, fontSize: '12px' }}>({tabCount})</span>
              </button>
            )
          })}
        </div>

        {/* Right side: count + create */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', color: '#9097A8', whiteSpace: 'nowrap' as const }}>
            {count} / {GIG_LIMIT} services
          </span>
          <Link
            href="/dashboard/gigs/new"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '7px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              background: atLimit ? '#F2EFE9' : '#1B2D4F',
              color: atLimit ? '#9097A8' : '#FFFFFF',
              textDecoration: 'none',
              pointerEvents: atLimit ? 'none' : 'auto',
              opacity: atLimit ? 0.55 : 1,
              border: atLimit ? '1px solid #DDD8CE' : 'none',
              fontFamily: sans,
            }}
            aria-disabled={atLimit}
            tabIndex={atLimit ? -1 : 0}
          >
            <span style={{ fontSize: '14px' }}>⊕</span> New Service
          </Link>
        </div>
      </div>

      {/* Notice */}
      {notice && (
        <div style={{
          padding: '10px 16px',
          borderRadius: '6px',
          fontSize: '13px',
          fontWeight: 600,
          background: isError(notice) ? '#FAEAEA' : '#EAF5EE',
          color: isError(notice) ? '#8B1A1A' : '#1A6B45',
          border: `1px solid ${isError(notice) ? 'rgba(139,26,26,0.20)' : 'rgba(26,107,69,0.20)'}`,
          fontFamily: sans,
        }}>
          {notice}
        </div>
      )}

      {/* Gig list */}
      {filteredGigs.length === 0 ? (
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #DDD8CE',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(27,45,79,0.08), 0 1px 2px rgba(27,45,79,0.04)',
          padding: '48px 32px',
          textAlign: 'center' as const,
        }}>
          {/* Simple document icon */}
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 16px', display: 'block' }}>
            <rect x="8" y="4" width="20" height="26" rx="2" stroke="#C8C2B6" strokeWidth="1.5" fill="none"/>
            <rect x="22" y="4" width="6" height="6" rx="0" stroke="#C8C2B6" strokeWidth="1.5" fill="#F2EFE9"/>
            <path d="M22 4 L28 10" stroke="#C8C2B6" strokeWidth="1.5"/>
            <line x1="12" y1="16" x2="24" y2="16" stroke="#C8C2B6" strokeWidth="1.2"/>
            <line x1="12" y1="20" x2="24" y2="20" stroke="#C8C2B6" strokeWidth="1.2"/>
            <line x1="12" y1="24" x2="20" y2="24" stroke="#C8C2B6" strokeWidth="1.2"/>
          </svg>
          <div style={{
            fontFamily: serif,
            fontWeight: 600,
            fontSize: '20px',
            color: '#1B2D4F',
            letterSpacing: '-0.01em',
            marginBottom: '8px',
          }}>
            {activeTab !== 'All' ? `No ${activeTab.toLowerCase()} services` : 'No services yet'}
          </div>
          <div style={{ color: '#9097A8', fontSize: '13px', lineHeight: 1.65, marginBottom: '20px' }}>
            {activeTab === 'All'
              ? 'Create a draft service, configure pricing tiers, then publish to the marketplace.'
              : `You have no services with "${activeTab.toLowerCase()}" status.`}
          </div>
          {activeTab === 'All' && !atLimit && (
            <Link
              href="/dashboard/gigs/new"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '9px 22px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                background: '#1B2D4F',
                color: '#FFFFFF',
                textDecoration: 'none',
                fontFamily: sans,
              }}
            >
              ⊕ Create your first service
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '10px' }}>
          {filteredGigs.map((gig) => (
            <SellerGigCard
              key={gig.id}
              gig={gig}
              onStatusChange={handleStatusChange}
              onPublish={handlePublish}
            />
          ))}
        </div>
      )}
    </div>
  )
}
