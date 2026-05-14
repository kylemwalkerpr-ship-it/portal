'use client'

import React from 'react'
import Link from 'next/link'
import SellerGigCard from './SellerGigCard'

interface GigMetrics {
  impressions: number
  clicks: number
  order_count: number
  avg_rating: number
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div style={{ color: '#6B7280', fontSize: '14px' }}>Loading your gigs...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(220,38,38,0.22)',
          borderRadius: '12px',
          padding: '20px',
        }}
      >
        <div style={{ color: '#DC2626', fontWeight: 800, marginBottom: '8px' }}>Could not load gigs</div>
        <div style={{ color: '#6B7280', fontSize: '14px', marginBottom: '14px' }}>{error}</div>
        <button
          type="button"
          onClick={load}
          style={{
            padding: '8px 18px', borderRadius: '999px', fontSize: '13px',
            fontWeight: 700, background: '#F4F2EE', border: '1px solid rgba(0,0,0,0.14)',
            color: '#1F2937', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      {/* Limit banner */}
      {atLimit && (
        <div
          style={{
            background: 'rgba(217,119,6,0.10)',
            border: '1px solid rgba(217,119,6,0.30)',
            borderRadius: '10px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span style={{ fontWeight: 800, color: '#D97706', fontSize: '13px' }}>
            5-gig limit reached.
          </span>
          <span style={{ color: '#6B7280', fontSize: '13px' }}>
            Archive or delete an existing gig to create a new one.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {ALL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '6px 14px',
                borderRadius: '999px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${activeTab === tab ? '#3C3B6E' : 'rgba(0,0,0,0.14)'}`,
                background: activeTab === tab ? 'rgba(60,59,110,0.10)' : '#FFFFFF',
                color: activeTab === tab ? '#3C3B6E' : '#6B7280',
              }}
            >
              {tab}
              {tab !== 'All' && (
                <span style={{ marginLeft: '5px', opacity: 0.7 }}>
                  ({gigs.filter((g) => g.status === tab.toLowerCase()).length})
                </span>
              )}
              {tab === 'All' && (
                <span style={{ marginLeft: '5px', opacity: 0.7 }}>({gigs.length})</span>
              )}
            </button>
          ))}
        </div>

        <Link
          href="/dashboard/gigs/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '8px 18px',
            borderRadius: '999px',
            fontSize: '13px',
            fontWeight: 700,
            background: atLimit ? '#F4F2EE' : '#1F2937',
            color: atLimit ? '#9CA3AF' : '#FFFFFF',
            textDecoration: 'none',
            pointerEvents: atLimit ? 'none' : 'auto',
            opacity: atLimit ? 0.6 : 1,
          }}
          aria-disabled={atLimit}
          tabIndex={atLimit ? -1 : 0}
        >
          + Create New Gig
        </Link>
      </div>

      {/* Notice */}
      {notice && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            background: notice.includes('failed') || notice.includes('Failed')
              ? 'rgba(220,38,38,0.08)' : 'rgba(5,150,105,0.08)',
            color: notice.includes('failed') || notice.includes('Failed') ? '#DC2626' : '#059669',
            border: notice.includes('failed') || notice.includes('Failed')
              ? '1px solid rgba(220,38,38,0.22)' : '1px solid rgba(5,150,105,0.22)',
          }}
        >
          {notice}
        </div>
      )}

      {/* Gig list */}
      {filteredGigs.length === 0 ? (
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: '6px', color: '#1F2937' }}>
            No {activeTab !== 'All' ? activeTab.toLowerCase() + ' ' : ''}gigs yet.
          </div>
          <div style={{ color: '#6B7280', fontSize: '14px', lineHeight: 1.6 }}>
            {activeTab === 'All'
              ? "Create a draft, add pricing tiers, then publish to the marketplace."
              : `You have no gigs with "${activeTab.toLowerCase()}" status.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
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
