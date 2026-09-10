'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LEVEL_LABELS: Record<string, string> = {
  level_1: 'Level 1 Provider',
  level_2: 'Level 2 Provider',
  top_attorney: 'Top Attorney',
  top_consultant: 'Top Consultant',
}

type GigSignal = {
  id: string
  title?: string | null
  provider_id?: string | null
  provider_type?: 'attorney' | 'consultant' | null
  provider?: {
    full_name?: string | null
    username?: string | null
    email?: string | null
  } | null
  provider_headshot_url?: string | null
  avg_rating?: number | null
  review_count?: number | null
  order_count?: number | null
  provider_order_count?: number | null
  seller_level?: string | null
  seller_completed_orders?: number | null
  seller_on_time_delivery_rate?: number | null
  seller_response_rate?: number | null
  active_queue_count?: number | null
  repeat_client_count?: number | null
  repeat_order_count?: number | null
  repeat_history_complete?: boolean | null
}

function providerName(gig: GigSignal) {
  const name = String(gig.provider?.full_name || '').trim()
  if (name) return name
  const username = String(gig.provider?.username || '').trim()
  if (username) return username
  const email = String(gig.provider?.email || '').trim()
  if (email) return email.split('@')[0]
  return gig.provider_type === 'attorney' ? 'YouSafe Attorney' : 'YouSafe Consultant'
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'YS'
}

function percent(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
  return `${Math.round(value)}%`
}

export function MarketplaceGigTrustBar() {
  const pathname = usePathname()
  const slug = React.useMemo(() => {
    const match = pathname.match(/(?:^|\/)marketplace\/gigs\/([^/?#]+)|(?:^|\/)gigs\/([^/?#]+)/)
    return decodeURIComponent(match?.[1] || match?.[2] || '')
  }, [pathname])

  const [gig, setGig] = React.useState<GigSignal | null>(null)

  React.useEffect(() => {
    if (!slug) {
      setGig(null)
      return
    }

    setGig(null)
    const controller = new AbortController()
    fetch(`/api/marketplace/gigs/${encodeURIComponent(slug)}/reputation`, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload) return
        setGig(payload?.data?.gig || payload?.gig || null)
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') console.warn('[MarketplaceGigTrustBar]', error)
      })

    return () => controller.abort()
  }, [slug])

  if (!slug || !gig) return null

  const name = providerName(gig)
  const profileToken = gig.provider?.username || gig.provider_id
  const levelLabel = gig.seller_level ? LEVEL_LABELS[gig.seller_level] : null
  const ratingVisible = Number(gig.review_count || 0) > 0 && Number(gig.avg_rating || 0) > 0
  const activeQueue = Number(gig.active_queue_count || 0)
  const repeatClients = Number(gig.repeat_client_count || 0)
  const repeatOrders = Number(gig.repeat_order_count || 0)
  const completedOrders = Number(gig.seller_completed_orders || gig.provider_order_count || 0)
  const onTime = percent(gig.seller_on_time_delivery_rate)
  const responseRate = percent(gig.seller_response_rate)
  const repeatProofVisible = gig.repeat_history_complete === true && repeatClients > 0 && repeatOrders > 0

  return (
    <section className="ys-gig-trust-bar" aria-label="Provider reputation and service activity">
      <div className="ys-gig-trust-inner">
        <div className="ys-gig-trust-provider">
          {gig.provider_headshot_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gig.provider_headshot_url} alt="" className="ys-gig-trust-avatar" />
          ) : (
            <span className="ys-gig-trust-avatar ys-gig-trust-avatar-fallback" aria-hidden="true">{initials(name)}</span>
          )}
          <div className="ys-gig-trust-provider-copy">
            {profileToken ? (
              <Link href={`/marketplace/providers/${encodeURIComponent(profileToken)}`} className="ys-gig-trust-provider-name">{name}</Link>
            ) : (
              <strong className="ys-gig-trust-provider-name">{name}</strong>
            )}
            <span className="ys-gig-trust-role">
              {gig.provider_type === 'attorney' ? 'Licensed attorney' : 'Regulated consultant'}
            </span>
          </div>
        </div>

        <div className="ys-gig-trust-signals">
          {levelLabel && <span className="ys-gig-trust-badge is-level">{levelLabel}</span>}
          {ratingVisible && (
            <span className="ys-gig-trust-signal"><b>★ {Number(gig.avg_rating).toFixed(1)}</b> <span>({Number(gig.review_count).toLocaleString()} reviews)</span></span>
          )}
          {activeQueue > 0 && (
            <span className="ys-gig-trust-signal"><b>{activeQueue}</b> active order{activeQueue === 1 ? '' : 's'} in queue</span>
          )}
          {completedOrders > 0 && (
            <span className="ys-gig-trust-signal"><b>{completedOrders.toLocaleString()}</b> completed order{completedOrders === 1 ? '' : 's'}</span>
          )}
          {onTime && <span className="ys-gig-trust-signal"><b>{onTime}</b> on-time delivery</span>}
          {responseRate && <span className="ys-gig-trust-signal"><b>{responseRate}</b> response rate</span>}
        </div>

        {repeatProofVisible && (
          <div className="ys-gig-repeat-proof">
            <span className="ys-gig-repeat-icon" aria-hidden="true">↻</span>
            <span>
              <b>Clients keep coming back.</b> {repeatClients.toLocaleString()} repeat client{repeatClients === 1 ? '' : 's'} placed {repeatOrders.toLocaleString()} additional order{repeatOrders === 1 ? '' : 's'} with this provider.
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
