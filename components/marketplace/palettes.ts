/**
 * Marketplace colour palettes — bright, premium, welcoming, and legibility-first.
 *
 * Emerald is the Marketplace brand/action colour. Persisted palette ids stay
 * unchanged so existing preferences survive visual refreshes, but legacy blue
 * and cyan colourways are intentionally repurposed to professional non-blue
 * alternatives. Every shipped text/surface role remains covered by
 * tests/marketplace-palette-contrast.test.ts at WCAG AA (4.5:1).
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

/**
 * `indigo` and `teal` are legacy token names used throughout Marketplace.
 * Their semantic role is now brand/action accent, so both resolve to emerald.
 */
const SHARED_LIGHT = {
  vellum:      '#FFFFFF',
  ink:         '#17201D',
  inkMid:      '#43534D',
  inkSoft:     '#5E6F68',
  onPaper:     '#FFFFFF',
  onPaperSoft: 'rgba(255,255,255,0.90)',
  onPaperEm:   '#FFF7E8',
  indigo:      '#087A5B',
  indigoDeep:  '#065F46',
  indigoSoft:  'rgba(8,122,91,0.14)',
  brick:       '#B42318',
  gold:        '#FFF4D6',
  moss:        '#3F6212',
  star:        '#8A5A00',
  teal:        '#087A5B',
  tealDeep:    '#065F46',
}

// Storage key `mahogany` retained for backwards compatibility.
const BRIGHT_EMERALD: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#087A5B',
  paper2:      '#076E52',
  paper3:      '#065F46',
  cream:       '#F7FAF9',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#054C39',
}

const ROYAL_AUBERGINE: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#7C2D6F',
  paper2:      '#6D285F',
  paper3:      '#5B214F',
  cream:       '#FFF7FB',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#45183D',
}

const BURNISHED_AMBER: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#9A4E00',
  paper2:      '#884300',
  paper3:      '#743900',
  cream:       '#FFF8EF',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#5E2E00',
}

const RASPBERRY_WINE: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#9F1239',
  paper2:      '#881337',
  paper3:      '#701A36',
  cream:       '#FFF6F8',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#500724',
}

const FOREST_JADE: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#166534',
  paper2:      '#14532D',
  paper3:      '#124628',
  cream:       '#F5FBF7',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#0B3922',
}

const WARM_TERRACOTTA: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#B54708',
  paper2:      '#9A3C07',
  paper3:      '#7F3107',
  cream:       '#FFF7F2',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#612406',
}

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Bright Emerald',
    emoji: '●',
    description: 'Clean emerald with crisp white surfaces and charcoal text. Fresh, trustworthy, and highly legible.',
    tokens: BRIGHT_EMERALD,
  },
  {
    name: 'luxury-classic',
    label: 'Royal Aubergine',
    emoji: '◆',
    description: 'Saturated aubergine with white conversion surfaces and emerald actions. Polished, distinctive, and professional.',
    tokens: ROYAL_AUBERGINE,
  },
  {
    name: 'executive',
    label: 'Burnished Amber',
    emoji: '■',
    description: 'Warm burnished amber with bright neutral surfaces and emerald actions. Energetic without sacrificing readability.',
    tokens: BURNISHED_AMBER,
  },
  {
    name: 'rich-heritage',
    label: 'Raspberry Wine',
    emoji: '◈',
    description: 'Rich raspberry-wine with bright ivory surfaces and emerald actions. Sophisticated, warm, and confident.',
    tokens: RASPBERRY_WINE,
  },
  {
    name: 'modern-luxury',
    label: 'Forest Jade',
    emoji: '◇',
    description: 'Deep jade-green with white cards and restrained emerald accents. Calm, credible, and premium.',
    tokens: FOREST_JADE,
  },
  {
    name: 'santorini',
    label: 'Warm Terracotta',
    emoji: '○',
    description: 'Bright terracotta with airy white surfaces and emerald actions. Human, modern, and visually warm.',
    tokens: WARM_TERRACOTTA,
  },
]

// Keep the storage id stable so existing users on the former default migrate
// automatically to Bright Emerald without losing preferences.
export const DEFAULT_PALETTE_NAME = 'mahogany'

export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}
