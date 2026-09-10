/**
 * Canonical client-facing order URLs and the cross-shell open-order event.
 *
 * Marketplace (where clients actually live after checkout) uses
 *   /?view=orders[&order=<id>]
 * Dashboard shells (student / attorney / consultant) use
 *   /dashboard?page=orders[&order=<id>]
 * and listen for `yousafe-open-order` / `yousafe-navigate`.
 */

export function marketplaceOrdersHref(orderId?: string | null): string {
  const params = new URLSearchParams()
  params.set('view', 'orders')
  if (orderId) params.set('order', String(orderId))
  return `/?${params.toString()}`
}

export function dashboardOrdersHref(orderId?: string | null): string {
  const params = new URLSearchParams()
  params.set('page', 'orders')
  if (orderId) params.set('order', String(orderId))
  return `/dashboard?${params.toString()}`
}

export function readOrderIdFromSearch(search?: string | null): string | null {
  try {
    const raw = search ?? (typeof window !== 'undefined' ? window.location.search : '')
    const id = new URLSearchParams(raw).get('order')
    return id && id.trim() ? id.trim() : null
  } catch {
    return null
  }
}

/** Dispatch the in-app events dashboard/marketplace shells already listen for. */
export function openOrderInApp(orderId: string) {
  if (typeof window === 'undefined' || !orderId) return
  window.dispatchEvent(new CustomEvent('yousafe-open-order', { detail: { orderId } }))
  window.dispatchEvent(new CustomEvent('yousafe-navigate', { detail: { page: 'orders', orderId } }))
}
