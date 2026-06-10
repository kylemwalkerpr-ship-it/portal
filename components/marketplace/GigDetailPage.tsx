// @ts-nocheck
'use client'
import React from 'react'
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Card, LoadingState, ErrorState, EmptyState, Btn } from '../design/shared'
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
import { T, F } from './tokens'

const pageShell: CSSProperties = {
  minHeight: '100vh',
  background: T.paper,
  color: T.ink,
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
  marginBottom: '24px',
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
  color: T.inkSoft,
}

const breadcrumbLink: CSSProperties = {
  color: T.indigo,
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
  borderRadius: '14px',
  border: `1px solid ${T.rule}`,
  background: `linear-gradient(135deg, ${T.paper2}, ${T.paper3})`,
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
  fontSize: '32px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  margin: '0 0 12px',
  color: T.ink,
  lineHeight: 1.2,
}

const gigMeta: CSSProperties = {
  display: 'flex',
  gap: '16px',
  alignItems: 'center',
  fontFamily: F.mono,
  fontSize: '11px',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: T.inkSoft,
  marginBottom: '16px',
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
  background: T.paper2,
  border: `1px solid ${T.rule}`,
  borderRadius: '999px',
  fontSize: '12.5px',
  color: T.inkMid,
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
  // Defer hostname read to after mount so SSR + first client paint
  // produce the same markup (owner banner hidden). Once mounted we
  // know whether we're on the portal host vs market subdomain and
  // can show the banner where appropriate.
  const [isPortalHost, setIsPortalHost] = React.useState(false)
  React.useEffect(() => {
    setIsPortalHost(window.location.hostname === 'portal.yousafeconsultancy.com')
  }, [])
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

  // One idempotency key per checkout attempt: double-clicks and network
  // retries replay the same server-side outcome instead of double-charging.
  const idemKeyRef = React.useRef<string | null>(null)

  const handleOrder = async () => {
    if (!selectedTierId || !gig) return
    idemKeyRef.current ||= crypto.randomUUID()
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
    // SSR pass renders this branch (loading=true on initial render),
    // so the H1 here is what crawlers see. Derive a heading from the
    // slug as a placeholder; once data arrives, this whole subtree is
    // replaced by the real gig render which has its own visible <h1>.
    // Single H1 per page is preserved either way — never two at once.
    const placeholderWords = (slug || 'Service')
      .split('-')
      .filter(Boolean)
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    const placeholderTitle = placeholderWords.join(' ') || 'Service'
    return (
      <div style={pageShell}>
        <main style={inner}>
          <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            {placeholderTitle}
          </h1>
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
    // Derive a readable headline from the slug so crawlers (this surface is
    // noindex but still flagged by Ahrefs for "missing h1") have a real
    // <h1> at the top of the empty-state page. Matches the slug→title
    // helper used by generateMetadata in app/marketplace/gigs/[slug]/page.tsx.
    const words = (slug || 'Service')
      .split('-')
      .filter(Boolean)
      .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    const derivedTitle = words.join(' ') || 'Service'
    return (
      <div style={pageShell}>
        <main style={inner}>
          {/* Off-screen h1 so SEO/accessibility tools see a heading even
              though the page itself shows "Gig not found" as the dominant
              copy. We don't want to mislead a human visitor with a slug-
              derived headline when the gig is genuinely gone. */}
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

  return (
    <div style={pageShell}>
      <main style={inner}>
        <div style={toolbar}>
          <div style={breadcrumb}>
            <Link href="/" style={breadcrumbLink}>
              Marketplace
            </Link>
            <span style={{ color: T.rule }}>/</span>
            <span>{gig.category || 'Service'}</span>
            <span style={{ color: T.rule }}>/</span>
            <span style={{ color: T.ink }}>{gig.title}</span>
          </div>
        </div>

        {/* Owner preview banner — visible ONLY when ALL of:
              1. The API returned viewer_is_owner === true (strict
                 equality; "truthy" leaked the banner once when an
                 older response shape returned a non-boolean).
              2. We're on the portal hostname. The market subdomain is
                 the buyer surface — sellers manage their gigs from the
                 portal dashboard, so the banner has no business there
                 and would only confuse anon visitors who saw it
                 momentarily during render.
              3. We're running in the browser (window is defined). On
                 the server side hostname check returns undefined which
                 would render the banner — guard against the SSR pass.
            All three are necessary to keep the Edit gig button out of
            anon hands.
        */}
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
              background: gig.status === 'active' ? T.moss : T.gold,
              color: '#FFFFFF',
            }}>
              {gig.status === 'active' ? 'Live preview' : `Owner preview · ${gig.status}`}
            </span>
            <span style={{ fontSize: '13px', color: T.inkMid, lineHeight: 1.4, flex: 1, minWidth: '180px' }}>
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

        <div style={contentLayout} className="ys-content-layout">
          <div style={mainContent}>
            <div>
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
            </div>

            <div>
              <h1 style={gigTitle}>{gig.title}</h1>
              <div style={gigMeta}>
                <span style={{ color: T.star }}>★ {gig.avg_rating?.toFixed(1) || '0'}</span>
                <span style={{ color: T.rule }}>·</span>
                <span>{gig.review_count || 0} reviews</span>
                <span style={{ color: T.rule }}>·</span>
                <span>{gig.order_count || 0} orders</span>
              </div>
              {gig.pitch && (
                <p style={{ fontFamily: F.ui, fontSize: '16px', color: T.inkMid, marginBottom: '16px', lineHeight: 1.55 }}>
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
                headshot_url: gig.provider_headshot_url || null,
              }}
              onViewProfile={() => {
                // Prefer the SEO-friendly username when the provider has set
                // one; otherwise fall back to the profile UUID (the page
                // resolves either token, see app/marketplace/providers/[id]).
                const token = gig.provider?.username || gig.provider_id
                window.location.href = `/marketplace/providers/${token}`
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
