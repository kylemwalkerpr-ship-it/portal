/**
 * Source-scan: Marketplace / portal chrome stays Messages-grade.
 * Light paper, charcoal type, one quiet accent. No mahogany / teal / emerald
 * floods as page fill or as CSS fallbacks that flash on first paint.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PALETTES, DEFAULT_PALETTE_NAME } from '../components/marketplace/palettes'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

const FLOOD_HEX = [
  '#4A2A1A',
  '#553222',
  '#603A28',
  '#0B786C',
  '#0E7C74',
  '#0B7A6E',
  '#086356',
  '#087A5B',
  '#F7EDE0',
  '#FFF9F2',
]

const MARKET_SURFACES = [
  'components/marketplace/tokens.ts',
  'components/marketplace/palettes.ts',
  'components/marketplace/MarketplaceShell.tsx',
  'components/marketplace/MarketplaceAuthNav.tsx',
  'components/marketplace/MarketplaceAuthNav.module.css',
  'components/marketplace/PalettePicker.tsx',
  'components/marketplace/PatternPicker.tsx',
  'components/marketplace/ThemePicker.tsx',
  'app/marketplace/marketplace-brand.css',
  'app/marketplace/page.tsx',
  'app/marketplace/cart/page.tsx',
  'app/shop/FilesShop.tsx',
  'app/globals.css',
  'app/layout.tsx',
]

describe('marketplace professional chrome (source scan)', () => {
  test('first-paint Studio tokens are cool gray paper + charcoal ink', () => {
    const globals = read('app/globals.css')
    expect(globals).toContain('--ys-paper: #F4F6F8')
    expect(globals).toContain('--ys-ink: #0F172A')
    expect(globals).toContain('--ys-onPaper: #0F172A')
    expect(globals).not.toMatch(/\.cw-market \.seller-card,\s*\n\s*\.cw-market \[style\*=\"background: var\(--ys-indigo\)\"\]/)
  })

  test('does not ship retired flood hexes as marketplace fallbacks', () => {
    for (const file of MARKET_SURFACES) {
      const src = read(file)
      for (const hex of FLOOD_HEX) {
        expect(`${file} ${src}`).not.toContain(hex)
      }
    }
  })

  test('discovery / providers / categories page titles are charcoal, not white', () => {
    const discovery = read('components/marketplace/GigDiscoveryPage.tsx')
    const providers = read('components/marketplace/MarketplaceProvidersIndex.tsx')
    const categories = read('components/marketplace/MarketplaceCategoriesIndex.tsx')
    expect(discovery).toMatch(/titleStyle[\s\S]{0,200}T\.ink/)
    expect(providers).toMatch(/h1[\s\S]{0,240}T\.ink/)
    expect(categories).toMatch(/h1[\s\S]{0,240}T\.ink/)
    expect(discovery).not.toMatch(/titleStyle[\s\S]{0,160}color:\s*['\"]#fff/i)
  })

  test('pattern overlay stays a faint charcoal weave, not a flood', () => {
    const picker = read('components/marketplace/PatternPicker.tsx')
    expect(picker).not.toMatch(/opacity:\s*number\s*\}\s*as const/)
    expect(picker).toMatch(/id: 'linen'[\s\S]{0,80}opacity:\s*0\.1[0-9]/)
    const shell = read('components/marketplace/MarketplaceShell.tsx')
    const landing = read('app/marketplace/PublicMarketplaceLanding.tsx')
    expect(shell).toMatch(/\.cw-market::before[^}]*opacity:\s*0\.22/)
    expect(landing).toMatch(/\.cw-market::before[^}]*opacity:\s*0\.22/)
  })

  test('account trigger is light chrome, not cream-on-glass', () => {
    const css = read('components/marketplace/MarketplaceAuthNav.module.css')
    expect(css).toContain('background: var(--ys-vellum, #FFFFFF);')
    expect(css).toContain('color: var(--ys-onPaper, #0F172A);')
    expect(css).not.toContain('rgba(255, 255, 255, 0.08)')
    expect(css).not.toContain('rgba(153, 246, 228')
  })

  test('file shop SSR fallbacks match Studio, not Polished Walnut', () => {
    const shop = read('app/shop/FilesShop.tsx')
    expect(shop).toContain("paper: 'var(--ys-paper, #F4F6F8)'")
    expect(shop).toContain("ink: 'var(--ys-ink, #0F172A)'")
    expect(shop).toContain("teal: 'var(--ys-teal, #3C3B6E)'")
    expect(shop).toContain('color: ${V.ink}')
    expect(shop).not.toMatch(/color: \$\{V\.cream\}/)
  })

  test('portal default theme matches Studio paper + slate-navy accent', () => {
    const themes = read('lib/portalThemes.ts')
    expect(themes).toContain("swatch: { bg: '#F4F6F8', ink: '#0F172A', accent: '#3C3B6E' }")
    expect(themes).toContain("DEFAULT_THEME: PortalThemeId = 'mountain-view'")
    const css = read('app/portal-themes.css')
    expect(css).toContain('--portal-bg:           #F4F6F8;')
    expect(css).toContain('--portal-accent:       #3C3B6E;')
    expect(css).toContain('--portal-ink:          #0F172A;')
  })

  test('persisted palette ids stay stable while chrome stays light', () => {
    expect(DEFAULT_PALETTE_NAME).toBe('mahogany')
    expect(PALETTES.map((p) => p.name)).toEqual([
      'mahogany',
      'luxury-classic',
      'executive',
      'rich-heritage',
      'modern-luxury',
      'santorini',
    ])
    for (const palette of PALETTES) {
      expect(palette.tokens.paper.toUpperCase()).toMatch(/^#F[0-9A-F]{5}$/)
      expect(palette.tokens.onPaper).toBe('#0F172A')
      expect(palette.tokens.indigo).toBe(palette.tokens.teal)
    }
  })
})
