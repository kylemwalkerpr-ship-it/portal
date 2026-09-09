import { DEFAULT_PALETTE_NAME, PALETTES } from '../components/marketplace/palettes'

describe('marketplace professional palette set', () => {
  test('keeps persisted palette ids stable through visual refreshes', () => {
    expect(PALETTES.map((p) => p.name)).toEqual([
      'mahogany',
      'luxury-classic',
      'executive',
      'rich-heritage',
      'modern-luxury',
      'santorini',
    ])
    expect(DEFAULT_PALETTE_NAME).toBe('mahogany')
  })

  test('ships the brighter premium palette labels', () => {
    expect(PALETTES.map((p) => p.label)).toEqual([
      'Luminous Teal',
      'Royal Indigo',
      'Brilliant Azure',
      'Raspberry Wine',
      'Fresh Emerald',
      'Coastal Cyan',
    ])
  })

  test('uses luminous saturated shell surfaces instead of near-black defaults', () => {
    expect(PALETTES.map((p) => p.tokens.paper)).toEqual([
      '#0F766E',
      '#4F46E5',
      '#1D4ED8',
      '#9F1239',
      '#047857',
      '#0E7490',
    ])

    const retiredNearBlackSurfaces = new Set([
      '#0F1F22',
      '#171A1D',
      '#101A2A',
      '#24171D',
      '#1A222B',
      '#0B2A35',
    ])
    for (const palette of PALETTES) {
      expect(retiredNearBlackSurfaces.has(palette.tokens.paper)).toBe(false)
    }
  })

  test('retains white or near-white conversion surfaces for maximum legibility', () => {
    for (const palette of PALETTES) {
      expect(palette.tokens.vellum.toUpperCase()).toMatch(/^#(FFF|FFFF|FFFFF|FFFFFF|FFFDFB)/)
      expect(palette.tokens.onPaperSoft).toBe('rgba(255,255,255,0.90)')
    }
  })
})
