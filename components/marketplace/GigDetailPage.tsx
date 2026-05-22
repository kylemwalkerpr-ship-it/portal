// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
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
import ChatSidePane from './ChatSidePane'
import { useGatedAction } from './useGatedAction'

const pageShell: CSSProperties = {
  minHeight: '100vh',
  background: C.bg,
  color: C.text,
  fontFamily: C.sans,
}

const inner: CSSProperties = {
  width: 'min(1280px, calc(100vw - 32px))',
  margin: '0 auto',
  padding: '32px 0 64px',
}

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  marginBottom: '24px',
  flexWrap: 'wrap',
}

const breadcrumb: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '13px',
  color: C.textMuted,
}

const breadcrumbLink: CSSProperties = {
  color: C.cyan,
  textDecoration: 'none',
  fontWeight: 600,
}

const contentLayout: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 380px',
  gap: '32px',
}

const mainContent: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const sidebar: CSSProperties = {
  position: 'sticky',
  top: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const gigImage: CSSProperties = {
  width: '100%',
  height: '400px',
  objectFit: 'cover',
  borderRadius: '16px',
  background: `linear-gradient(135deg, ${C.surface2}, #E8EEF6)`,
}

const galleryGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
  gap: '12px',
  marginTop: '16px',
}

const galleryThumbnail: CSSProperties = {
  width: '100%',
  aspectRatio: '1',
  objectFit: 'cover',
  borderRadius: '12px',
  cursor: 'pointer',
  border: `2px solid transparent`,
  transition: 'border-color 200ms',
}

const sectionTitle: CSSProperties = {
  fontFamily: C.serif,
  fontSize: '24px',
  fontWeight: 500,
  margin: '0 0 16px',
  color: C.text,
}

const gigTitle: CSSProperties = {
  fontFamily: C.serif,
  fontSize: '32px',
  fontWeight: 500,
  margin: '0 0 12px',
  color: C.text,
  lineHeight: 1.2,
}

const gigMeta: CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'center',
  fontSize: '14px',
  color: C.textMuted,
  marginBottom: '16px',
}

const gigDescription: CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.75,
  color: C.text,
  whiteSpace: 'pre-wrap',
}

const tagsContainer: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '16px',
}

const tagBadge: CSSProperties = {
  padding: '6px 12px',
  background: `${C.cyan}10`,
  border: `1px solid ${C.cyan}33`,
  borderRadius: '20px',
  fontSize: '13px',
  color: C.cyan,
  fontWeight: 600,
}

const SAVED_GIGS_KEY = 'ys_marketplace_saved_gigs'
const RECENT_GIGS_KEY = 'ys_marketplace_recent_gigs'

