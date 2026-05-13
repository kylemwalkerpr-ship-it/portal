'use client'
// @ts-nocheck
import React from 'react'
import Link from 'next/link'
import { C, Card, LoadingState, ErrorState, EmptyState, Btn } from '../design/shared'
import {
  SellerProfileCard,
  PricingTiers,
  FAQSection,
  SimilarGigs,
  OrderCTA,
} from './GigDetailComponents'
import { ReviewsSection } from './ReviewComponents'

const pageShell = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  fontFamily: C.sans,
}

const inner = {
  width: 'min(1280px, calc(100vw - 32px))',
  margin: '0 auto',
  padding: '32px 0 64px',
}

const toolbar = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  marginBottom: '24px',
  flexWrap: 'wrap',
}

const breadcrumb = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: C.textMuted,
}

const breadcrumbLink = {
  color: C.cyan,
  textDecoration: 'none',
  fontWeight: 600,
}

const contentLayout = {
  display: 'grid',
  gridTemplateColumns: '1fr 380px',
  gap: '32px',
}

const mainContent = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const sidebar = {
  position: 'sticky',
  top: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gigImage = {
  width: '100%',
  height: '400px',
  objectFit: 'cover',
  borderRadius: '16px',
  background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
}

const galleryGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: '12px',
  marginTop: '16px',
}

const galleryThumbnail = {
  width: '100%',
  aspectRatio: '1',
  objectFit: 'cover',
  borderRadius: '12px',
  cursor: 'pointer',
  border: `2px solid transparent`,
  transition: 'border-color 200ms',
}

const sectionTitle = {
  fontFamily: C.serif,
  fontSize: '24px',
  fontWeight: 500,
  margin: '0 0 16px',
  color: C.text,
}

const gigTitle = {
  fontFamily: C.serif,
  fontSize: '32px',
  fontWeight: 500,
  margin: '0 0 12px',
  color: C.text,
  lineHeight: 1.2,
}

const gigMeta = {
  display: 'flex',
  gap: '16px',
  alignItems: 'center',
  fontSize: '14px',
  color: C.textMuted,
  marginBottom: '16px',
}

const gigDescription = {
  fontSize: '15px',
  lineHeight: 1.75,
  color: C.text,
  whiteSpace: 'pre-wrap',
}

const tagsContainer = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '16px',
}

const tagBadge = {
  padding: '6px 12px',
  background: `${C.cyan}10`,
  border: `1px solid ${C.cyan}33`,
  borderRadius: '20px',
  fontSize: '13px',
  color: C.cyan,
  fontWeight: 600,
}

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

async function requestJson(url: string, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers:
      options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
        : options.headers,
  })
  const payload = await res.json().catch(() => ({}))
  const message = payload?.error?.message || payload?.error || `Request failed (${res.status})`
  if (!res.ok) {
    const error = new Error(message) as any
    error.fields = payload?.error?.fields || {}
    throw error
  }
  return payload?.data ?? payload
}

interface GigDetailPageProps {
  slug: string
}

