'use client'

// @ts-nocheck
import React from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LoadingState, ErrorState, EmptyState } from '../design/shared'
import { T, F } from './tokens'
import ChatSidePane from './ChatSidePane'
import {
  SellerProfileHeader,
  SellerStats,
  SellerAbout,
  SellerGigs,
  SellerReviews,
  type SellerProfile,
  type SellerGig,
} from './SellerProfileComponents'

export function SellerProfilePage({
  sellerId,
  initialSeller = null,
}: {
  sellerId: string
  initialSeller?: Pick<SellerProfile, 'id' | 'full_name'> | null
}) {
  const [seller, setSeller] = React.useState<SellerProfile | null>(initialSeller as SellerProfile | null)
  const [gigs, setGigs] = React.useState<SellerGig[]>([])
  const [reviews, setReviews] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(!initialSeller)
  const [error, setError] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<'about' | 'gigs' | 'reviews'>('about')
  const [chatOpen, setChatOpen] = React.useState(false)

  const searchParams = useSearchParams()
  const tab = searchParams?.get('tab') as 'about' | 'gigs' | 'reviews' | null

  React.useEffect(() => {
    if (tab && ['about', 'gigs', 'reviews'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [tab])

  React.useEffect(() => {
    async function loadSellerData() {
      setLoading(!initialSeller)
      setError('')

      try {
        // Load seller profile (unwrap {data, error} envelope)
        const profileRes = await fetch(`/api/sellers/${sellerId}`, { credentials: 'same-origin' })
        const profileBody = await profileRes.json().catch(() => null)
        if (!profileRes.ok) {
          const msg = profileBody?.error?.message || (typeof profileBody?.error === 'string' ? profileBody.error : null) || 'Failed to load seller profile'
          throw new Error(msg)
        }
        const profilePayload = profileBody?.data ?? profileBody ?? {}
        setSeller(profilePayload.seller || null)

        // Load seller gigs
        const gigsRes = await fetch(`/api/sellers/${sellerId}/gigs`, { credentials: 'same-origin' })
        if (gigsRes.ok) {
          const gBody = await gigsRes.json().catch(() => null)
          const gPayload = gBody?.data ?? gBody ?? {}
          setGigs(gPayload.gigs || [])
        }

        // Load seller reviews — endpoint is optional and may not exist yet
        try {
          const reviewsRes = await fetch(`/api/sellers/${sellerId}/reviews`, { credentials: 'same-origin' })
          if (reviewsRes.ok) {
            const rBody = await reviewsRes.json().catch(() => null)
            const rPayload = rBody?.data ?? rBody ?? {}
            setReviews(rPayload.reviews || [])
          }
        } catch { /* reviews route may not exist yet — non-blocking */ }
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
        <Link href="/" style={breadcrumbLink}>Marketplace</Link>
        <span style={breadcrumbSeparator}>/</span>
        <span style={breadcrumbCurrent}>{seller.full_name}</span>
      </div>

      {/* Header */}
      <SellerProfileHeader seller={seller} onContact={() => setChatOpen(true)} />

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

      {/* Side-pane chat — opens from "Chat now" without leaving the profile.
          counterpartProfileId routes through the unified messages path, which
          works for attorneys AND consultants — passing seller.id as an
          attorney id 404s ("Attorney not found") for consultant sellers. */}
      <ChatSidePane
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        counterpartProfileId={seller.profile_id || seller.id}
        attorneyName={seller.full_name}
        attorneyAvatar={seller.headshot_url}
      />
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageShell = {
  minHeight: '100vh',
  background: T.paper,
  color: T.ink,
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
  color: T.inkMid,
  textDecoration: 'none',
  transition: 'color 150ms',
}

const breadcrumbSeparator = {
  color: T.inkSoft,
}

const breadcrumbCurrent = {
  color: T.ink,
  fontWeight: 500,
}

const tabsContainer = {
  display: 'flex',
  gap: '4px',
  marginBottom: '24px',
  borderBottom: `1px solid ${T.rule}`,
}

const tabStyle = {
  background: 'none',
  border: 'none',
  padding: '12px 20px',
  fontSize: '14px',
  fontWeight: 500,
  color: T.inkMid,
  cursor: 'pointer',
  borderBottom: '2px solid transparent',
  transition: 'color 150ms, border-color 150ms',
}

const activeTabStyle = {
  ...tabStyle,
  color: T.ink,
  borderBottomColor: T.indigo,
}

const tabContent = {
  minHeight: '400px',
}
