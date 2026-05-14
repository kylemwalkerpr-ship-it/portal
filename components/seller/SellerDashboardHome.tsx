'use client'

import React from 'react'
import Link from 'next/link'

interface GigApiResponse {
  gigs: Array<{ status: string; metrics?: { avg_rating: number } | null }>
  count: number
  limit: number
}

interface SellerLevelResponse {
  level?: string
}

const GIG_LIMIT = 5

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string
  value: React.ReactNode
  sub?: string
}) {
  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: '12px',
        padding: '16px 18px',
      }}
    >
      <div style={{ color: '#6B7280', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
        {label}
      </div>
      <div style={{ fontWeight: 900, fontSize: '22px', color: '#1F2937', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const color = pct >= 100 ? '#DC2626' : pct >= 80 ? '#D97706' : '#3C3B6E'
  return (
    <div style={{ marginTop: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '13px', color: '#6B7280' }}>Gig slots used</span>
        <span style={{ fontSize: '13px', fontWeight: 800, color: '#1F2937' }}>
          {value} / {max}
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '999px', background: '#EAE7E0', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: '999px',
            transition: 'width 0.4s',
          }}
        />
      </div>
    </div>
  )
}

export default function SellerDashboardHome() {
  const [gigCount, setGigCount] = React.useState(0)
  const [activeGigs, setActiveGigs] = React.useState(0)
  const [avgRating, setAvgRating] = React.useState<number | null>(null)
  // Active orders: endpoint GET /api/orders?seller=true&status=active not yet implemented
  const [activeOrders] = React.useState<number | null>(null)
  const [sellerLevel, setSellerLevel] = React.useState('New Seller')
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      const [gigsData, levelData] = await Promise.all([
        safeJson<GigApiResponse>('/api/gigs'),
        safeJson<SellerLevelResponse>('/api/seller/level'),
        // NOTE: GET /api/orders?seller=true&status=active not yet implemented.
        // When available, replace the activeOrders placeholder below.
      ])

      if (cancelled) return

      if (gigsData) {
        const gigs = gigsData.gigs ?? []
        setGigCount(gigsData.count ?? gigs.length)
        setActiveGigs(gigs.filter((g) => g.status === 'active').length)

        const ratings = gigs
          .map((g) => g.metrics?.avg_rating)
          .filter((r): r is number => typeof r === 'number' && r > 0)
        if (ratings.length > 0) {
          setAvgRating(ratings.reduce((a, b) => a + b, 0) / ratings.length)
        }
      }

      if (levelData?.level) {
        setSellerLevel(levelData.level)
      }

      setLoading(false)
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* Gig usage */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: '12px',
          padding: '18px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 800, fontSize: '15px', color: '#1F2937' }}>Gig usage</span>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: '999px',
              fontSize: '11px',
              fontWeight: 800,
              background: sellerLevel === 'New Seller' ? '#F4F2EE' : 'rgba(60,59,110,0.10)',
              color: sellerLevel === 'New Seller' ? '#6B7280' : '#3C3B6E',
              border: sellerLevel === 'New Seller' ? '1px solid rgba(0,0,0,0.12)' : '1px solid rgba(60,59,110,0.25)',
            }}
          >
            {loading ? '...' : sellerLevel}
          </span>
        </div>
        {loading ? (
          <div style={{ color: '#9CA3AF', fontSize: '13px', marginTop: '12px' }}>Loading...</div>
        ) : (
          <ProgressBar value={gigCount} max={GIG_LIMIT} />
        )}
      </div>

      {/* Stat grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        <StatCard
          label="Active gigs"
          value={loading ? '—' : activeGigs}
          sub="Currently live on marketplace"
        />

        <StatCard
          label="Active orders"
          value={activeOrders === null ? '—' : activeOrders}
          // NOTE: Requires GET /api/orders?seller=true&status=active (not yet available)
          sub={activeOrders === null ? 'Orders endpoint pending' : 'In progress'}
        />

        <StatCard
          label="Lifetime earnings"
          value="$0"
          sub="Connect payout to see earnings"
        />

        <StatCard
          label="Avg. rating"
          value={loading ? '—' : avgRating !== null ? avgRating.toFixed(1) : 'No ratings'}
          sub="Across all gigs"
        />
      </div>

      {/* CTA buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <Link
          href="/dashboard/gigs/new"
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '10px 22px', borderRadius: '999px',
            fontSize: '14px', fontWeight: 700,
            background: '#1F2937', color: '#FFFFFF',
            textDecoration: 'none',
          }}
        >
          + Create New Gig
        </Link>

        <Link
          href="/dashboard/gigs"
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '10px 22px', borderRadius: '999px',
            fontSize: '14px', fontWeight: 700,
            background: '#FFFFFF', color: '#1F2937',
            border: '1px solid rgba(0,0,0,0.14)',
            textDecoration: 'none',
          }}
        >
          View Gigs
        </Link>

        <Link
          href="/dashboard/orders"
          style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '10px 22px', borderRadius: '999px',
            fontSize: '14px', fontWeight: 700,
            background: '#FFFFFF', color: '#1F2937',
            border: '1px solid rgba(0,0,0,0.14)',
            textDecoration: 'none',
          }}
        >
          View Orders
        </Link>
      </div>
    </div>
  )
}
