/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

describe('Marketplace seller profile and gig mobile layout', () => {
  const root = process.cwd()
  const css = fs.readFileSync(path.join(root, 'app/mobile-marketplace-profile-gig.css'), 'utf8')
  const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf8')

  test('loads the focused Marketplace layer after the older mobile Marketplace rules', () => {
    const premiumNav = layout.indexOf("import './mobile-marketplace-premium-nav.css'")
    const profileGig = layout.indexOf("import './mobile-marketplace-profile-gig.css'")
    expect(premiumNav).toBeGreaterThan(-1)
    expect(profileGig).toBeGreaterThan(premiumNav)
  })

  test('prevents seller identity text from collapsing into a narrow phone column', () => {
    expect(css).toContain('grid-template-columns: 96px minmax(0, 1fr)')
    expect(css).toContain('grid-template-columns: 82px minmax(0, 1fr)')
    expect(css).toContain('overflow-wrap: break-word')
    expect(css).toContain('word-break: normal')
  })

  test('removes the desktop review filter rail from seller profiles on phones', () => {
    expect(css).toContain("[style*='gap: 32px'][style*='align-items: flex-start'] > [style*='width: 280px']")
    expect(css).toContain('display: none !important')
    expect(css).toContain('.ys-seller-profile-tab-content select')
  })

  test('surfaces package and order cards before long-form gig content on phones', () => {
    expect(css).toContain('.ys-content-layout > div:first-child,')
    expect(css).toContain('display: contents !important')
    expect(css).toContain('.ys-sidebar > :nth-child(2) { order: 30; }')
    expect(css).toContain('.ys-sidebar > :nth-child(3) { order: 31; }')
    expect(css).toContain('.ys-content-layout > div:first-child > :nth-child(3) { order: 50; }')
  })

  test('keeps reviews immediately ahead of FAQ in the substantive mobile gig flow', () => {
    expect(css).toContain('div:has(h2)')
    expect(css).toContain('order: 90')
    expect(css).toContain('div:has(> h3 + div > div > button)')
    expect(css).toContain('order: 100')
  })
})
