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

  test('ships bright professional non-blue palette labels', () => {
    expect(PALETTES.map((p) => p.label)).toEqual([
      'Bright Emerald',
      'Royal Aubergine',
      'Burnished Amber',
      'Raspberry Wine',
      'Forest Jade',
      'Warm Terracotta',
    ])
  })

  test('uses saturated non-blue shell surfaces instead of near-black or blue defaults', () => {
    expect(PALETTES.map((p) => p.tokens.paper)).toEqual([
      '#087A5B',
      '#7C2D6F',
      '#9A4E00',
      '#9F1239',
      '#166534',
      '#B54708',
    ])

    const retiredSurfaces = new Set([
      '#0F1F22',
      '#171A1D',
      '#101A2A',
      '#24171D',
      '#1A222B',
      '#0B2A35',
      '#4F46E5',
      '#1D4ED8',
      '#0E7490',
    ])
    for (const palette of PALETTES) {
      expect(retiredSurfaces.has(palette.tokens.paper)).toBe(false)
      // Legacy token names remain API-stable, but brand/action emphasis is
      // always emerald so public Marketplace + seller tools stay coherent.
      expect(palette.tokens.indigo).toBe('#087A5B')
      expect(palette.tokens.indigoDeep).toBe('#065F46')
      expect(palette.tokens.teal).toBe('#087A5B')
      expect(palette.tokens.tealDeep).toBe('#065F46')
    }
  })

  test('retains white or near-white conversion surfaces for maximum legibility', () => {
    for (const palette of PALETTES) {
      expect(palette.tokens.vellum.toUpperCase()).toMatch(/^#(FFF|FFFF|FFFFF|FFFFFF|FFFDFB)/)
      expect(palette.tokens.onPaperSoft).toBe('rgba(255,255,255,0.90)')
    }
  })
})
