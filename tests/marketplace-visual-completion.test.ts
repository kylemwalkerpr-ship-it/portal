import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace visual modernization completion', () => {
  const layout = read('app/marketplace/layout.tsx')
  const completionCss = read('app/marketplace/marketplace-completion.css')
  const trustBar = read('components/marketplace/MarketplaceGigTrustBar.tsx')
  const gigRoute = read('app/api/marketplace/gigs/[slug]/route.ts')
  const reputationRoute = read('app/api/marketplace/gigs/[slug]/reputation/route.ts')

  test('mounts the completion layer without duplicating provider identity above every gig', () => {
    expect(layout).not.toContain("import { MarketplaceGigTrustBar } from '@/components/marketplace/MarketplaceGigTrustBar'")
    expect(layout).toContain("import './marketplace-completion.css'")
    expect(layout).toContain("import './gig-detail-professional-layout.css'")
    expect(layout.indexOf("marketplace-completion.css")).toBeGreaterThan(layout.indexOf("marketplace-refinement.css"))
    expect(layout.indexOf("gig-detail-professional-layout.css")).toBeGreaterThan(layout.indexOf("marketplace-card-finishing.css"))
    expect(layout).not.toContain('<MarketplaceGigTrustBar />')
    expect(layout).toContain('{children}')
  })

  test('keeps desktop discovery controls persistently accessible below the sticky header and category rail', () => {
    expect(completionCss).toContain('@media (min-width: 1025px)')
    expect(completionCss).toContain('.cw-market .ys-filter-desktop-row')
    expect(completionCss).toContain('.cw-market .ys-landing-discovery-controls')
    expect(completionCss).toContain('position: sticky')
    expect(completionCss).toContain('top: 116px')
    expect(completionCss).toContain('CategoryBar is already sticky')
  })

  test('uses a professional sans hierarchy for breadcrumbs and live gig titles', () => {
    expect(completionCss).toContain("nav[aria-label='Breadcrumb']")
    expect(completionCss).toContain('.cw-market .ys-content-layout h1')
    expect(completionCss).toContain('font-family: var(--ys-market-ui) !important')
    expect(completionCss).toContain('font-size: clamp(30px, 3vw, 40px) !important')
  })

  test('keeps reputation work off the core gig first-paint API', () => {
    expect(gigRoute).toContain('const [providerGigsRes, providerHeadshotRes, similarGigsRes] = await Promise.all([')
    expect(gigRoute).not.toContain("from('seller_level_snapshots')")
    expect(gigRoute).not.toContain("from('orders')")
    expect(trustBar).toContain('/reputation`')
  })

  test('derives real seller level, queue and repeat-client signals without writing synthetic counters', () => {
    expect(reputationRoute).toContain("from('seller_level_snapshots')")
    expect(reputationRoute).toContain("select('id', { count: 'exact', head: true })")
    expect(reputationRoute).toContain("select('client_id, status')")
    expect(reputationRoute).toContain('active_queue_count: Number(activeQueueRes.count || 0)')
    expect(reputationRoute).toContain('repeat_client_count: historyComplete ? repeatClientCount : null')
    expect(reputationRoute).toContain('repeat_order_count: historyComplete ? repeatOrderCount : null')
    expect(reputationRoute).toContain('MAX_REPUTATION_HISTORY_ROWS = 5000')
    expect(reputationRoute).not.toContain("insert({ active_queue_count")
    expect(reputationRoute).not.toContain("update({ repeat_client_count")
  })

  test('retains evidence-backed reputation logic without forcing a second provider UI onto gig pages', () => {
    expect(trustBar).toContain("top_attorney: 'Top Attorney'")
    expect(trustBar).toContain("top_consultant: 'Top Consultant'")
    expect(trustBar).toContain('Number(gig.review_count || 0) > 0')
    expect(trustBar).toContain('activeQueue > 0')
    expect(trustBar).toContain('gig.repeat_history_complete === true')
    expect(trustBar).toContain('Clients keep coming back.')
    expect(trustBar).not.toContain("Fiverr's Choice")
    expect(trustBar).not.toContain('YouSafe Choice')
  })

  test('retains mobile horizontal signal styling and reduced-motion protection for any future reuse', () => {
    expect(completionCss).toContain('@media (max-width: 700px)')
    expect(completionCss).toContain('.cw-market .ys-gig-trust-signals')
    expect(completionCss).toContain('overflow-x: auto')
    expect(completionCss).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
