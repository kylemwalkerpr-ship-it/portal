'use client'

/**
 * Fiverr-grade My Orders surface for the marketplace shell.
 *
 * Clients get the real student list + detail (clickable rows, cancel-before-
 * start). Attorneys get the standalone attorney list + detail. Consultants
 * get a clickable list that deep-links into the consultant dashboard order
 * workspace (that detail needs the consultant SPA's action wiring).
 *
 * Selected orders are wrapped by MarketplaceOrderExperience so clients and
 * providers share the same canonical lifecycle feed and dockable Messenger.
 */
import React from 'react'
import dynamic from 'next/dynamic'
import { T, F } from './tokens'
import { dashboardOrdersHref } from '@/lib/orderLinks'
import MarketplaceOrderExperience from '@/components/orders/MarketplaceOrderExperience'

const StudentOrders = dynamic(() => import('@/components/design/student-orders'), { ssr: false })
const StudentOrderDetail = dynamic(() => import('@/components/design/student-order-detail'), { ssr: false })
const AttorneyOrders = dynamic(() => import('@/components/design/attorney-orders'), { ssr: false })
const AttorneyOrderDetail = dynamic(
  () => import('@/components/design/attorney').then((m) => ({ default: m.OrderDetail })),
  { ssr: false },
)

type Role = 'client' | 'attorney' | 'consultant' | 'admin' | null

function displayCurrency() {
  try {
    return window.localStorage.getItem('yousafe.displayCurrency.v2') || 'usd'
  } catch {
    return 'usd'
  }
}

export default function MarketplaceOrdersPanel({
  role,
  orderId,
  onOpenOrder,
  onBack,
  onBrowse,
}: {
  role: Role
  orderId: string | null
  onOpenOrder: (id: string) => void
  onBack: () => void
  onBrowse: () => void
}) {
  if (!role) {
    return (
      <div className="ys-orders-panel" style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px 64px', fontFamily: F.ui }}>
        <h2 style={{ fontFamily: F.display, fontWeight: 600, fontSize: 28, color: T.ink, margin: '0 0 12px' }}>My Orders</h2>
        <p style={{ color: T.inkSoft, fontSize: 14, lineHeight: 1.6 }}>Sign in to view and manage your orders.</p>
      </div>
    )
  }

  if (role === 'attorney') {
    if (orderId) {
      return (
        <div className="ys-orders-panel">
          <MarketplaceOrderExperience role={role} orderId={orderId}>
            <AttorneyOrderDetail orderId={orderId} onBack={onBack} />
          </MarketplaceOrderExperience>
        </div>
      )
    }
    return (
      <div className="ys-orders-panel">
        <AttorneyOrders onOpenOrder={(id: string) => onOpenOrder(id)} />
      </div>
    )
  }

  if (role === 'consultant') {
    if (orderId) {
      return (
        <div className="ys-orders-panel">
          <MarketplaceOrderExperience role={role} orderId={orderId}>
            <ConsultantOrdersList orderId={orderId} onOpenOrder={onOpenOrder} onBack={onBack} />
          </MarketplaceOrderExperience>
        </div>
      )
    }
    return (
      <div className="ys-orders-panel">
        <ConsultantOrdersList orderId={null} onOpenOrder={onOpenOrder} onBack={onBack} />
      </div>
    )
  }

  if (orderId) {
    return (
      <div className="ys-orders-panel">
        <MarketplaceOrderExperience role={role} orderId={orderId}>
          <StudentOrderDetail orderId={orderId} onBack={onBack} currency={displayCurrency()} />
        </MarketplaceOrderExperience>
      </div>
    )
  }

  return (
    <div className="ys-orders-panel">
      <StudentOrders
        currency={displayCurrency()}
        onOpenOrder={(order: { id: string }) => onOpenOrder(order.id)}
        onCreateOrder={onBrowse}
      />
    </div>
  )
}

function ConsultantOrdersList({
  orderId,
  onOpenOrder,
  onBack,
}: {
  orderId: string | null
  onOpenOrder: (id: string) => void
  onBack: () => void
}) {
  const [orders, setOrders] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    fetch('/api/consultant/data', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load orders.'))))
      .then((data) => {
        if (!cancelled) setOrders(data?.orders ?? data?.data?.orders ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load orders.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = orderId ? orders.find((o) => o.id === orderId) || { id: orderId } : null

  if (selected) {
    const href = dashboardOrdersHref(selected.id)
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 64px', fontFamily: F.ui }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: 'none', border: 0, color: T.inkSoft, cursor: 'pointer', fontSize: 13, marginBottom: 16, fontFamily: F.ui }}
        >
          ← Back to orders
        </button>
        <div style={{ background: T.vellum, border: `1px solid ${T.rule}`, borderRadius: 12, padding: 22 }}>
          <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 22, color: T.ink, marginBottom: 8 }}>
            {selected.service || selected.title || 'Order'}
          </div>
          <div style={{ fontSize: 13, color: T.inkSoft, marginBottom: 18 }}>
            {selected.status ? String(selected.status).replace(/_/g, ' ') : 'Open'}
            {selected.student || selected.clientName ? ` · ${selected.student || selected.clientName}` : ''}
          </div>
          <p style={{ fontSize: 14, color: T.inkMid, lineHeight: 1.6, margin: '0 0 18px' }}>
            Start work, update progress, and deliver from your consultant workspace. The Marketplace Activity & pipeline view keeps the shared audit trail visible to both sides.
          </p>
          <a
            href={href}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '10px 18px',
              borderRadius: 999,
              background: T.indigo,
              color: '#fff',
              fontWeight: 600,
              fontSize: 14,
              textDecoration: 'none',
            }}
          >
            Open order workspace
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px 64px', fontFamily: F.ui }}>
      <h2 style={{ fontFamily: F.display, fontWeight: 600, fontSize: 28, color: T.ink, margin: '0 0 18px' }}>Orders</h2>
      {loading && <div style={{ color: T.inkSoft, fontSize: 13 }}>Loading orders…</div>}
      {error && (
        <div style={{ background: 'rgba(178,34,52,0.06)', border: '1px solid rgba(178,34,52,0.20)', borderRadius: 8, padding: '14px 16px', color: T.brick, fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && orders.length === 0 && (
        <div style={{ background: T.vellum, border: `1px dashed ${T.rule}`, borderRadius: 10, padding: 36, textAlign: 'center', color: T.inkSoft }}>
          No orders yet.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map((o: any) => (
          <button
            key={o.id}
            type="button"
            className="ys-order-row"
            onClick={() => onOpenOrder(o.id)}
            style={{
              textAlign: 'left',
              background: T.vellum,
              border: `1px solid ${T.rule}`,
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              cursor: 'pointer',
              fontFamily: F.ui,
              minHeight: 56,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: F.display, fontWeight: 600, fontSize: 16, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.service || o.title || 'Service order'}
              </div>
              <div style={{ fontSize: 12, color: T.inkSoft, marginTop: 3 }}>
                {o.student || o.clientName || o.client || ''}
                {o.created_at ? ` · ${new Date(o.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </div>
            </div>
            <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.inkSoft }}>
              {String(o.status || 'open').replace(/_/g, ' ')}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
