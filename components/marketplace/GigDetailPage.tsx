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
  const [msgText, setMsgText] = React.useState('')
  const [msgSending, setMsgSending] = React.useState(false)
  const [msgStatus, setMsgStatus] = React.useState<'idle' | 'sent' | 'error'>('idle')
  const [msgError, setMsgError] = React.useState('')

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
          paymentMethod: 'stripe',
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
                window.location.href = `/sellers/${gig.provider_id}`
              }}
              onMessage={() => {
                setMsgText('')
                setMsgStatus('idle')
                setMsgError('')
                setMsgOpen(true)
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

      {/* Message modal */}
      {msgOpen && (
        <div
          onClick={() => !msgSending && setMsgOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(10,16,28,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#FFFFFF', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', width: '100%', maxWidth: '500px', overflow: 'hidden' }}
          >
            {/* Modal header */}
            <div style={{ background: '#1B2D4F', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: '19px', fontWeight: 600, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                  Message {gig.provider?.full_name || 'Provider'}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.50)', marginTop: '2px' }}>
                  {gig.provider_type === 'attorney' ? 'Attorney' : 'Consultant'} · Usually responds within 24 hours
                </div>
              </div>
              <button onClick={() => setMsgOpen(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.60)', fontSize: '22px', cursor: 'pointer', lineHeight: 1, padding: '4px' }}>×</button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '24px' }}>
              {msgStatus === 'sent' ? (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>✓</div>
                  <div style={{ fontWeight: 700, color: '#1B2D4F', fontSize: '16px', marginBottom: '6px' }}>Message sent</div>
                  <div style={{ color: '#5C6070', fontSize: '14px', lineHeight: 1.55, marginBottom: '20px' }}>
                    {gig.provider?.full_name || 'The provider'} will be notified and can reply from their dashboard.
                  </div>
                  <button onClick={() => setMsgOpen(false)} style={{ padding: '9px 24px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#1B2D4F', color: '#FFF', border: 'none', cursor: 'pointer' }}>
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '13px', color: '#1B2D4F', fontWeight: 600, marginBottom: '6px' }}>
                      Re: {gig.title}
                    </div>
                    <textarea
                      value={msgText}
                      onChange={(e) => setMsgText(e.target.value)}
                      placeholder={gig.provider_type === 'attorney'
                        ? "Describe your situation briefly — the attorney will review and respond..."
                        : "Introduce yourself and describe what you need help with..."}
                      rows={5}
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #DDD8CE', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', lineHeight: 1.6, color: '#1A1F2E', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: msgText.length > 1800 ? '#8B1A1A' : '#9097A8' }}>{msgText.length} / 2000</span>
                    </div>
                  </div>

                  {msgError && (
                    <div style={{ background: '#FAEAEA', border: '1px solid rgba(139,26,26,0.20)', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: '#8B1A1A', marginBottom: '14px' }}>
                      {msgError}
                    </div>
                  )}

                  {gig.provider_type === 'consultant' && (
                    <div style={{ background: '#F5EDD6', border: '1px solid rgba(154,123,59,0.25)', borderRadius: '6px', padding: '10px 14px', fontSize: '13px', color: '#7A6030', marginBottom: '14px', lineHeight: 1.5 }}>
                      💡 To work directly with this consultant, place an order from the pricing panel. Messages are for questions before booking.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setMsgOpen(false)} disabled={msgSending} style={{ padding: '9px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: '#FFFFFF', color: '#5C6070', border: '1px solid #DDD8CE', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button
                      disabled={msgSending || !msgText.trim() || msgText.length > 2000}
                      onClick={async () => {
                        if (!msgText.trim()) return
                        setMsgSending(true)
                        setMsgError('')
                        try {
                          const endpoint = gig.provider_type === 'attorney'
                            ? '/api/client/attorney-message'
                            : '/api/client/attorney-message'
                          const body = gig.provider_type === 'attorney'
                            ? { attorneyId: gig.provider_id, message: msgText.trim() }
                            : { attorneyId: gig.provider_id, message: msgText.trim() }
                          const res = await fetch(endpoint, {
                            method: 'POST',
                            credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                          })
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok) throw new Error(data?.error || 'Could not send message.')
                          setMsgStatus('sent')
                        } catch (e: any) {
                          setMsgError(e.message || 'Failed to send. Please try again.')
                        } finally {
                          setMsgSending(false)
                        }
                      }}
                      style={{ padding: '9px 22px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, background: msgSending || !msgText.trim() ? '#9097A8' : '#1B2D4F', color: '#FFFFFF', border: 'none', cursor: msgSending || !msgText.trim() ? 'not-allowed' : 'pointer' }}
                    >
                      {msgSending ? 'Sending…' : 'Send Message'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
