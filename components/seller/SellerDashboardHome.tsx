'use client'

import React from 'react'
import Link from 'next/link'
import DashboardGuide from '@/components/design/DashboardGuide'

interface GigApiResponse {
  gigs: Array<{ status: string; metrics?: { avg_rating: number } | null }>
  count: number; limit: number
}
interface SellerLevelResponse { level?: string }

// Dynamic limit — resolved from /api/gigs response (varies by seller level)
const FALLBACK_LIMIT = 5
const serif = "'Cormorant Garamond', 'Garamond', Georgia, 'Times New Roman', serif"
const sans  = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif"

async function safeJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  new_seller:     { label: 'New Provider',   color: '#5C6070', bg: '#F2EFE9', border: '#DDD8CE' },
  level_1:        { label: 'Level 1',        color: '#9A7B3B', bg: '#F5EDD6', border: 'rgba(154,123,59,0.30)' },
  level_2:        { label: 'Level 2',        color: '#9A7B3B', bg: '#F5EDD6', border: 'rgba(154,123,59,0.30)' },
  top_attorney:   { label: 'Top Attorney',   color: '#1B2D4F', bg: '#EAF0F7', border: 'rgba(27,45,79,0.30)' },
  top_consultant: { label: 'Top Consultant', color: '#1B2D4F', bg: '#EAF0F7', border: 'rgba(27,45,79,0.30)' },
}

function LevelBadge({ level }: { level: string }) {
  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.new_seller
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
      {cfg.label}
    </span>
  )
}

function StatCard({ icon, label, value, sub, accent }: { icon: string; label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #DDD8CE', borderTop: `3px solid ${accent ?? '#1B2D4F'}`, borderRadius: '8px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(27,45,79,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: '#9097A8' }}>{label}</span>
        <span style={{ fontSize: '18px', opacity: 0.35 }}>{icon}</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: '28px', color: '#1B2D4F', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ color: '#9097A8', fontSize: '12px', marginTop: '7px', lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

function SkeletonStat() {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #DDD8CE', borderTop: '3px solid #F2EFE9', borderRadius: '8px', padding: '20px 22px' }}>
      <div style={{ height: '11px', width: '60%', background: '#F2EFE9', borderRadius: '3px', marginBottom: '14px' }} />
      <div style={{ height: '28px', width: '40%', background: '#F7F5F0', borderRadius: '4px', marginBottom: '8px' }} />
      <div style={{ height: '12px', width: '70%', background: '#F7F5F0', borderRadius: '3px' }} />
    </div>
  )
}

export default function SellerDashboardHome() {
  const [gigCount, setGigCount]   = React.useState(0)
  const [gigLimit, setGigLimit]   = React.useState(FALLBACK_LIMIT)
  const [activeGigs, setActiveGigs] = React.useState(0)
  const [avgRating, setAvgRating] = React.useState<number | null>(null)
  const [sellerLevel, setSellerLevel] = React.useState('new_seller')
  const [loading, setLoading]     = React.useState(true)
  const [activeOrders] = React.useState<number | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      const [gigsData, levelData] = await Promise.all([
        safeJson<GigApiResponse>('/api/gigs'),
        safeJson<SellerLevelResponse>('/api/seller/level'),
      ])
      if (cancelled) return
      if (gigsData) {
        const gigs = gigsData.gigs ?? []
        setGigCount(gigsData.count ?? gigs.length)
        if (typeof gigsData.limit === 'number' && gigsData.limit > 0) setGigLimit(gigsData.limit)
        setActiveGigs(gigs.filter(g => g.status === 'active').length)
        const ratings = gigs.map(g => g.metrics?.avg_rating).filter((r): r is number => typeof r === 'number' && r > 0)
        if (ratings.length > 0) setAvgRating(ratings.reduce((a, b) => a + b, 0) / ratings.length)
      }
      if (levelData?.level) setSellerLevel(levelData.level)
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [])

  const usagePct  = (gigCount / gigLimit) * 100

  return (
    <div style={{ display: 'grid', gap: '24px', fontFamily: sans }}>

      {/* Hero card */}
      <div style={{ background: '#1B2D4F', borderRadius: '10px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' as const, boxShadow: '0 4px 16px rgba(27,45,79,0.20)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: '-20px', top: '-20px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(196,164,90,0.05)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h2 style={{ fontFamily: serif, fontWeight: 600, fontSize: '22px', color: '#FFFFFF', margin: 0, letterSpacing: '-0.01em' }}>Provider Overview</h2>
            {!loading && <LevelBadge level={sellerLevel} />}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.50)', fontSize: '13px', margin: 0, lineHeight: 1.55 }}>
            Manage your services, track performance, and grow your practice.
          </p>
        </div>
        <div style={{ flexShrink: 0, minWidth: '200px', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.50)', fontWeight: 500 }}>Service Slots</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : gigCount} / {gigLimit}</span>
          </div>
          <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: '3px', transition: 'width 0.5s ease', width: loading ? '0%' : `${Math.min(usagePct, 100)}%`, background: usagePct >= 100 ? '#E05252' : 'linear-gradient(90deg, #9A7B3B, #C4A45A)' }} />
          </div>
          {usagePct >= 80 && !loading && (
            <div style={{ fontSize: '11px', color: usagePct >= 100 ? '#FFAAAA' : '#F5DDA0', marginTop: '5px' }}>
              {usagePct >= 100 ? 'Limit reached — archive to create.' : 'Almost at limit.'}
            </div>
          )}
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {loading ? [1,2,3,4].map(i => <SkeletonStat key={i} />) : (
          <>
            <StatCard icon="⚖" label="Active Services"  value={activeGigs}                                sub="Currently live on marketplace"       accent="#1A6B45" />
            <StatCard icon="📋" label="Active Orders"    value={activeOrders ?? '—'}                      sub={activeOrders === null ? 'Orders sync pending' : 'In progress'} accent="#1B2D4F" />
            <StatCard icon="💷" label="Lifetime Earnings" value="—"                                       sub="Connect payout account to view"      accent="#9A7B3B" />
            <StatCard icon="★" label="Avg. Rating"      value={avgRating ? avgRating.toFixed(1) : '—'}  sub={avgRating ? 'Across all services' : 'No reviews yet'} accent="#3D2B6B" />
          </>
        )}
      </div>

      {/* How-to guide for sellers */}
      <DashboardGuide role="seller" />

      {/* Divider */}
      <div style={{ borderTop: '1px solid #E8E4DC' }} />

      {/* Quick actions */}
      <div>
        <h3 style={{ fontFamily: serif, fontWeight: 600, fontSize: '18px', color: '#1B2D4F', margin: '0 0 14px', letterSpacing: '-0.01em' }}>
          Quick Actions
        </h3>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' as const }}>
          <Link href="/dashboard/gigs/new" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 22px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#1B2D4F', color: '#FFFFFF', textDecoration: 'none', boxShadow: '0 2px 6px rgba(27,45,79,0.22)' }}>
            + Create New Service
          </Link>
          <Link href="/dashboard/gigs" style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#FFFFFF', color: '#1B2D4F', border: '1px solid #C8C2B6', textDecoration: 'none' }}>
            Manage Services
          </Link>
          <Link href="/dashboard/orders" style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#FFFFFF', color: '#1B2D4F', border: '1px solid #C8C2B6', textDecoration: 'none' }}>
            View Orders
          </Link>
          <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#FFFFFF', color: '#9097A8', border: '1px solid #DDD8CE', textDecoration: 'none' }}>
            Full Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
