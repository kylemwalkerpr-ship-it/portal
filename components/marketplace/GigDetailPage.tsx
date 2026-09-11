// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Card, ErrorState, EmptyState, Btn } from '../design/shared'
import { responsiveImageProps } from '@/lib/responsiveImage'
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
import { signalSsrReady } from './SsrHydrateGate'
import { GigDetailSkeleton } from './MarketplaceRouteSkeleton'
import { normalizeGallery } from '@/lib/galleryImages'
import { stripHtmlComments } from '@/lib/bioMarkdown'
import { T, F } from './tokens'
import { renderBioMarkdown } from '@/lib/bioMarkdown'
import { marketplaceOrdersHref } from '@/lib/orderLinks'
import { getCategoryById, getSubcategoryById } from '@/lib/categories'
import { providerDisplayName } from '@/lib/providerDisplayName'

const pageShell: CSSProperties = {
  minHeight: '100vh',
  color: T.onPaper,
  fontFamily: F.ui,
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
  marginBottom: '18px',
  flexWrap: 'wrap',
}

const breadcrumb: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontFamily: F.mono,
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.onPaperSoft,
  flexWrap: 'wrap',
}

const breadcrumbLink: CSSProperties = {
  color: T.onPaper,
  textDecoration: 'none',
  fontWeight: 600,
}

const gigIntro: CSSProperties = {
  maxWidth: '900px',
  marginBottom: '24px',
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
  height: 'auto',
  aspectRatio: '1280 / 769',
  objectFit: 'contain',
  objectPosition: 'center top',
  borderRadius: '14px',
  border: `1px solid ${T.rule}`,
  background: T.vellum,
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
  borderRadius: '10px',
  cursor: 'pointer',
  border: `2px solid ${T.ruleSoft}`,
  transition: 'border-color 200ms',
}

const sectionTitle: CSSProperties = {
  fontFamily: F.display,
  fontSize: '24px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  margin: '0 0 16px',
  color: T.ink,
}

const gigTitle: CSSProperties = {
  fontFamily: F.display,
  fontSize: 'clamp(32px, 3.7vw, 46px)',
  fontWeight: 600,
  letterSpacing: '-0.025em',
  margin: '0 0 12px',
  color: T.ink,
  lineHeight: 1.08,
}

const gigMeta: CSSProperties = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  flexWrap: 'wrap',
  fontFamily: F.ui,
  fontSize: '13px',
  color: T.inkMid,
  marginBottom: '12px',
}

const gigDescription: CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.75,
  color: T.ink,
  whiteSpace: 'pre-wrap',
  fontFamily: F.ui,
}

const tagsContainer: CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  marginTop: '16px',
}

const tagBadge: CSSProperties = {
  padding: '5px 11px',
  background: T.vellum,
  border: `1px solid ${T.rule}`,
  borderRadius: '999px',
  fontSize: '12.5px',
  color: T.ink,
  fontWeight: 500,
  fontFamily: F.ui,
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
    const error = new Error(typeof message === 'string' ? message : 'Request failed') as any
    error.fields = payload?.error?.fields || {}
    error.status = res.status
    error.payload = payload
    throw error
  }
  return payload?.data ?? payload
}

interface GigDetailPageProps {
  slug: string
  /** Server-seeded gig so first paint matches final chrome (not LoadingState). */
  initialGig?: any | null
}

function shapeInitialGig(raw: any | null | undefined) {
  if (!raw) return null
  const gallery = normalizeGallery(raw.gallery_images)
  const tiers = Array.isArray(raw.tiers)
    ? raw.tiers.map((t: any) => ({ ...t, is_active: t?.is_active !== false }))
    : []
  return {
    ...raw,
    gallery_images: gallery,
    cover_image_url: gallery[0]?.url || raw.cover_image_url || null,
    tiers,
    faq: Array.isArray(raw.faq) ? raw.faq : [],
    similar_gigs: Array.isArray(raw.similar_gigs) ? raw.similar_gigs : [],
  }
}

