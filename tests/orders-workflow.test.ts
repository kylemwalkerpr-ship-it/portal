/**
 * Orders workflow contract — clickable details, cancel-before-start, and
 * Fiverr-grade landing after gig checkout / messenger offer accept.
 */
import fs from 'node:fs'
import path from 'node:path'
import { marketplaceOrdersHref, dashboardOrdersHref, readOrderIdFromSearch } from '@/lib/orderLinks'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('order links', () => {
  test('marketplace and dashboard hrefs carry view/page + order id', () => {
    expect(marketplaceOrdersHref()).toBe('/?view=orders')
    expect(marketplaceOrdersHref('abc-123')).toBe('/?view=orders&order=abc-123')
    expect(dashboardOrdersHref('abc-123')).toBe('/dashboard?page=orders&order=abc-123')
  })

  test('readOrderIdFromSearch parses order=', () => {
    expect(readOrderIdFromSearch('?view=orders&order=o1')).toBe('o1')
    expect(readOrderIdFromSearch('?view=orders')).toBeNull()
  })
})

describe('cancellation migration is on the apply path', () => {
  test('timestamped copy lives in supabase/migrations so apply-migrations deploys the RPC', () => {
    const sql = read('supabase/migrations/20260909_client_order_cancellation.sql')
    expect(sql).toContain('client_cancel_order')
    expect(sql).toContain('guard_provider_earnings_payable')
    const order = require('child_process')
      .execFileSync('node', ['scripts/migration-order.mjs'], { encoding: 'utf8' })
    expect(order).toContain('20260909_client_order_cancellation.sql')
  })
})

describe('marketplace orders are a clickable detail surface', () => {
  test('shell mounts MarketplaceOrdersPanel and listens for open-order events', () => {
    const shell = read('components/marketplace/MarketplaceShell.tsx')
    expect(shell).toContain('MarketplaceOrdersPanel')
    expect(shell).toContain('yousafe-open-order')
    expect(shell).toContain('yousafe-navigate')
    expect(shell).toContain('marketplaceOrdersHref')
    expect(shell).not.toContain('function OrdersPanel')
  })

  test('client panel uses StudentOrders + StudentOrderDetail', () => {
    const panel = read('components/marketplace/MarketplaceOrdersPanel.tsx')
    expect(panel).toContain('StudentOrders')
    expect(panel).toContain('StudentOrderDetail')
    expect(panel).toContain('onOpenOrder')
    expect(panel).toContain('AttorneyOrders')
  })

  test('order rows are clickable buttons', () => {
    const rows = read('components/design/student-orders.jsx')
    expect(rows).toContain('className="ys-order-row"')
    expect(rows).toContain('onClick={onClick}')
    const card = read('components/design/shared.jsx')
    expect(card).toContain("role={onClick ? 'button' : undefined}")
  })
})

describe('gig checkout lands on the new order', () => {
  test('checkout API returns a marketplace order url', () => {
    const route = read('app/api/checkout/order/route.ts')
    expect(route).toContain('marketplaceOrdersHref(order.id)')
    expect(route).toContain('url:')
  })

  test('gig detail confirms wallet pay then navigates to the order', () => {
    const page = read('components/marketplace/GigDetailPage.tsx')
    expect(page).toContain('openCheckout')
    expect(page).toContain('Pay from wallet')
    expect(page).toContain('marketplaceOrdersHref')
    expect(page).toContain('payload?.orderId')
    expect(page).toContain('ys-gig-checkout')
  })
})

describe('messenger offer accept lands on the new order', () => {
  test('accept API returns orderId on every paid branch', () => {
    const route = read('app/api/offers/[id]/accept/route.ts')
    const matches = route.match(/orderId: order\.id/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(3)
    expect(route).toContain('marketplaceOrdersHref(order.id)')
  })

  test('payment modal opens the order after a successful pay', () => {
    const modal = read('components/messaging/OfferPaymentModal.tsx')
    expect(modal).toContain('openOrderInApp')
    expect(modal).toContain('onPaid?: (orderId?: string) => void')
  })
})

describe('client cancel is reachable from web and mobile', () => {
  test('detail UI posts to /api/orders/:id/cancel when cancellable', () => {
    const detail = read('components/design/student-order-detail.jsx')
    expect(detail).toContain('/api/orders/${order.id}/cancel')
    expect(detail).toContain('Cancel this order')
  })

  test('mobile cancel route exists and uses the same RPC helper', () => {
    const route = read('app/api/mobile/orders/[id]/cancel/route.ts')
    expect(route).toContain('runClientCancelRpc')
    expect(route).toContain('resolveMobileStudent')
    const lib = read('lib/mobileOrders.ts')
    expect(lib).toContain('cancelEligibility')
    expect(lib).toContain('canCancel')
  })
})

describe('nav and redirects point at the clickable orders surface', () => {
  test('auth menu and client /dashboard/orders use the clean marketplace order URL', () => {
    expect(read('components/marketplace/MarketplaceAuthNav.tsx')).toContain('/?view=orders')
    const dashboardOrders = read('app/dashboard/orders/page.tsx')
    expect(dashboardOrders).toContain("const MARKETPLACE_ORDERS_URL = 'https://market.yousafeconsultancy.com/?view=orders'")
    expect(dashboardOrders).toContain('redirect(MARKETPLACE_ORDERS_URL)')
    expect(read('components/marketplace/BuyerDashboardWidgets.tsx')).toContain('viewAllHref="https://market.yousafeconsultancy.com/?view=orders"')
  })
})
