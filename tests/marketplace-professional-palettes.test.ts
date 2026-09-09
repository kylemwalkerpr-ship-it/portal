import { DEFAULT_PALETTE_NAME, PALETTES } from '../components/marketplace/palettes'

describe('marketplace professional palette set', () => {
  test('keeps persisted palette ids stable while replacing the brown-heavy presentation', () => {
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

  test('ships the restrained professional palette labels', () => {
    expect(PALETTES.map((p) => p.label)).toEqual([
      'Executive Teal',
      'Graphite & Champagne',
      'Executive Navy',
      'Deep Burgundy',
      'Slate & Silver',
      'Coastal Blue',
    ])
  })

  test('uses neutral or cool dark shell surfaces instead of the former brown defaults', () => {
    expect(PALETTES[0].tokens.paper).toBe('#0F1F22')
    expect(PALETTES[1].tokens.paper).toBe('#171A1D')
    expect(PALETTES[2].tokens.paper).toBe('#101A2A')
    expect(PALETTES[4].tokens.paper).toBe('#1A222B')
  })

  test('retains white or near-white conversion surfaces for maximum legibility', () => {
    for (const palette of PALETTES) {
      expect(palette.tokens.vellum.toUpperCase()).toMatch(/^#(FFF|FFFF|FFFFF|FFFFFF|FFFDFB)/)
    }
  })
})