export function GigDetailPage({ slug }: GigDetailPageProps) {
  const [gig, setGig] = React.useState<any>(null)
  const [selectedTierId, setSelectedTierId] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [isSaved, setIsSaved] = React.useState(false)
  const [mainImage, setMainImage] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await requestJson(`/api/marketplace/gigs/${slug}`)
      const loaded = data.gig
      if (!loaded) throw new Error('Gig not found')

      const tiers = (loaded.tiers || [])
        .filter((t: any) => t.is_active)
        .sort((a: any, b: any) => {
          const order = ['basic', 'standard', 'premium']
          return order.indexOf(a.tier) - order.indexOf(b.tier)
        })

      setGig(loaded)
      setSelectedTierId(tiers[0]?.id || '')
      setMainImage(loaded.gallery_images?.[0]?.url || '')

      // Track view
      requestJson('/api/gig-metrics/event', {
        method: 'POST',
        body: JSON.stringify({ gig_id: loaded.id, event_type: 'click' }),
      }).catch(() => {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [slug])

  React.useEffect(() => {
    load()
  }, [load])

  const handleOrder = () => {
    if (!selectedTierId || !gig) return
    // Navigate to checkout or open checkout dialog
    window.location.href = `/marketplace/gigs/${slug}/checkout?tier=${selectedTierId}`
  }

  const handleSave = async () => {
    if (!gig) return
    try {
      await requestJson('/api/saved-gigs', {
        method: 'POST',
        body: JSON.stringify({ gig_id: gig.id }),
      })
      setIsSaved(!isSaved)
    } catch (e) {
      console.error('Failed to save gig:', e)
    }
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: gig?.title,
          text: gig?.pitch,
          url: window.location.href,
        })
      } catch (e) {
        // User cancelled
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href)
      alert('Link copied to clipboard!')
    }
  }

  if (loading) {
    return (
      <div style={pageShell}>
        <main style={inner}>
          <LoadingState label="Loading gig details..." />
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div style={pageShell}>
        <main style={inner}>
          <ErrorState message={error} onRetry={load} />
        </main>
      </div>
    )
  }

  if (!gig) {
    return (
      <div style={pageShell}>
        <main style={inner}>
          <EmptyState
            title="Gig not found"
            body="This service may have been removed or is no longer available."
            action={<Link href="/marketplace"><Btn variant="primary">Browse Marketplace</Btn></Link>}
          />
        </main>
      </div>
    )
  }

  const tiers = (gig.tiers || [])
    .filter((t: any) => t.is_active)
    .sort((a: any, b: any) => {
      const order = ['basic', 'standard', 'premium']
      return order.indexOf(a.tier) - order.indexOf(b.tier)
    })

  const selectedTier = tiers.find((t: any) => t.id === selectedTierId) || tiers[0]
  const faq = Array.isArray(gig.faq) ? gig.faq : []
  const images = gig.gallery_images || []

  return (
    <div style={pageShell}>
      <main style={inner}>
        <div style={toolbar}>
          <div style={breadcrumb}>
            <Link href="/marketplace" style={breadcrumbLink}>
              Marketplace
            </Link>
            <span>/</span>
            <span>{gig.category || 'Service'}</span>
            <span>/</span>
            <span style={{ color: C.text }}>{gig.title}</span>
          </div>
        </div>

        <div style={contentLayout}>
          <div style={mainContent}>
            <div>
              {mainImage ? (
                <img src={mainImage} alt={gig.title} style={gigImage} />
              ) : (
                <div
                  style={{
                    ...gigImage,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '64px',
                    color: C.textDim,
                  }}
                >
                  {gig.title.slice(0, 2).toUpperCase()}
                </div>
              )}
              {images.length > 1 && (
                <div style={galleryGrid}>
                  {images.map((img: any, index: number) => (
                    <img
                      key={index}
                      src={img.url}
                      alt={`${gig.title} ${index + 1}`}
                      style={{
                        ...galleryThumbnail,
                        borderColor: mainImage === img.url ? C.cyan : 'transparent',
                      }}
                      onClick={() => setMainImage(img.url)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div>
              <h1 style={gigTitle}>{gig.title}</h1>
              <div style={gigMeta}>
                <span>★ {gig.avg_rating?.toFixed(1) || '0'}</span>
                <span>•</span>
                <span>{gig.review_count || 0} reviews</span>
                <span>•</span>
                <span>{gig.order_count || 0} orders</span>
              </div>
              {gig.pitch && (
                <p style={{ fontSize: '16px', color: C.textMuted, marginBottom: '16px', lineHeight: 1.5 }}>
                  {gig.pitch}
                </p>
              )}
            </div>

            <Card style={{ padding: '24px' }}>
              <h3 style={sectionTitle}>About This Service</h3>
              <p style={gigDescription}>{gig.description || 'Details are being finalized by the provider.'}</p>
              {gig.tags && gig.tags.length > 0 && (
                <div style={tagsContainer}>
                  {gig.tags.map((tag: string, index: number) => (
                    <span key={index} style={tagBadge}>
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {faq.length > 0 && <FAQSection faq={faq} />}

            <ReviewsSection
              reviews={gig.reviews || []}
              avgRating={gig.avg_rating || 0}
              reviewCount={gig.review_count || 0}
            />

            {gig.similar_gigs && gig.similar_gigs.length > 0 && (
              <SimilarGigs gigs={gig.similar_gigs} />
            )}
          </div>

          <aside style={sidebar}>
            <SellerProfileCard
              seller={{
                id: gig.provider_id,
                full_name: gig.provider?.full_name,
                email: gig.provider?.email,
                role: gig.provider_type,
                avg_rating: gig.provider_avg_rating,
                review_count: gig.provider_review_count,
                order_count: gig.provider_order_count,
                response_time: gig.provider_response_time,
                is_online: gig.provider_is_online,
              }}
              onViewProfile={() => {
                window.location.href = `/providers/${gig.provider_id}`
              }}
              onMessage={() => {
                window.location.href = `/messages?provider=${gig.provider_id}`
              }}
            />

            <PricingTiers
              tiers={tiers}
              selectedTierId={selectedTierId}
              onSelectTier={setSelectedTierId}
            />

            {selectedTier && (
              <OrderCTA
                selectedTier={selectedTier}
                onOrder={handleOrder}
                onSave={handleSave}
                onShare={handleShare}
                isSaved={isSaved}
              />
            )}
          </aside>
        </div>
      </main>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .ys-content-layout {
            grid-template-columns: 1fr !important;
          }
          .ys-sidebar {
            position: static !important;
          }
        }
      `}</style>
    </div>
  )
}
