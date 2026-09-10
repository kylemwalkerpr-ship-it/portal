import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

describe('Marketplace visual modernization completion', () => {
  const layout = read('app/marketplace/layout.tsx')
  const completionCss = read('app/marketplace/marketplace-completion.css')
  const trustBar = read('components/marketplace/MarketplaceGigTrustBar.tsx')
  const gigRoute = read('app/api/marketplace/gigs/[slug]/route.ts')

  test('mounts the completion layer and gig reputation summary inside the existing shell', () => {
    expect(layout).toContain("import { MarketplaceGigTrustBar } from '@/components/marketplace/MarketplaceGigTrustBar'")
    expect(layout).toContain("import './marketplace-completion.css'")
    expect(layout.indexOf("marketplace-completion.css")).toBeGreaterThan(layout.indexOf("marketplace-refinement.css"))
    expect(layout).toContain('<MarketplaceGigTrustBar />')
    expect(layout).toContain('{children}')
  })

  test('keeps desktop discovery controls persistently accessible below the 72px sticky shell', () => {
    expect(completionCss).toContain('@media (min-width: 1025px)')
    expect(completionCss).toContain('.cw-market .ys-filter-desktop-row')
    expect(completionCss).toContain('.cw-market .ys-landing-discovery-controls')
    expect(completionCss).toContain('position: sticky')
    expect(completionCss).toContain('top: 72px')
  })

  test('uses a professional sans hierarchy for breadcrumbs and live gig titles', () => {
    expect(completionCss).toContain("nav[aria-label='Breadcrumb']")
    expect(completionCss).toContain('.cw-market .ys-content-layout h1')
    expect(completionCss).toContain('font-family: var(--ys-market-ui) !important')
    expect(completionCss).toContain('font-size: clamp(30px, 3vw, 40px) !important')
  })

  test('derives real seller level, queue and repeat-client signals without writing synthetic counters', () => {
    expect(gigRoute).toContain("from('seller_level_snapshots')")
    expect(gigRoute).toContain("select('client_id, status, gig_id')")
    expect(gigRoute).toContain('active_queue_count: activeQueueCount')
    expect(gigRoute).toContain('repeat_client_count: repeatClientCount')
    expect(gigRoute).toContain('repeat_order_count: repeatOrderCount')
    expect(gigRoute).not.toContain("insert({ active_queue_count")
    expect(gigRoute).not.toContain("update({ repeat_client_count")
  })

  test('renders only evidence-backed reputation signals', () => {
    expect(trustBar).toContain("top_attorney: 'Top Attorney'")
    expect(trustBar).toContain("top_consultant: 'Top Consultant'")
    expect(trustBar).toContain('Number(gig.review_count || 0) > 0')
    expect(trustBar).toContain('activeQueue > 0')
    expect(trustBar).toContain('repeatClients > 0')
    expect(trustBar).toContain('Clients keep coming back.')
    expect(trustBar).not.toContain("Fiverr's Choice")
    expect(trustBar).not.toContain('YouSafe Choice')
  })

  test('retains mobile horizontal signal access and reduced-motion protection', () => {
    expect(completionCss).toContain('@media (max-width: 700px)')
    expect(completionCss).toContain('.cw-market .ys-gig-trust-signals')
    expect(completionCss).toContain('overflow-x: auto')
    expect(completionCss).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
