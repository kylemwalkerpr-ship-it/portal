'use client'

// @ts-nocheck
import React from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { C, LoadingState, ErrorState, EmptyState } from '../design/shared'
import {
  SellerProfileHeader,
  SellerStats,
  SellerAbout,
  SellerGigs,
  SellerReviews,
  type SellerProfile,
  type SellerGig,
} from './SellerProfileComponents'

export function SellerProfilePage({ sellerId }: { sellerId: string }) {
  const [seller, setSeller] = React.useState<SellerProfile | null>(null)
  const [gigs, setGigs] = React.useState<SellerGig[]>([])
  const [reviews, setReviews] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<'about' | 'gigs' | 'reviews'>('about')

  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') as 'about' | 'gigs' | 'reviews' | null

  React.useEffect(() => {
    if (tab && ['about', 'gigs', 'reviews'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [tab])

  React.useEffect(() => {
    async function loadSellerData() {
      setLoading(true)
      setError('')

      try {
        // Load seller profile
        const profileRes = await fetch(`/api/sellers/${sellerId}`, { credentials: 'same-origin' })
        if (!profileRes.ok) {
          const err = await profileRes.json().catch(() => null)
          throw new Error(err?.error || 'Failed to load seller profile')
        }
        const profileData = await profileRes.json()
        setSeller(profileData.seller)

        // Load seller gigs
        const gigsRes = await fetch(`/api/sellers/${sellerId}/gigs`, { credentials: 'same-origin' })
        if (gigsRes.ok) {
          const gigsData = await gigsRes.json()
          setGigs(gigsData.gigs || [])
        }

        // Load seller reviews
        const reviewsRes = await fetch(`/api/sellers/${sellerId}/reviews`, { credentials: 'same-origin' })
        if (reviewsRes.ok) {
          const reviewsData = await reviewsRes.json()
          setReviews(reviewsData.reviews || [])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load seller data')
      } finally {
        setLoading(false)
      }
    }

    loadSellerData()
  }, [sellerId])

  if (loading) {
    return (
      <div style={pageShell}>
        <LoadingState message="Loading seller profile..." />
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageShell}>
        <ErrorState message={error} />
      </div>
    )
  }

  if (!seller) {
    return (
      <div style={pageShell}>
        <EmptyState message="Seller not found" submessage="The seller you're looking for doesn't exist or has been removed." />
      </div>
    )
  }

  return (
    <div style={pageShell}>
      {/* Breadcrumb */}
      <div style={breadcrumb}>
        <Link href="/marketplace" style={breadcrumbLink}>Marketplace</Link>
        <span style={breadcrumbSeparator}>/</span>
        <span style={breadcrumbCurrent}>{seller.full_name}</span>
      </div>

      {/* Header */}
      <SellerProfileHeader seller={seller} />

      {/* Stats */}
      <SellerStats seller={seller} />

      {/* Tabs */}
      <div style={tabsContainer}>
        <button
          type="button"
          onClick={() => setActiveTab('about')}
          style={activeTab === 'about' ? activeTabStyle : tabStyle}
        >
          About
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('gigs')}
          style={activeTab === 'gigs' ? activeTabStyle : tabStyle}
        >
          Services ({gigs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          style={activeTab === 'reviews' ? activeTabStyle : tabStyle}
        >
          Reviews ({reviews.length})
        </button>
      </div>

      {/* Tab Content */}
      <div style={tabContent}>
        {activeTab === 'about' && <SellerAbout seller={seller} />}
        {activeTab === 'gigs' && <SellerGigs gigs={gigs} />}
        {activeTab === 'reviews' && <SellerReviews reviews={reviews} />}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageShell = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  padding: '24px 32px',
  maxWidth: '1200px',
  margin: '0 auto',
}

const breadcrumb = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '20px',
  fontSize: '13px',
}

const breadcrumbLink = {
  color: C.textMuted,
  textDecoration: 'none',
  transition: 'color 150ms',
}

const breadcrumbSeparator = {
  color: C.textDim,
}

const breadcrumbCurrent = {
  color: C.text,
  fontWeight: 500,
}

const tabsContainer = {
  display: 'flex',
  gap: '4px',
  marginBottom: '24px',
  borderBottom: `1px solid ${C.border}`,
}

const tabStyle = {
  background: 'none',
  border: 'none',
  padding: '12px 20px',
  fontSize: '14px',
  fontWeight: 500,
  color: C.textMuted,
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  transition: 'color 150ms, border-color 150ms',
}

const activeTabStyle = {
  ...tabStyle,
  color: C.text,
  borderBottomColor: C.cyan,
}

const tabContent = {
  minHeight: '400px',
}
