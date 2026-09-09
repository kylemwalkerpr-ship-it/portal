/**
 * Marketplace colour palettes — bright, premium, welcoming, and legibility-first.
 *
 * Persisted palette ids stay unchanged so existing preferences survive this
 * refresh. The shell colours intentionally use more luminous, saturated hues
 * instead of near-black surfaces, while every shipped text/surface role remains
 * covered by tests/marketplace-palette-contrast.test.ts at WCAG AA (4.5:1).
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

const SHARED_LIGHT = {
  vellum:      '#FFFFFF',
  ink:         '#111827',
  inkMid:      '#334155',
  inkSoft:     '#52606D',
  onPaper:     '#FFFFFF',
  onPaperSoft: 'rgba(255,255,255,0.90)',
  onPaperEm:   '#FFF7E8',
  indigo:      '#4F46E5',
  indigoDeep:  '#4338CA',
  indigoSoft:  'rgba(79,70,229,0.14)',
  brick:       '#B42318',
  gold:        '#FFF4D6',
  moss:        '#3F6212',
  star:        '#8A5A00',
  teal:        '#0F766E',
  tealDeep:    '#0B615B',
}

// Storage key `mahogany` retained for backwards compatibility.
const LUMINOUS_TEAL: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#0F766E',
  paper2:      '#0D6B64',
  paper3:      '#0B615B',
  cream:       '#F4FBFA',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#0A514C',
}

const ROYAL_INDIGO: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#4F46E5',
  paper2:      '#4338CA',
  paper3:      '#3730A3',
  cream:       '#F7F7FF',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#312E81',
}

const BRILLIANT_AZURE: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#1D4ED8',
  paper2:      '#1E40AF',
  paper3:      '#1E3A8A',
  cream:       '#F5F9FF',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#172554',
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

const FRESH_EMERALD: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#047857',
  paper2:      '#065F46',
  paper3:      '#064E3B',
  cream:       '#F3FBF7',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#022C22',
}

const COASTAL_CYAN: PaletteTokens = {
  ...SHARED_LIGHT,
  paper:       '#0E7490',
  paper2:      '#155E75',
  paper3:      '#164E63',
  cream:       '#F2FBFD',
  rule:        'rgba(255,255,255,0.22)',
  ruleSoft:    'rgba(255,255,255,0.11)',
  footer:      '#083344',
}

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Luminous Teal',
    emoji: '●',
    description: 'Bright jewel teal with crisp white cards and warm ivory highlights. Premium, calm, and welcoming.',
    tokens: LUMINOUS_TEAL,
  },
  {
    name: 'luxury-classic',
    label: 'Royal Indigo',
    emoji: '◆',
    description: 'Vivid royal indigo with clean white surfaces and soft ivory accents. Confident without feeling heavy.',
    tokens: ROYAL_INDIGO,
  },
  {
    name: 'executive',
    label: 'Brilliant Azure',
    emoji: '■',
    description: 'Clear premium blue with white conversion surfaces and energetic depth. Professional and optimistic.',
    tokens: BRILLIANT_AZURE,
  },
  {
    name: 'rich-heritage',
    label: 'Raspberry Wine',
    emoji: '◈',
    description: 'Rich raspberry-wine with bright ivory surfaces. Sophisticated, warmer, and more inviting than near-black burgundy.',
    tokens: RASPBERRY_WINE,
  },
  {
    name: 'modern-luxury',
    label: 'Fresh Emerald',
    emoji: '◇',
    description: 'Luminous emerald with white cards and restrained jewel accents. Fresh, trustworthy, and premium.',
    tokens: FRESH_EMERALD,
  },
  {
    name: 'santorini',
    label: 'Coastal Cyan',
    emoji: '○',
    description: 'Bright coastal cyan-blue with airy white surfaces. Welcoming, modern, and highly legible.',
    tokens: COASTAL_CYAN,
  },
]

// Keep the storage id stable so existing users on the former default migrate
// automatically to the brighter Luminous Teal colours without losing prefs.
export const DEFAULT_PALETTE_NAME = 'mahogany'

export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}
