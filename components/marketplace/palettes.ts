/**
 * Marketplace colour palettes — light, professional, botanical.
 *
 * Default Magnolia Studio is a near-white sheet + charcoal actions (no hue on
 * the page). Other palettes are opt-in colourways the picker actually applies
 * to paper and the action accent. Accents never fill the page.
 *
 * The family is one botanical set: paper stays a light paper tone, the action
 * accent is the flower, and `moss` is the shared botanical green that the
 * background motifs (components/marketplace/patterns.ts) mix from — so a
 * palette change re-tints the floral texture instead of leaving it pasted on.
 *
 * Contract:
 *   - paper / paper2 / paper3 / footer are LIGHT chrome (page, header, rails)
 *   - vellum / cream are white / off-white cards
 *   - onPaper / onPaperSoft / onPaperEm are DARK ink on that chrome
 *   - indigo / teal are legacy token names whose role is the action accent,
 *     used on buttons, selected chips and links — never as the page fill
 *
 * Persisted palette ids stay stable so existing preferences survive.
 * Only labels / descriptions / accents are refined.
 * Contrast is gated by tests/marketplace-palette-contrast.test.ts (WCAG AA).
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
  onPaperEm: string
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

/** Shared ink + status tokens. Matches Portal Messages / landing type. */
const STUDIO_INK = {
  vellum:      '#FFFFFF',
  ink:         '#0F172A',
  inkMid:      '#334155',
  inkSoft:     '#526072',
  onPaper:     '#0F172A',
  onPaperSoft: 'rgba(15,23,42,0.72)',
  onPaperEm:   '#0F172A',
  rule:        'rgba(15,23,42,0.10)',
  ruleSoft:    'rgba(15,23,42,0.06)',
  brick:       '#B42318',
  gold:        '#7A5000',
  moss:        '#3F5A28',
  star:        '#7A5000',
} as const

function lightPalette(opts: {
  paper: string
  paper2: string
  paper3: string
  cream: string
  footer: string
  accent: string
  accentDeep: string
  accentSoft: string
  moss: string
}): PaletteTokens {
  return {
    ...STUDIO_INK,
    paper:       opts.paper,
    paper2:      opts.paper2,
    paper3:      opts.paper3,
    cream:       opts.cream,
    footer:      opts.footer,
    indigo:      opts.accent,
    indigoDeep:  opts.accentDeep,
    indigoSoft:  opts.accentSoft,
    teal:        opts.accent,
    tealDeep:    opts.accentDeep,
    moss:        opts.moss,
  }
}

/** Default Magnolia Studio — near-white magnolia paper, charcoal actions. */
const STUDIO: PaletteTokens = lightPalette({
  paper:      '#F7F8FA',
  paper2:     '#F1F3F5',
  paper3:     '#E8EBEE',
  cream:      '#F9FAFB',
  footer:     '#F1F3F5',
  accent:     '#111827',
  accentDeep: '#030712',
  accentSoft: 'rgba(17,24,39,0.10)',
  moss:       '#3F5A28',
})

/** Warm ivory paper + restrained rose-oxblood accent. */
const PARCHMENT: PaletteTokens = lightPalette({
  paper:      '#F6F3EC',
  paper2:     '#EFEAE0',
  paper3:     '#E6DFD2',
  cream:      '#FAF8F3',
  footer:     '#E8E2D6',
  accent:     '#9C2B3A',
  accentDeep: '#6B1524',
  accentSoft: 'rgba(156,43,58,0.14)',
  moss:       '#4A5340',
})

/** Cool mineral paper + muted sage-slate accent. */
const GRAPHITE: PaletteTokens = lightPalette({
  paper:      '#F5F6F8',
  paper2:     '#ECEEF2',
  paper3:     '#E2E5EB',
  cream:      '#F8F9FB',
  footer:     '#E4E7EC',
  accent:     '#41564C',
  accentDeep: '#2C3B34',
  accentSoft: 'rgba(65,86,76,0.14)',
  moss:       '#4F5E55',
})

/** Warm stone paper + deep camellia-claret accent. */
const CLARET: PaletteTokens = lightPalette({
  paper:      '#F7F4F2',
  paper2:     '#F0EAE7',
  paper3:     '#E6DDD8',
  cream:      '#FBF8F6',
  footer:     '#E9E2DE',
  accent:     '#8E2F44',
  accentDeep: '#5C1224',
  accentSoft: 'rgba(142,47,68,0.14)',
  moss:       '#4A4E35',
})

/** Cool linen paper + botanical green accent — never a green flood. */
const OLIVE: PaletteTokens = lightPalette({
  paper:      '#F4F6F5',
  paper2:     '#EBEFEC',
  paper3:     '#E2E8E4',
  cream:      '#F7F9F8',
  footer:     '#E6EBE8',
  accent:     '#2F5D43',
  accentDeep: '#1E4230',
  accentSoft: 'rgba(47,93,67,0.14)',
  moss:       '#3B5A34',
})

/** Warm stone paper + terracotta flower accent. */
const STONE: PaletteTokens = lightPalette({
  paper:      '#F6F5F2',
  paper2:     '#EEECE7',
  paper3:     '#E5E1DA',
  cream:      '#FAF9F6',
  footer:     '#E8E5DF',
  accent:     '#9A3F07',
  accentDeep: '#7C2D12',
  accentSoft: 'rgba(154,63,7,0.14)',
  moss:       '#4E5636',
})

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Magnolia Studio',
    emoji: '🌸',
    description: 'Magnolia-white paper, charcoal ink, black actions. Quiet botanical neutrality.',
    tokens: STUDIO,
  },
  {
    name: 'luxury-classic',
    label: 'Rose Parchment',
    emoji: '🌹',
    description: 'Warm ivory paper with a restrained rose-oxblood accent. Editorial and highly legible.',
    tokens: PARCHMENT,
  },
  {
    name: 'executive',
    label: 'Silver Sage',
    emoji: '🌿',
    description: 'Cool mineral paper with a muted sage-slate accent. Precise, calm, botanical.',
    tokens: GRAPHITE,
  },
  {
    name: 'rich-heritage',
    label: 'Camellia',
    emoji: '🌺',
    description: 'Warm stone paper with a deep camellia-claret accent. Restrained heritage.',
    tokens: CLARET,
  },
  {
    name: 'modern-luxury',
    label: 'Herbarium',
    emoji: '🍃',
    description: 'Cool linen paper with a botanical green accent. Field-notes clarity, never a green shell.',
    tokens: OLIVE,
  },
  {
    name: 'santorini',
    label: 'Terracotta Bloom',
    emoji: '🏵️',
    description: 'Warm stone paper with a terracotta flower accent. Sunlit, human, professional.',
    tokens: STONE,
  },
]

// Storage id stays `mahogany` so existing preferences migrate onto Magnolia Studio.
export const DEFAULT_PALETTE_NAME = 'mahogany'

/** localStorage key for the persisted palette id (shared with palette-boot). */
export const PALETTE_STORAGE_KEY = 'ys-marketplace-palette'

export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}
