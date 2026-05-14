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

const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

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
    <div style={{
      background: '#FFFFFF',
      border: '1px solid #DDD8CE',
      borderRadius: '8px',
      padding: '18px 20px',
      boxShadow: '0 1px 3px rgba(27,45,79,0.08), 0 1px 2px rgba(27,45,79,0.04)',
      fontFamily: sans,
    }}>
      <div style={{
        color: '#5C6070',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase' as const,
        letterSpacing: '0.08em',
        marginBottom: '8px',
      }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, fontSize: '28px', color: '#1B2D4F', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      {sub && (
        <div style={{ color: '#9097A8', fontSize: '12px', marginTop: '5px', lineHeight: 1.4 }}>{sub}</div>
      )}
    </div>
  )
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const fillColor = pct >= 100 ? '#8B1A1A' : pct >= 80 ? '#8B5E0A' : '#1B2D4F'
  return (
    <div style={{ marginTop: '10px', fontFamily: sans }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: '#5C6070' }}>Gig slots used</span>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#1A1F2E' }}>
          {value} / {max}
        </span>
      </div>
      <div style={{ height: '5px', borderRadius: '2px', background: '#F2EFE9', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: fillColor,
          borderRadius: '2px',
          transition: 'width 0.4s',
        }} />
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
    <div style={{ display: 'grid', gap: '20px', fontFamily: sans }}>
      {/* Gig usage card */}
      <div style={{
        background: '#FFFFFF',
        border: '1px solid #DDD8CE',
        borderRadius: '8px',
        padding: '18px 22px',
        boxShadow: '0 1px 3px rgba(27,45,79,0.08), 0 1px 2px rgba(27,45,79,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
          <span style={{
            fontFamily: serif,
            fontWeight: 600,
            fontSize: '17px',
            color: '#1B2D4F',
            letterSpacing: '-0.01em',
          }}>
            Gig Usage
          </span>
          <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.05em',
            background: sellerLevel === 'New Seller' ? '#F2EFE9' : '#F5EDD6',
            color: sellerLevel === 'New Seller' ? '#5C6070' : '#9A7B3B',
            border: `1px solid ${sellerLevel === 'New Seller' ? '#DDD8CE' : 'rgba(154,123,59,0.30)'}`,
          }}>
            {loading ? '···' : sellerLevel}
          </span>
        </div>
        {loading ? (
          <div style={{ color: '#9097A8', fontSize: '13px', marginTop: '12px' }}>Loading…</div>
        ) : (
          <ProgressBar value={gigCount} max={GIG_LIMIT} />
        )}
      </div>

      {/* Stat grid — 2×2 mobile, 4-col desktop */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: '12px',
      }}>
        <StatCard
          label="Active Gigs"
          value={loading ? '—' : activeGigs}
          sub="Currently live on marketplace"
        />
        <StatCard
          label="Active Orders"
          value={activeOrders === null ? '—' : activeOrders}
          // NOTE: Requires GET /api/orders?seller=true&status=active (not yet available)
          sub={activeOrders === null ? 'Orders endpoint pending' : 'In progress'}
        />
        <StatCard
          label="Lifetime Earnings"
          value="$0"
          sub="Connect payout to view earnings"
        />
        <StatCard
          label="Avg. Rating"
          value={loading ? '—' : avgRating !== null ? avgRating.toFixed(1) : '—'}
          sub={avgRating !== null ? 'Across all gigs' : 'No ratings yet'}
        />
      </div>

      {/* CTA buttons */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
        <Link
          href="/dashboard/gigs/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 20px', borderRadius: '6px',
            fontSize: '13px', fontWeight: 600,
            background: '#FFFFFF', color: '#1B2D4F',
            border: '1px solid #1B2D4F',
            textDecoration: 'none', fontFamily: sans,
          }}
        >
          <span style={{ fontSize: '15px' }}>⊕</span> Create Service
        </Link>

        <Link
          href="/dashboard/orders"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 20px', borderRadius: '6px',
            fontSize: '13px', fontWeight: 600,
            background: '#FFFFFF', color: '#1B2D4F',
            border: '1px solid #1B2D4F',
            textDecoration: 'none', fontFamily: sans,
          }}
        >
          <span style={{ fontSize: '15px' }}>≡</span> View Orders
        </Link>

        <Link
          href="/dashboard/gigs"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '9px 20px', borderRadius: '6px',
            fontSize: '13px', fontWeight: 600,
            background: '#FFFFFF', color: '#1B2D4F',
            border: '1px solid #1B2D4F',
            textDecoration: 'none', fontFamily: sans,
          }}
        >
          <span style={{ fontSize: '15px' }}>◫</span> Manage Gigs
        </Link>
      </div>
    </div>
  )
}
