/**
 * Marketplace colour palettes — light, professional, Fiverr-grade.
 *
 * Default Studio is a white sheet + charcoal actions (no hue on the page).
 * Other palettes are opt-in colourways the picker actually applies to paper
 * and the action accent. Accents never fill the page.
 *
 * Contract:
 *   - paper / paper2 / paper3 / footer are LIGHT chrome (page, header, rails)
 *   - vellum / cream are white / off-white cards
 *   - onPaper / onPaperSoft / onPaperEm are DARK ink on that chrome
 *   - indigo / teal are legacy token names whose role is the action accent,
 *     used on buttons, selected chips and links — never as the page fill
 *
 * Persisted palette ids stay stable so existing preferences survive.
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
  }
}

/** Default — Fiverr-like white paper, charcoal actions, no colour wash. */
const STUDIO: PaletteTokens = lightPalette({
  paper:      '#F7F8FA',
  paper2:     '#F1F3F5',
  paper3:     '#E8EBEE',
  cream:      '#F9FAFB',
  footer:     '#F1F3F5',
  accent:     '#111827',
  accentDeep: '#030712',
  accentSoft: 'rgba(17,24,39,0.10)',
})

const PARCHMENT: PaletteTokens = lightPalette({
  paper:      '#F6F3EC',
  paper2:     '#EFEAE0',
  paper3:     '#E6DFD2',
  cream:      '#FAF8F3',
  footer:     '#E8E2D6',
  accent:     '#9B2430',
  accentDeep: '#6E1520',
  accentSoft: 'rgba(155,36,48,0.14)',
})

const GRAPHITE: PaletteTokens = lightPalette({
  paper:      '#F5F6F8',
  paper2:     '#ECEEF2',
  paper3:     '#E2E5EB',
  cream:      '#F8F9FB',
  footer:     '#E4E7EC',
  accent:     '#1E293B',
  accentDeep: '#0F172A',
  accentSoft: 'rgba(30,41,59,0.12)',
})

const CLARET: PaletteTokens = lightPalette({
  paper:      '#F7F4F2',
  paper2:     '#F0EAE7',
  paper3:     '#E6DDD8',
  cream:      '#FBF8F6',
  footer:     '#E9E2DE',
  accent:     '#8E2438',
  accentDeep: '#5C1224',
  accentSoft: 'rgba(142,36,56,0.14)',
})

/** Quiet olive actions — the Messages selected-pill, never a green flood. */
const OLIVE: PaletteTokens = lightPalette({
  paper:      '#F4F6F5',
  paper2:     '#EBEFEC',
  paper3:     '#E2E8E4',
  cream:      '#F7F9F8',
  footer:     '#E6EBE8',
  accent:     '#1B6B48',
  accentDeep: '#134D34',
  accentSoft: 'rgba(27,107,72,0.14)',
})

const STONE: PaletteTokens = lightPalette({
  paper:      '#F6F5F2',
  paper2:     '#EEECE7',
  paper3:     '#E5E1DA',
  cream:      '#FAF9F6',
  footer:     '#E8E5DF',
  accent:     '#9A3F07',
  accentDeep: '#7C2D12',
  accentSoft: 'rgba(154,63,7,0.14)',
})

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Studio',
    emoji: '●',
    description: 'White paper, charcoal type, black actions. Clean professional default — no colour wash.',
    tokens: STUDIO,
  },
  {
    name: 'luxury-classic',
    label: 'Parchment',
    emoji: '◆',
    description: 'Warm ivory paper with oxblood actions. Quiet, editorial, and highly legible.',
    tokens: PARCHMENT,
  },
  {
    name: 'executive',
    label: 'Graphite',
    emoji: '■',
    description: 'Neutral gray paper with slate actions. Precise, modern, no decorative hue.',
    tokens: GRAPHITE,
  },
  {
    name: 'rich-heritage',
    label: 'Claret',
    emoji: '◈',
    description: 'Warm stone paper with claret actions. Restrained heritage without a colour wash.',
    tokens: CLARET,
  },
  {
    name: 'modern-luxury',
    label: 'Olive',
    emoji: '◇',
    description: 'Cool linen paper with olive actions used like Messages selected chips — never a green shell.',
    tokens: OLIVE,
  },
  {
    name: 'santorini',
    label: 'Stone',
    emoji: '○',
    description: 'Warm stone paper with terracotta actions. Human, calm, and professional.',
    tokens: STONE,
  },
]

// Storage id stays `mahogany` so existing preferences migrate onto Studio.
export const DEFAULT_PALETTE_NAME = 'mahogany'

export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}
