/**
 * Marketplace colour palettes — professional, restrained, and legibility-first.
 *
 * The persisted palette ids are intentionally unchanged so existing user
 * preferences survive this visual refresh. Every shipped token is covered by
 * tests/marketplace-palette-contrast.test.ts and must meet WCAG AA (4.5:1)
 * for every text/surface role used by the marketplace UI.
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

// Storage key `mahogany` retained for backwards compatibility. The visual
// treatment is now a neutral executive teal rather than a brown wood theme.
const EXECUTIVE_TEAL: PaletteTokens = {
  paper:       '#0F1F22',
  paper2:      '#13282C',
  paper3:      '#183236',
  vellum:      '#FFFFFF',
  cream:       '#F3F7F6',
  ink:         '#111827',
  inkMid:      '#374151',
  inkSoft:     '#5B6472',
  onPaper:     '#F8FAFC',
  onPaperSoft: 'rgba(248,250,252,0.78)',
  onPaperEm:   '#DFF7F1',
  rule:        'rgba(248,250,252,0.16)',
  ruleSoft:    'rgba(248,250,252,0.08)',
  indigo:      '#0B625C',
  indigoDeep:  '#084B47',
  indigoSoft:  'rgba(11,98,92,0.16)',
  brick:       '#A32F22',
  gold:        '#E7D8A6',
  moss:        '#2F6A48',
  star:        '#7A5A12',
  teal:        '#0B625C',
  tealDeep:    '#084B47',
  footer:      '#0B1719',
}

const GRAPHITE_CHAMPAGNE: PaletteTokens = {
  paper:       '#171A1D',
  paper2:      '#1E2226',
  paper3:      '#272C31',
  vellum:      '#FFFFFF',
  cream:       '#F5F5F4',
  ink:         '#171A1D',
  inkMid:      '#3D444B',
  inkSoft:     '#606972',
  onPaper:     '#FAFAF9',
  onPaperSoft: 'rgba(250,250,249,0.78)',
  onPaperEm:   '#EFE7D2',
  rule:        'rgba(250,250,249,0.15)',
  ruleSoft:    'rgba(250,250,249,0.08)',
  indigo:      '#46515A',
  indigoDeep:  '#303940',
  indigoSoft:  'rgba(70,81,90,0.16)',
  brick:       '#9E3428',
  gold:        '#E8DAB8',
  moss:        '#456C4B',
  star:        '#73591C',
  teal:        '#315F62',
  tealDeep:    '#24484A',
  footer:      '#111315',
}

const EXECUTIVE_NAVY: PaletteTokens = {
  paper:       '#101A2A',
  paper2:      '#142237',
  paper3:      '#192B44',
  vellum:      '#FFFFFF',
  cream:       '#F5F7FA',
  ink:         '#111827',
  inkMid:      '#374151',
  inkSoft:     '#5B6472',
  onPaper:     '#F8FAFC',
  onPaperSoft: 'rgba(248,250,252,0.78)',
  onPaperEm:   '#E7EEF8',
  rule:        'rgba(248,250,252,0.15)',
  ruleSoft:    'rgba(248,250,252,0.08)',
  indigo:      '#1B4F72',
  indigoDeep:  '#123B57',
  indigoSoft:  'rgba(27,79,114,0.16)',
  brick:       '#A52E2E',
  gold:        '#E4D1A0',
  moss:        '#356B45',
  star:        '#765817',
  teal:        '#1B5C69',
  tealDeep:    '#124550',
  footer:      '#0B1220',
}

const DEEP_BURGUNDY: PaletteTokens = {
  paper:       '#24171D',
  paper2:      '#2D1B23',
  paper3:      '#37212B',
  vellum:      '#FFFDFB',
  cream:       '#F8F1F3',
  ink:         '#21161A',
  inkMid:      '#463740',
  inkSoft:     '#685963',
  onPaper:     '#FFF9FA',
  onPaperSoft: 'rgba(255,249,250,0.80)',
  onPaperEm:   '#F6E6EA',
  rule:        'rgba(255,249,250,0.15)',
  ruleSoft:    'rgba(255,249,250,0.08)',
  indigo:      '#684052',
  indigoDeep:  '#4F2F3D',
  indigoSoft:  'rgba(104,64,82,0.16)',
  brick:       '#8D2E36',
  gold:        '#E7CFAD',
  moss:        '#456744',
  star:        '#71541A',
  teal:        '#356268',
  tealDeep:    '#284B50',
  footer:      '#190F14',
}

const SLATE_SILVER: PaletteTokens = {
  paper:       '#1A222B',
  paper2:      '#202B36',
  paper3:      '#273641',
  vellum:      '#FFFFFF',
  cream:       '#F5F7F8',
  ink:         '#151A20',
  inkMid:      '#3B4651',
  inkSoft:     '#606B75',
  onPaper:     '#F8FAFC',
  onPaperSoft: 'rgba(248,250,252,0.80)',
  onPaperEm:   '#E5EDF3',
  rule:        'rgba(248,250,252,0.15)',
  ruleSoft:    'rgba(248,250,252,0.08)',
  indigo:      '#42586D',
  indigoDeep:  '#304456',
  indigoSoft:  'rgba(66,88,109,0.16)',
  brick:       '#9B3428',
  gold:        '#E3D5B5',
  moss:        '#42684A',
  star:        '#73591E',
  teal:        '#315F62',
  tealDeep:    '#24484A',
  footer:      '#111820',
}

const COASTAL_BLUE: PaletteTokens = {
  paper:       '#0B2A35',
  paper2:      '#0E3441',
  paper3:      '#123E4D',
  vellum:      '#FFFFFF',
  cream:       '#F2F8FA',
  ink:         '#10202A',
  inkMid:      '#344B58',
  inkSoft:     '#5A6D78',
  onPaper:     '#F7FBFC',
  onPaperSoft: 'rgba(247,251,252,0.80)',
  onPaperEm:   '#E0F2F5',
  rule:        'rgba(247,251,252,0.15)',
  ruleSoft:    'rgba(247,251,252,0.08)',
  indigo:      '#135C72',
  indigoDeep:  '#0D4557',
  indigoSoft:  'rgba(19,92,114,0.16)',
  brick:       '#9E382A',
  gold:        '#E5D5A8',
  moss:        '#356A4B',
  star:        '#76591A',
  teal:        '#0F6170',
  tealDeep:    '#0B4954',
  footer:      '#071D25',
}

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Executive Teal',
    emoji: '●',
    description: 'Deep teal-black, crisp white, restrained aqua accents. Calm and premium.',
    tokens: EXECUTIVE_TEAL,
  },
  {
    name: 'luxury-classic',
    label: 'Graphite & Champagne',
    emoji: '◆',
    description: 'Graphite shell, white cards, subtle champagne highlights. Formal and understated.',
    tokens: GRAPHITE_CHAMPAGNE,
  },
  {
    name: 'executive',
    label: 'Executive Navy',
    emoji: '■',
    description: 'Midnight navy, clean white surfaces, disciplined blue accents. Boardroom ready.',
    tokens: EXECUTIVE_NAVY,
  },
  {
    name: 'rich-heritage',
    label: 'Deep Burgundy',
    emoji: '◈',
    description: 'Near-black burgundy with ivory surfaces and muted wine accents. Sophisticated, not ornate.',
    tokens: DEEP_BURGUNDY,
  },
  {
    name: 'modern-luxury',
    label: 'Slate & Silver',
    emoji: '◇',
    description: 'Cool slate, bright white cards, and quiet silver-blue accents. Modern professional.',
    tokens: SLATE_SILVER,
  },
  {
    name: 'santorini',
    label: 'Coastal Blue',
    emoji: '○',
    description: 'Deep ocean blue with white cards and measured teal accents. Fresh without feeling playful.',
    tokens: COASTAL_BLUE,
  },
]

// Keep the storage id stable so existing users on the former default migrate
// automatically to the refreshed Executive Teal colours without losing prefs.
export const DEFAULT_PALETTE_NAME = 'mahogany'

export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}
