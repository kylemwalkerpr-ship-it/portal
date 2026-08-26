/**
 * Marketplace color palettes — lighter, more vibrant, ultra-modern luxury.
 *
 * Every palette uses the `paper`/`paper2`/`paper3` layers for the background
 * shell (body, header, cards) and the text tokens (`cream`, `ink`) for
 * foreground.  CSS custom properties on `:root` + `.cw-market` apply the
 * chosen palette globally, with a 0.3s transition for smooth switching.
 */

export interface PaletteTokens {
  [key: string]: string
  paper: string
  paper2: string
  paper3: string
  vellum: string
  cream: string
  ink: string
  inkMid: string
  inkSoft: string
  onPaper: string
  onPaperSoft: string
  rule: string
  ruleSoft: string
  indigo: string
  indigoDeep: string
  indigoSoft: string
  brick: string
  gold: string
  moss: string
  star: string
  teal: string
  tealDeep: string
  footer: string
}

export interface PaletteDef {
  name: string
  label: string
  emoji: string
  description: string
  tokens: PaletteTokens
}

// ═══════════════════════════════════════════════════════════════════════════════
// Palette 0 — Polished Walnut  (lighter, luxurious mahogany)
// ═══════════════════════════════════════════════════════════════════════════════

const MAHOGANY: PaletteTokens = {
  paper:       '#4A2A1A',
  paper2:      '#553222',
  paper3:      '#603A28',
  vellum:      '#FFF9F2',
  cream:       '#F7EDE0',
  ink:         '#1C1410',
  inkMid:      '#4A3C34',
  inkSoft:     '#7A6C64',
  onPaper:     '#F7EDE0',
  onPaperSoft: 'rgba(247,237,224,0.72)',
  rule:        'rgba(247,237,224,0.16)',
  ruleSoft:    'rgba(247,237,224,0.08)',
  indigo:      '#0B7A6E',
  indigoDeep:  '#086356',
  indigoSoft:  'rgba(11,122,110,0.18)',
  brick:       '#C44020',
  gold:        '#8E6818',
  moss:        '#448050',
  star:        '#8E6818',
  teal:        '#0B7A6E',
  tealDeep:    '#086356',
  footer:      '#3A1E14',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Palette 1 — Luxury Classic
// ═══════════════════════════════════════════════════════════════════════════════

const LUXURY_CLASSIC: PaletteTokens = {
  paper:       '#5C3220',
  paper2:      '#6A3C28',
  paper3:      '#784634',
  vellum:      '#F7F1E5',
  cream:       '#EFE6D2',
  ink:         '#211A17',
  inkMid:      '#3D3330',
  inkSoft:     '#6B5E58',
  onPaper:     '#EFE6D2',
  onPaperSoft: 'rgba(239,230,210,0.72)',
  rule:        'rgba(212,175,106,0.18)',
  ruleSoft:    'rgba(212,175,106,0.09)',
  indigo:      '#9A6E20',
  indigoDeep:  '#7C5816',
  indigoSoft:  'rgba(154,110,32,0.18)',
  brick:       '#C04A30',
  gold:        '#D8B46E',
  moss:        '#507840',
  star:        '#D8B46E',
  teal:        '#B0802E',
  tealDeep:    '#946C22',
  footer:      '#4A2418',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Palette 2 — Executive
// ═══════════════════════════════════════════════════════════════════════════════

const EXECUTIVE: PaletteTokens = {
  paper:       '#5A3422',
  paper2:      '#683E2C',
  paper3:      '#764836',
  vellum:      '#FAF8F3',
  cream:       '#F2ECDE',
  ink:         '#0F1923',
  inkMid:      '#2D3540',
  inkSoft:     '#5C6673',
  onPaper:     '#F2ECDE',
  onPaperSoft: 'rgba(242,236,222,0.72)',
  rule:        'rgba(16,42,67,0.14)',
  ruleSoft:    'rgba(16,42,67,0.08)',
  indigo:      '#153D5E',
  indigoDeep:  '#0F2D46',
  indigoSoft:  'rgba(21,61,94,0.16)',
  brick:       '#C94E30',
  gold:        '#CDAA64',
  moss:        '#446A42',
  star:        '#CDAA64',
  teal:        '#153D5E',
  tealDeep:    '#0F2D46',
  footer:      '#0F1923',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Palette 3 — Rich Heritage
// ═══════════════════════════════════════════════════════════════════════════════

const RICH_HERITAGE: PaletteTokens = {
  paper:       '#3E1F12',
  paper2:      '#482718',
  paper3:      '#54301E',
  vellum:      '#F3E6C8',
  cream:       '#E8D8AE',
  ink:         '#1A0E0A',
  inkMid:      '#3A2822',
  inkSoft:     '#6B5148',
  onPaper:     '#E8D8AE',
  onPaperSoft: 'rgba(232,216,174,0.74)',
  rule:        'rgba(184,149,85,0.18)',
  ruleSoft:    'rgba(184,149,85,0.09)',
  indigo:      '#947A3E',
  indigoDeep:  '#78602C',
  indigoSoft:  'rgba(148,122,62,0.18)',
  brick:       '#B0422C',
  gold:        '#BE9A58',
  moss:        '#42603C',
  star:        '#BE9A58',
  teal:        '#947A3E',
  tealDeep:    '#78602C',
  footer:      '#160A06',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Palette 4 — Modern Luxury
// ═══════════════════════════════════════════════════════════════════════════════

const MODERN_LUXURY: PaletteTokens = {
  paper:       '#64402C',
  paper2:      '#724A36',
  paper3:      '#805440',
  vellum:      '#EAE0D4',
  cream:       '#DED0BE',
  ink:         '#24272D',
  inkMid:      '#3D4148',
  inkSoft:     '#6B7078',
  onPaper:     '#F4EDE2',
  onPaperSoft: 'rgba(244,237,226,0.74)',
  rule:        'rgba(197,164,109,0.16)',
  ruleSoft:    'rgba(197,164,109,0.08)',
  indigo:      '#3A4248',
  indigoDeep:  '#2A3036',
  indigoSoft:  'rgba(58,66,72,0.16)',
  brick:       '#C85034',
  gold:        '#C9AA74',
  moss:        '#507A48',
  star:        '#C9AA74',
  teal:        '#3A4248',
  tealDeep:    '#2A3036',
  footer:      '#26140C',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Palette 5 — Santorini
// ═══════════════════════════════════════════════════════════════════════════════

const SANTORINI: PaletteTokens = {
  paper:       '#006A80',
  paper2:      '#005D71',
  paper3:      '#005164',
  vellum:      '#FFFFFF',
  cream:       '#F0FAFD',
  ink:         '#081F2D',
  inkMid:      '#1A3D52',
  inkSoft:     '#4A6D82',
  onPaper:     '#F0FAFD',
  onPaperSoft: 'rgba(240,250,253,0.85)',
  rule:        'rgba(240,250,253,0.14)',
  ruleSoft:    'rgba(240,250,253,0.07)',
  indigo:      '#08709A',
  indigoDeep:  '#065D82',
  indigoSoft:  'rgba(8,112,154,0.18)',
  brick:       '#CC3E2A',
  gold:        '#8A6C22',
  moss:        '#2D7A5E',
  star:        '#8A6C22',
  teal:        '#08709A',
  tealDeep:    '#065D82',
  footer:      '#054D5E',
}

// ═══════════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════════

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Polished Walnut',
    emoji: '🪵',
    description: 'Warm walnut wood, cream parchment, teal inlay. Refined & luxurious.',
    tokens: MAHOGANY,
  },
  {
    name: 'luxury-classic',
    label: 'Luxury Classic',
    emoji: '🥇',
    description: 'Rich mahogany + ivory + champagne gold + charcoal.',
    tokens: LUXURY_CLASSIC,
  },
  {
    name: 'executive',
    label: 'Executive',
    emoji: '🏛️',
    description: 'Warm wood + crisp white + deep navy + gold. Boardroom ready.',
    tokens: EXECUTIVE,
  },
  {
    name: 'rich-heritage',
    label: 'Rich Heritage',
    emoji: '🌰',
    description: 'Dark chestnut + cream + antique gold + espresso.',
    tokens: RICH_HERITAGE,
  },
  {
    name: 'modern-luxury',
    label: 'Modern Luxury',
    emoji: '✨',
    description: 'Warm oak + soft beige + muted gold + slate grey.',
    tokens: MODERN_LUXURY,
  },
  {
    name: 'santorini',
    label: 'Santorini',
    emoji: '🇬🇷',
    description: 'Aegean turquoise + crisp white + sun gold + coral.',
    tokens: SANTORINI,
  },
]

export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}