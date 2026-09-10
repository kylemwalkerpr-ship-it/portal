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
  type SellerProfile,
  type SellerGig,
} from './SellerProfileComponents'
import { ReviewsSection } from './ReviewComponents'
import { signalSsrReady } from './SsrHydrateGate'
import { providerDisplayName } from '@/lib/providerDisplayName'

export function SellerProfilePage({
  sellerId,
  initialSeller = null,
}: {
  sellerId: string
  initialSeller?: SellerProfile | null
}) {
  const [seller, setSeller] = React.useState<SellerProfile | null>(initialSeller)
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

  // The server already resolved enough seller data to render the real profile.
  // Collapse the crawler-only SSR duplicate as soon as this island hydrates;
  // enrichment requests below are not allowed to hold the visible page hostage.
  React.useEffect(() => {
    if (initialSeller) signalSsrReady('yousafe:provider-ssr-ready')
  }, [initialSeller])

  React.useEffect(() => {
    let cancelled = false

    async function loadSellerData() {
      if (!initialSeller) setLoading(true)
      setError('')

      // These endpoints are independent. The previous waterfall waited for
      // profile → gigs → reviews, keeping the raw SSR article visible for a few
      // seconds on mobile. Fetch all three at once and progressively enrich the
      // server-seeded interactive view.
      const [profileResult, gigsResult, reviewsResult] = await Promise.allSettled([
        fetch(`/api/sellers/${sellerId}`, { credentials: 'same-origin' }),
        fetch(`/api/sellers/${sellerId}/gigs`, { credentials: 'same-origin' }),
        fetch(`/api/sellers/${sellerId}/reviews`, { credentials: 'same-origin' }),
      ])

      if (cancelled) return

      try {
        if (profileResult.status === 'fulfilled') {
          const profileRes = profileResult.value
          const profileBody = await profileRes.json().catch(() => null)
          if (!profileRes.ok) {
            const msg = profileBody?.error?.message || (typeof profileBody?.error === 'string' ? profileBody.error : null) || 'Failed to load seller profile'
            if (!initialSeller) throw new Error(msg)
          } else {
            const profilePayload = profileBody?.data ?? profileBody ?? {}
            if (!cancelled && profilePayload.seller) setSeller(profilePayload.seller)
          }
        } else if (!initialSeller) {
          throw profileResult.reason instanceof Error
            ? profileResult.reason
            : new Error('Failed to load seller profile')
        }

        if (gigsResult.status === 'fulfilled' && gigsResult.value.ok) {
          const gBody = await gigsResult.value.json().catch(() => null)
          const gPayload = gBody?.data ?? gBody ?? {}
          if (!cancelled) setGigs(gPayload.gigs || [])
        }

        // ReviewsSection does its own seller-scoped fetch when opened; this
        // lightweight request only supplies the tab count and must never block.
        if (reviewsResult.status === 'fulfilled' && reviewsResult.value.ok) {
          const rBody = await reviewsResult.value.json().catch(() => null)
          const rPayload = rBody?.data ?? rBody ?? {}
          if (!cancelled) setReviews(rPayload.reviews || [])
        }

        if (!initialSeller) signalSsrReady('yousafe:provider-ssr-ready')
      } catch (e) {
        if (!initialSeller && !cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load seller data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSellerData()
    return () => { cancelled = true }
  }, [sellerId, initialSeller])

  if (loading) {
    return (
      <div className="ys-seller-profile-page" style={pageShell}>
        <LoadingState message="Loading seller profile..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="ys-seller-profile-page" style={pageShell}>
        <ErrorState message={error} />
      </div>
    )
  }

  if (!seller) {
    return (
      <div className="ys-seller-profile-page" style={pageShell}>
        <EmptyState message="Seller not found" submessage="The seller you're looking for doesn't exist or has been removed." />
      </div>
    )
  }

  const displayName = providerDisplayName({ full_name: seller.full_name }, 'Provider')

  return (
    <div className="ys-seller-profile-page" style={pageShell}>
      <div className="ys-seller-profile-breadcrumb" style={breadcrumb}>
        <Link href="/marketplace" style={breadcrumbLink}>Marketplace</Link>
        <span style={breadcrumbSeparator}>/</span>
        <span style={breadcrumbCurrent}>{displayName}</span>
      </div>

      <SellerProfileHeader seller={seller} onContact={() => setChatOpen(true)} />
      <SellerStats seller={seller} />

      <div className="ys-seller-profile-tabs" style={tabsContainer}>
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
          Services ({gigs.length || seller.total_gigs || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reviews')}
          style={activeTab === 'reviews' ? activeTabStyle : tabStyle}
        >
          Reviews ({reviews.length || seller.rating_count || 0})
        </button>
      </div>

      <div className="ys-seller-profile-tab-content" style={{ ...tabContent, background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: '14px', padding: '24px' }}>
        {activeTab === 'about' && <SellerAbout seller={seller} />}
        {activeTab === 'gigs' && <SellerGigs gigs={gigs} />}
        {activeTab === 'reviews' && (
          <ReviewsSection
            sellerId={seller.id}
            sellerType={seller.role === 'consultant' ? 'consultant' : 'attorney'}
          />
        )}
      </div>

      <ChatSidePane
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        counterpartProfileId={seller.profile_id || seller.id}
        attorneyName={displayName}
        attorneyAvatar={seller.headshot_url}
      />
    </div>
  )
}

const pageShell = {
  minHeight: '100vh',
  color: T.onPaper,
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
  color: T.ink,
  textDecoration: 'none',
  transition: 'color 150ms',
}

const breadcrumbSeparator = {
  color: T.onPaperSoft,
}

const breadcrumbCurrent = {
  color: T.ink,
  fontWeight: 500,
}

const tabsContainer = {
  display: 'flex',
  gap: '4px',
  marginBottom: '0',
  borderBottom: `1px solid ${T.rule}`,
}

const tabStyle = {
  background: 'none',
  border: 'none',
  padding: '12px 20px',
  fontSize: '14px',
  fontWeight: 500,
  color: T.onPaperSoft,
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
