'use client'
import React from 'react'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────

interface SavedGig {
  id: string
  gig_id: string
  title?: string
  avg_rating?: number | null
  gig?: { title?: string; avg_rating?: number | null }
}

interface Order {
  id: string
  title?: string
  status?: string
  created_at?: string
}

interface Offer {
  id: string
  title?: string
  price?: number
  expires_at?: string
  status?: string
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: '#16a34a',
  pending: '#d97706',
  completed: '#6366f1',
  declined: '#dc2626',
  cancelled: '#6b7280',
  review: '#0891b2',
}

function StatusBadge({ status }: { status?: string }) {
  const label = status || 'unknown'
  const color = STATUS_COLORS[label] ?? '#6b7280'
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'capitalize',
        background: `${color}18`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  )
}

function WidgetCard({ title, children, viewAllHref, viewAllLabel }: {
  title: string
  children: React.ReactNode
  viewAllHref?: string
  viewAllLabel?: string
}) {
  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#111827' }}>{title}</h3>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            style={{ fontSize: '13px', color: '#0891b2', fontWeight: 600, textDecoration: 'none' }}
          >
            {viewAllLabel || 'View all'}
          </Link>
        )}
      </div>
      {children}
    </div>
  )
}

// ── Widget A — Saved Gigs ──────────────────────────────────────────────────────

function SavedGigsWidget() {
  const [items, setItems] = React.useState<SavedGig[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    ;(async () => {
      try {
        const res = await fetch('/api/saved-gigs', { credentials: 'same-origin', signal: controller.signal })
        let list: SavedGig[] = []
        if (res.ok) {
          const body = await res.json().catch(() => null)
          const payload = body?.data ?? body ?? {}
          list = Array.isArray(payload?.savedGigs) ? payload.savedGigs
               : Array.isArray(payload?.saved)     ? payload.saved
               : Array.isArray(payload)            ? payload
               : []
        }
        if (!cancelled) setItems(list.slice(0, 4))
      } catch {
        if (!cancelled) setItems([])
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort() }
  }, [])

  const suffix = loading ? '' : items.length > 0 ? ` (${items.length})` : ' (None)'

  return (
    <WidgetCard
      title={`Saved Services${suffix}`}
      viewAllHref="/marketplace"
      viewAllLabel="View all saved"
    >
      {loading ? (
        <div style={{ height: 56, background: '#F2EFE9', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 12px' }}>
            You have no saved services yet.
          </p>
          <Link
            href="/marketplace"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#0891b2',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map((item) => {
            const title = item.gig?.title ?? item.title ?? 'Untitled service'
            const rating = item.gig?.avg_rating ?? item.avg_rating
            return (
              <Link
                key={item.id}
                href="/marketplace"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: '#f9fafb',
                  borderRadius: '10px',
                  textDecoration: 'none',
                  color: '#111827',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title}
                </span>
                {rating != null && (
                  <span style={{ fontSize: '12px', color: '#6b7280', marginLeft: '8px', flexShrink: 0 }}>
                    ★ {Number(rating).toFixed(1)}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}

// ── Widget B — Recent Orders ───────────────────────────────────────────────────

function RecentOrdersWidget() {
  const [orders, setOrders] = React.useState<Order[]>([])
  const [loading, setLoading] = React.useState(true)
  const [placeholder, setPlaceholder] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    ;(async () => {
      try {
        const res = await fetch('/api/orders?client=true&limit=5', { credentials: 'same-origin', signal: controller.signal })
        let list: Order[] = []
        if (res.ok) {
          const body = await res.json().catch(() => null)
          const payload = body?.data ?? body ?? {}
          list = Array.isArray(payload?.orders) ? payload.orders
               : Array.isArray(payload)         ? payload
               : []
        } else {
          if (!cancelled) setPlaceholder(true)
        }
        if (!cancelled) setOrders(list.slice(0, 5))
      } catch {
        if (!cancelled) { setPlaceholder(true); setOrders([]) }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort() }
  }, [])

  const suffix = loading ? '' : orders.length > 0 ? ` (${orders.length})` : placeholder ? '' : ' (None)'

  return (
    <WidgetCard
      title={`Recent Orders${suffix}`}
      viewAllHref="/dashboard/orders"
      viewAllLabel="View all orders"
    >
      {loading ? (
        <div style={{ height: 56, background: '#F2EFE9', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : placeholder ? (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 12px' }}>
            Order history coming soon.
          </p>
          <Link
            href="/marketplace"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#6366f1',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Browse Services
          </Link>
        </div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <p style={{ color: '#6b7280', fontSize: '14px', margin: '0 0 12px' }}>
            No orders yet. Find a service and place your first order.
          </p>
          <Link
            href="/marketplace"
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: '#6366f1',
              color: '#fff',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Browse Services
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.map((order) => (
            <div
              key={order.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                background: '#f9fafb',
                borderRadius: '10px',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>
                {order.title || `Order #${order.id.slice(0, 8)}`}
              </span>
              <StatusBadge status={order.status} />
            </div>
          ))}
        </div>
      )}
    </WidgetCard>
  )
}

// ── Widget C — Pending Offers ──────────────────────────────────────────────────

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(cents || 0) / 100)
}

function PendingOffersWidget() {
  const [offers, setOffers] = React.useState<Offer[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    // Hard timeout so we never sit on "Loading…" forever if the network
    // hangs or the endpoint returns an unexpected payload shape.
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    ;(async () => {
      try {
        const res = await fetch('/api/offers?status=pending&client=true', { credentials: 'same-origin', signal: controller.signal })
        // Unwrap multiple possible payload shapes:
        //   { data: { offers: [...] } } (envelope), { offers: [...] }, [...]
        let list: Offer[] = []
        if (res.ok) {
          const body = await res.json().catch(() => null)
          const payload = body?.data ?? body ?? {}
          list = Array.isArray(payload?.offers) ? payload.offers
               : Array.isArray(payload)         ? payload
               : []
        }
        if (!cancelled) setOffers(list)
      } catch {
        // Aborted, 404, JSON parse failure — fall through to empty state
        if (!cancelled) setOffers([])
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort() }
  }, [])

  const headerSuffix = loading ? null : offers.length > 0 ? `(${offers.length})` : '(None)'

  return (
    <WidgetCard title={`Pending Offers${headerSuffix ? ` ${headerSuffix}` : ''}`}>
      {loading ? (
        // Skeleton placeholder — same height as a row, no "Loading…" text
        <div style={{ height: 56, background: '#F2EFE9', borderRadius: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : offers.length === 0 ? (
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>No pending offers right now.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {offers.map((offer) => {
            const expiresLabel = offer.expires_at
              ? `Expires ${new Date(offer.expires_at).toLocaleDateString()}`
              : null
            return (
              <div
                key={offer.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '12px',
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: '10px',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: '0 0 2px', fontSize: '14px', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {offer.title || 'Custom offer'}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                    {offer.price != null ? money(offer.price) : ''}
                    {expiresLabel ? ` · ${expiresLabel}` : ''}
                  </p>
                </div>
                <Link
                  href={`/dashboard/offers/${offer.id}`}
                  style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    background: '#d97706',
                    color: '#fff',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  Accept
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </WidgetCard>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function BuyerDashboardWidgets() {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', marginTop: '8px' }}>
      <SavedGigsWidget />
      <RecentOrdersWidget />
      <PendingOffersWidget />
    </section>
  )
}
