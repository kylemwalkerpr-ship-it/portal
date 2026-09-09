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

  test('ships light professional palette labels', () => {
    expect(PALETTES.map((p) => p.label)).toEqual([
      'Studio',
      'Parchment',
      'Graphite',
      'Claret',
      'Olive',
      'Stone',
    ])
  })

  test('uses light chrome instead of mahogany / teal / emerald / blue floods', () => {
    const retiredSurfaces = new Set([
      '#087A5B',
      '#7C2D6F',
      '#9A4E00',
      '#9F1239',
      '#166534',
      '#B54708',
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
      expect(palette.tokens.paper.toUpperCase()).toMatch(/^#F[0-9A-F]{5}$/)
      expect(palette.tokens.onPaper).toBe('#0F172A')
      expect(palette.tokens.vellum.toUpperCase()).toBe('#FFFFFF')
    }
  })

  test('keeps action accent off the page fill and identical on indigo/teal aliases', () => {
    for (const palette of PALETTES) {
      expect(palette.tokens.indigo).toBe(palette.tokens.teal)
      expect(palette.tokens.indigoDeep).toBe(palette.tokens.tealDeep)
      expect(palette.tokens.indigo).not.toBe(palette.tokens.paper)
      expect(palette.tokens.onPaperSoft).toBe('rgba(15,23,42,0.72)')
    }
  })

  test('default Studio accent is vivid navy-violet, not emerald or teal', () => {
    const studio = PALETTES.find((p) => p.name === DEFAULT_PALETTE_NAME)!
    expect(studio.tokens.indigo).toBe('#3948C8')
    expect(studio.tokens.indigoDeep).toBe('#2B36A0')
    expect(studio.tokens.paper).toBe('#F1F3FB')
  })
})