function readLocalList(key: string) {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function money(cents: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: String(currency || 'usd').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

async function requestJson(url: string, options: RequestInit = {}) {
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
  const [msgOpen, setMsgOpen] = React.useState(false)

  const { execute: gatedOrder, modal: orderModal } = useGatedAction('order', { gigId: gig?.id, tierId: selectedTierId })
  const { execute: gatedChat, modal: chatModal } = useGatedAction('chat', { gigId: gig?.id, providerId: gig?.provider_id })
  const { execute: gatedSave, modal: saveModal } = useGatedAction('save', { gigId: gig?.id })

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
      if (typeof window !== 'undefined') {
        const saved = readLocalList(SAVED_GIGS_KEY)
        setIsSaved(saved.some((item: any) => item.id === loaded.id))

        const recent = readLocalList(RECENT_GIGS_KEY)
        const recentGig = {
          id: loaded.id,
          slug: loaded.slug,
          title: loaded.title,
          pitch: loaded.pitch,
          starting_price: loaded.starting_price,
          avg_rating: loaded.avg_rating,
          review_count: loaded.review_count,
          provider_type: loaded.provider_type,
          provider_id: loaded.provider_id,
          provider: loaded.provider,
          gallery_images: loaded.gallery_images || [],
        }
        window.localStorage.setItem(
          RECENT_GIGS_KEY,
          JSON.stringify([recentGig, ...recent.filter((item: any) => item.id !== loaded.id)].slice(0, 8)),
        )
      }

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

  const handleOrder = async () => {
    if (!selectedTierId || !gig) return
    try {
      const payload = await requestJson('/api/checkout/order', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'gig',
          sourceId: gig.id,
          tierId: selectedTierId,
          paymentMethod: 'wallet',
        }),
      })
      requestJson('/api/gig-metrics/event', {
        method: 'POST',
        body: JSON.stringify({ gig_id: gig.id, event_type: 'purchase' }),
      }).catch(() => {})
      if (payload?.url) window.location.href = payload.url
    } catch (e: any) {
      setError(e.message || 'Checkout could not be started.')
    }
  }

  const handleSave = async () => {
    if (!gig) return
    try {
      const saved = readLocalList(SAVED_GIGS_KEY)
      const nextSaved = isSaved
        ? saved.filter((item: any) => item.id !== gig.id)
        : [
            {
              id: gig.id,
              slug: gig.slug,
              title: gig.title,
              pitch: gig.pitch,
              starting_price: gig.starting_price,
              avg_rating: gig.avg_rating,
              review_count: gig.review_count,
              provider_type: gig.provider_type,
              provider_id: gig.provider_id,
              provider: gig.provider,
              gallery_images: gig.gallery_images || [],
            },
            ...saved.filter((item: any) => item.id !== gig.id),
          ].slice(0, 48)
      window.localStorage.setItem(SAVED_GIGS_KEY, JSON.stringify(nextSaved))
      setIsSaved(!isSaved)
      if (!isSaved) {
        requestJson('/api/gig-metrics/event', {
          method: 'POST',
          body: JSON.stringify({ gig_id: gig.id, event_type: 'save' }),
        }).catch(() => {})
      }
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
    if (gig?.id) {
      requestJson('/api/gig-metrics/event', {
        method: 'POST',
        body: JSON.stringify({ gig_id: gig.id, event_type: 'share' }),
      }).catch(() => {})
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
            action={<Link href="/"><Btn variant="primary">Browse Marketplace</Btn></Link>}
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
            <Link href="/" style={breadcrumbLink}>
              Marketplace
            </Link>
            <span>/</span>
            <span>{gig.category || 'Service'}</span>
            <span>/</span>
            <span style={{ color: C.text }}>{gig.title}</span>
          </div>
        </div>

        <div style={contentLayout} className="ys-content-layout">
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
              gigId={gig.id}
              showFilters={false}
            />

            {gig.similar_gigs && gig.similar_gigs.length > 0 && (
              <SimilarGigs gigs={gig.similar_gigs} />
            )}
          </div>

          <aside style={sidebar} className="ys-sidebar">
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
                window.location.href = `/marketplace/providers/${gig.provider_id}`
              }}
              onMessage={() => gatedChat(() => setMsgOpen(true))}
            />

            <PricingTiers
              tiers={tiers}
              selectedTierId={selectedTierId}
              onSelectTier={setSelectedTierId}
            />

            {selectedTier && (
              <OrderCTA
                selectedTier={selectedTier}
                onOrder={() => gatedOrder(handleOrder)}
                onSave={() => gatedSave(handleSave)}
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

      {/* Side-pane chat — sticky drawer with full live thread.
         Uses counterpartProfileId so it works for both attorney and
         consultant gigs without having to map provider_id → attorney_id. */}
      <ChatSidePane
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        counterpartProfileId={gig.provider_id}
        attorneyName={gig.provider?.full_name || 'Provider'}
        attorneyAvatar={gig.provider_headshot_url || null}
        contextKind="gig"
        contextId={gig.id}
      />
      {orderModal}
      {chatModal}
      {saveModal}
    </div>
  )
}
