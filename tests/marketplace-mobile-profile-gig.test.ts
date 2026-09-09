/// <reference types="jest" />

import fs from 'node:fs'
import path from 'node:path'

describe('Marketplace seller profile and gig-detail mobile hardening', () => {
  const root = process.cwd()
  const cssPath = path.join(root, 'app/mobile-marketplace-profile-gig.css')
  const layoutPath = path.join(root, 'app/layout.tsx')

  test('loads the focused marketplace layer after the premium nav layer', () => {
    const layout = fs.readFileSync(layoutPath, 'utf8')
    const premium = layout.indexOf("import './mobile-marketplace-premium-nav.css'")
    const profileGig = layout.indexOf("import './mobile-marketplace-profile-gig.css'")
    expect(premium).toBeGreaterThan(-1)
    expect(profileGig).toBeGreaterThan(premium)
  })

  test('turns the seller identity header into a real phone grid', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toContain('grid-template-columns: 88px minmax(0, 1fr)')
    expect(css).toContain('word-break: normal !important')
    expect(css).toContain('grid-column: 1 / -1 !important')
  })

  test('stacks the fixed desktop review sidebar instead of crushing review copy', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toContain("[style*='width: 280px']")
    expect(css).toContain('flex-direction: column !important')
    expect(css).toContain('width: 100% !important')
  })

  test('moves purchasing controls ahead of long-form mobile gig sections', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toContain('.ys-sidebar { order: 3 !important; }')
    expect(css).toContain('display: contents !important')
  })

  test('keeps reviews immediately above FAQ at the bottom of the gig flow', () => {
    const css = fs.readFileSync(cssPath, 'utf8')
    expect(css).toContain('> :nth-child(4) {\n  order: 30;')
    expect(css).toContain('> :nth-child(5) {\n  order: 20;')
    expect(css).toContain('> :nth-child(6) {\n  order: 10;')
  })
})