export function GigDetailPage({ slug, initialGig = null }: GigDetailPageProps) {
  const seeded = React.useMemo(() => shapeInitialGig(initialGig), [initialGig])
  const [gig, setGig] = React.useState<any>(seeded)
  const [isPortalHost, setIsPortalHost] = React.useState(false)
  React.useEffect(() => {
    setIsPortalHost(window.location.hostname === 'portal.yousafeconsultancy.com')
  }, [])
  const [selectedTierId, setSelectedTierId] = React.useState(() => {
    const tiers = (seeded?.tiers || []).filter((t: any) => t.is_active)
    const order = ['basic', 'standard', 'premium']
    tiers.sort((a: any, b: any) => order.indexOf(a.tier) - order.indexOf(b.tier))
    return tiers[0]?.id || ''
  })
  const [loading, setLoading] = React.useState(!seeded)
  const [error, setError] = React.useState('')
  const [isSaved, setIsSaved] = React.useState(false)
  const [mainImage, setMainImage] = React.useState(() => seeded?.gallery_images?.[0]?.url || '')
  const [msgOpen, setMsgOpen] = React.useState(false)
  const [descriptionExpanded, setDescriptionExpanded] = React.useState(false)
  const [checkoutOpen, setCheckoutOpen] = React.useState(false)
  const [checkoutBusy, setCheckoutBusy] = React.useState(false)
  const [checkoutError, setCheckoutError] = React.useState('')
  const [walletCents, setWalletCents] = React.useState<number | null>(null)
  const [placedOrderId, setPlacedOrderId] = React.useState<string | null>(null)

  const { execute: gatedOrder, modal: orderModal } = useGatedAction('order', { gigId: gig?.id, tierId: selectedTierId })
  const { execute: gatedChat, modal: chatModal } = useGatedAction('chat', { gigId: gig?.id, providerId: gig?.provider_id })
  const { execute: gatedSave, modal: saveModal } = useGatedAction('save', { gigId: gig?.id })

  // Collapse crawler SSR duplicate as soon as the seeded island is interactive.
  React.useEffect(() => {
    if (seeded) signalSsrReady('yousafe:gig-ssr-ready')
  }, [seeded])

  const load = React.useCallback(async () => {
    // Keep the structural UI on screen while enrichment runs when SSR seeded us.
    if (!seeded) setLoading(true)
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
      signalSsrReady('yousafe:gig-ssr-ready')
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

      requestJson('/api/gig-metrics/event', {
        method: 'POST',
        body: JSON.stringify({ gig_id: loaded.id, event_type: 'click' }),
      }).catch(() => {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [slug, seeded])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    setDescriptionExpanded(false)
  }, [slug])

  const idemKeyRef = React.useRef<string | null>(null)

  const openCheckout = () => {
    setCheckoutOpen(true)
    setCheckoutError('')
    setPlacedOrderId(null)
    fetch('/api/wallet/balance', { credentials: 'same-origin' })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => {
        if (typeof d?.balanceCents === 'number') setWalletCents(d.balanceCents)
      })
      .catch(() => {})
  }

  const handleOrder = async () => {
    if (!selectedTierId || !gig || checkoutBusy) return
    idemKeyRef.current ||= crypto.randomUUID()
    setCheckoutBusy(true)
    setCheckoutError('')
    try {
      const payload = await requestJson('/api/checkout/order', {
        method: 'POST',
        body: JSON.stringify({
          sourceType: 'gig',
          sourceId: gig.id,
          tierId: selectedTierId,
          paymentMethod: 'wallet',
          idempotencyKey: idemKeyRef.current,
        }),
      })
      idemKeyRef.current = null
      requestJson('/api/gig-metrics/event', {
        method: 'POST',
        body: JSON.stringify({ gig_id: gig.id, event_type: 'purchase' }),
      }).catch(() => {})
      const orderId = payload?.orderId || payload?.order?.id || null
      const url = payload?.url || (orderId ? marketplaceOrdersHref(orderId) : null)
      setPlacedOrderId(orderId)
      if (url) {
        window.setTimeout(() => { window.location.href = url }, 700)
      }
    } catch (e: any) {
      setCheckoutError(e.message || 'Checkout could not be started.')
      setError(e.message || 'Checkout could not be started.')
      if (e.status === 402) {
        const cents = e.payload?.balanceCents ?? e.payload?.error?.balanceCents
        if (typeof cents === 'number') setWalletCents(cents)
      }
    } finally {
      setCheckoutBusy(false)
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

  if (loading && !gig) {
    const placeholderWords = (slug || 'Service')
      .split('-')
      .filter(Boolean)
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    const placeholderTitle = placeholderWords.join(' ') || 'Service'
    return <GigDetailSkeleton title={placeholderTitle} />
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
    const words = (slug || 'Service')
      .split('-')
      .filter(Boolean)
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    const derivedTitle = words.join(' ') || 'Service'
    return (
      <div style={pageShell}>
        <main style={inner}>
          <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            {derivedTitle}
          </h1>
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
  const category = gig.category ? getCategoryById(gig.category) : undefined
  const subcategory = category && gig.subcategory
    ? getSubcategoryById(category.id, gig.subcategory)
    : undefined
  const serviceReviewCount = Number(gig.review_count || 0)
  const serviceRating = Number(gig.avg_rating || 0)
  const serviceOrderCount = Number(gig.order_count || 0)
  const hasServiceRating = serviceReviewCount > 0 && serviceRating > 0
  const hasServiceOrders = serviceOrderCount > 0
  const publicProviderName = providerDisplayName(
    gig.provider,
    gig.provider_type === 'consultant' ? 'Regulated consultant' : 'Licensed attorney',
  )
  const summaryText = stripHtmlComments(String(gig.pitch || gig.seo_description || '')).trim()
  const descriptionPlainText = stripHtmlComments(String(gig.description || '')).trim()
  const descriptionWordCount = descriptionPlainText ? descriptionPlainText.split(/\s+/).filter(Boolean).length : 0
  const descriptionIsLong = descriptionWordCount > 90
  const providerInitials = publicProviderName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()

  return (
    <div style={pageShell}>
      <main style={inner}>
        <div style={toolbar} className="ys-gig-breadcrumb-toolbar">
          <nav aria-label="Breadcrumb" style={breadcrumb}>
            <Link href="/" style={breadcrumbLink}>Marketplace</Link>
            <span aria-hidden style={{ color: T.onPaperSoft }}>/</span>
            {category ? (
              <Link href={`/categories/${category.id}`} style={breadcrumbLink}>{category.name}</Link>
            ) : (
              <span>Service</span>
            )}
            {subcategory && (
              <>
                <span aria-hidden style={{ color: T.onPaperSoft }}>/</span>
                <Link href={`/categories/${subcategory.id}`} style={breadcrumbLink}>{subcategory.name}</Link>
              </>
            )}
          </nav>
        </div>

        {gig.viewer_is_owner === true && isPortalHost && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap' as const,
              padding: '12px 16px',
              marginBottom: '16px',
              borderRadius: '10px',
              background: gig.status === 'active' ? `${T.indigo}08` : `${T.gold}15`,
              border: `1px solid ${gig.status === 'active' ? `${T.indigo}30` : `${T.gold}55`}`,
            }}
          >
            <span style={{
              padding: '3px 9px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase' as const,
              background: gig.status === 'active' ? T.moss : T.brick,
              color: '#FFFFFF',
            }}>
              {gig.status === 'active' ? 'Live preview' : `Owner preview · ${gig.status}`}
            </span>
            <span style={{ fontSize: '13px', color: T.onPaperSoft, lineHeight: 1.4, flex: 1, minWidth: '180px' }}>
              {gig.status === 'active'
                ? "This is exactly what buyers see. Edit any field, swap images, and tune SEO from the wizard."
                : "Only you can see this preview. Edit text, swap gallery images, and tune SEO — then publish when ready."}
            </span>
            <Link
              href={`/dashboard/gigs/${gig.id}/edit`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '6px',
                background: T.ink, color: '#FFFFFF',
                fontSize: '12px', fontWeight: 700,
                letterSpacing: '0.01em', textDecoration: 'none',
                whiteSpace: 'nowrap' as const,
              }}
            >
              Edit gig ↗
            </Link>
          </div>
        )}

        <section className="ys-gig-overview" style={gigIntro} aria-labelledby="ys-gig-title">
          <h1 id="ys-gig-title" style={gigTitle}>{gig.title}</h1>
          <div style={gigMeta} aria-label="Service reputation">
            {hasServiceRating ? (
              <>
                <span style={{ color: T.star }} aria-hidden="true">★</span>
                <strong style={{ color: T.ink }}>{serviceRating.toFixed(1)}</strong>
                <span>({serviceReviewCount.toLocaleString()} review{serviceReviewCount === 1 ? '' : 's'})</span>
              </>
            ) : (
              <span style={{ color: T.inkSoft }}>New service</span>
            )}
            {hasServiceOrders && (
              <>
                <span aria-hidden style={{ color: T.rule }}>·</span>
                <span>{serviceOrderCount.toLocaleString()} completed order{serviceOrderCount === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
        </section>

        <div style={contentLayout} className="ys-content-layout">
          <div style={mainContent}>
            <Card style={{ padding: '24px' }}>
              {mainImage ? (
                <img style={gigImage} {...responsiveImageProps(mainImage, gig.title, true)} />
              ) : (
                <div
                  style={{
                    ...gigImage,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: F.display,
                    fontSize: '64px',
                    color: T.inkSoft,
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
                      style={{
                        ...galleryThumbnail,
                        borderColor: mainImage === img.url ? T.indigo : T.ruleSoft,
                      }}
                      onClick={() => setMainImage(img.url)}
                      {...responsiveImageProps(img.url, `${gig.title} ${index + 1}`)}
                    />
                  ))}
                </div>
              )}
            </Card>

            <Card className="ys-gig-about-card" style={{ padding: '24px' }}>
              <h3 style={sectionTitle}>About This Service</h3>
              {summaryText && (
                <div className="ys-gig-ai-summary" role="note" aria-label="AI summary">
                  <div className="ys-gig-ai-summary-label">
                    <span aria-hidden="true">✦</span>
                    <span>AI summary</span>
                  </div>
                  <p>{summaryText}</p>
                  <span className="ys-gig-ai-summary-note">
                    Condensed from the provider’s service listing. Package scope and terms below remain authoritative.
                  </span>
                </div>
              )}
              <div
                id="ys-gig-description"
                className={`ys-gig-description-copy ${descriptionIsLong && !descriptionExpanded ? 'is-collapsed' : 'is-expanded'}`}
                style={{ fontSize: '15px', lineHeight: 1.75, color: T.ink, fontFamily: F.ui }}
              >
                {gig.description
                  ? renderBioMarkdown(gig.description)
                  : <p style={gigDescription}>Details are being finalized by the provider.</p>}
              </div>
              {descriptionIsLong && (
                <button
                  type="button"
                  className="ys-gig-description-toggle"
                  aria-expanded={descriptionExpanded}
                  aria-controls="ys-gig-description"
                  onClick={() => setDescriptionExpanded((current) => !current)}
                >
                  <span>{descriptionExpanded ? 'Show less' : 'Read more'}</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M4 6.25 8 10l4-3.75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
              {gig.tags && gig.tags.length > 0 && (
                <div style={tagsContainer}>
                  {gig.tags.map((tag: string, index: number) => (
                    <span key={index} style={tagBadge}>{tag}</span>
                  ))}
                </div>
              )}
            </Card>

            {faq.length > 0 && <FAQSection faq={faq} />}
            <ReviewsSection gigId={gig.id} showFilters={false} />
            {gig.similar_gigs && gig.similar_gigs.length > 0 && <SimilarGigs gigs={gig.similar_gigs} />}
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
                headshot_url: gig.provider_headshot_url || null,
              }}
              onViewProfile={() => {
                const token = gig.provider?.username || gig.provider_id
                window.location.href = `/providers/${token}`
              }}
              onMessage={() => gatedChat(() => setMsgOpen(true))}
            />

            <PricingTiers tiers={tiers} selectedTierId={selectedTierId} onSelectTier={setSelectedTierId} />

            {selectedTier && (
              <OrderCTA
                selectedTier={selectedTier}
                onOrder={() => gatedOrder(openCheckout)}
                onSave={() => gatedSave(handleSave)}
                onShare={handleShare}
                isSaved={isSaved}
              />
            )}
          </aside>
        </div>
      </main>

      {gig.viewer_is_owner !== true && !msgOpen && (
        <button
          type="button"
          className="ys-floating-message-launcher"
          onClick={() => gatedChat(() => setMsgOpen(true))}
          aria-label={`Message ${publicProviderName}`}
        >
          <span className="ys-floating-message-avatar" aria-hidden="true">
            {gig.provider_headshot_url ? (
              <img src={gig.provider_headshot_url} alt="" />
            ) : (
              providerInitials || 'YS'
            )}
          </span>
          <span className="ys-floating-message-copy">
            <strong>Message {publicProviderName}</strong>
            <small>
              {gig.provider_is_online ? 'Online' : 'Available'}
              {gig.provider_response_time ? ` · Avg. response: ${gig.provider_response_time}` : ''}
            </small>
          </span>
        </button>
      )}

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

      {checkoutOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm order"
          onClick={() => { if (!checkoutBusy && !placedOrderId) setCheckoutOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}
        >
          <div
            className="ys-gig-checkout"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(440px, 100%)', background: T.vellum, color: T.ink, borderRadius: 16, padding: '22px 22px 20px', boxShadow: '0 24px 60px rgba(15,23,42,0.28)', fontFamily: F.ui }}
          >
            {placedOrderId ? (
              <>
                <div style={{ fontFamily: F.display, fontSize: 24, fontWeight: 600, marginBottom: 8 }}>Order placed</div>
                <p style={{ fontSize: 14, color: T.inkSoft, lineHeight: 1.55, margin: '0 0 16px' }}>
                  Payment is held in escrow. Opening your order…
                </p>
                <a
                  href={marketplaceOrdersHref(placedOrderId)}
                  style={{ display: 'inline-flex', padding: '10px 18px', borderRadius: 999, background: T.indigo, color: '#fff', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}
                >
                  View order
                </a>
              </>
            ) : (
              <>
                <div style={{ fontFamily: F.display, fontSize: 24, fontWeight: 600, marginBottom: 6 }}>Confirm your order</div>
                <p style={{ fontSize: 13, color: T.inkSoft, lineHeight: 1.55, margin: '0 0 16px' }}>
                  {selectedTier?.name || selectedTier?.tier || 'Selected package'} · {gig.title}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, marginBottom: 8 }}>
                  <span>Total</span>
                  <strong>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: String(selectedTier?.currency || 'usd').toUpperCase() }).format(Number(selectedTier?.price || 0) / 100)}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.inkSoft, marginBottom: 14 }}>
                  <span>Wallet balance</span>
                  <span>{walletCents == null ? '…' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(walletCents / 100)}</span>
                </div>
                <div style={{ fontSize: 12, color: T.inkSoft, lineHeight: 1.55, marginBottom: 14 }}>
                  🔒 Held in escrow until you approve delivery. Cancel for a full wallet refund if the specialist has not started.
                </div>
                {checkoutError && (
                  <div style={{ background: 'rgba(178,34,52,0.08)', border: '1px solid rgba(178,34,52,0.22)', borderRadius: 8, padding: '10px 12px', color: T.brick, fontSize: 13, marginBottom: 12 }}>
                    {checkoutError}
                    {/insufficient/i.test(checkoutError) && (
                      <div style={{ marginTop: 8 }}>
                        <a href="/dashboard?page=billing" style={{ color: T.indigo, fontWeight: 600 }}>Add funds to wallet</a>
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  disabled={checkoutBusy}
                  onClick={handleOrder}
                  style={{ width: '100%', minHeight: 44, border: 0, borderRadius: 999, background: T.indigo, color: '#fff', fontWeight: 600, fontSize: 14, cursor: checkoutBusy ? 'wait' : 'pointer', fontFamily: F.ui, marginBottom: 8 }}
                >
                  {checkoutBusy ? 'Placing order…' : 'Pay from wallet'}
                </button>
                <button
                  type="button"
                  disabled={checkoutBusy}
                  onClick={() => setCheckoutOpen(false)}
                  style={{ width: '100%', minHeight: 44, border: 0, borderRadius: 999, background: 'transparent', color: T.inkSoft, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: F.ui }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <ChatSidePane
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        counterpartProfileId={gig.provider_id}
        attorneyName={publicProviderName}
        attorneyAvatar={gig.provider_headshot_url || null}
        contextKind="gig"
        contextId={gig.id}
        presentation="popover"
        responseTime={gig.provider_response_time || null}
        serviceTitle={gig.title}
      />
      {orderModal}
      {chatModal}
      {saveModal}
    </div>
  )
}
