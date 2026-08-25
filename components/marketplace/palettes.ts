/**
 * Marketplace color palettes.
 *
 * Each palette maps the token keys used by `tokens.ts` to a distinct
 * colourway. The values are plain hex/css strings — the runtime
 * resolves them into CSS custom properties on `.cw-market`.
 *
 * Palette 0 is the original mahogany + epoxy (always the default/fallback).
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

// ─── Palette 0 — Mahogany + Epoxy (default) ──────────────────────────────────

const MAHOGANY: PaletteTokens = {
  paper: '#2C1410',
  paper2: '#3A1C14',
  paper3: '#4A2518',
  vellum: '#FFF8F0',
  cream: '#F6EBD8',
  ink: '#1A120E',
  inkMid: '#4A3A32',
  inkSoft: '#7A6A5E',
  rule: 'rgba(246,235,216,0.16)',
  ruleSoft: 'rgba(246,235,216,0.08)',
  indigo: '#0E7C74',
  indigoDeep: '#085E58',
  indigoSoft: 'rgba(14,124,116,0.16)',
  brick: '#D4532A',
  gold: '#E0B45A',
  moss: '#3F6B4A',
  star: '#E0B45A',
  teal: '#0E7C74',
  tealDeep: '#085E58',
  footer: '#1A0C08',
}

// ─── Palette 1 — Luxury Classic ──────────────────────────────────────────────
// Mahogany + Ivory + Champagne Gold + Charcoal

const LUXURY_CLASSIC: PaletteTokens = {
  paper: '#4A2418',
  paper2: '#5C2E1F',
  paper3: '#6B3828',
  vellum: '#F5EFE2',
  cream: '#EDE3CE',
  ink: '#211A17',
  inkMid: '#3D3330',
  inkSoft: '#6B5E58',
  rule: 'rgba(212,175,106,0.18)',
  ruleSoft: 'rgba(212,175,106,0.09)',
  indigo: '#A67C2E',
  indigoDeep: '#8A6422',
  indigoSoft: 'rgba(166,124,46,0.16)',
  brick: '#B8452E',
  gold: '#D4AF6A',
  moss: '#4A6B3F',
  star: '#D4AF6A',
  teal: '#A67C2E',
  tealDeep: '#8A6422',
  footer: '#1A1110',
}

// ─── Palette 2 — Executive ───────────────────────────────────────────────────
// Mahogany + Warm White + Deep Navy + Gold

const EXECUTIVE: PaletteTokens = {
  paper: '#542A1B',
  paper2: '#653424',
  paper3: '#76402E',
  vellum: '#FAF7F0',
  cream: '#F2EBD8',
  ink: '#0F1923',
  inkMid: '#2D3540',
  inkSoft: '#5C6673',
  rule: 'rgba(16,42,67,0.14)',
  ruleSoft: 'rgba(16,42,67,0.08)',
  indigo: '#102A43',
  indigoDeep: '#0B1E32',
  indigoSoft: 'rgba(16,42,67,0.14)',
  brick: '#C44A2E',
  gold: '#C9A45C',
  moss: '#3D5A3E',
  star: '#C9A45C',
  teal: '#102A43',
  tealDeep: '#0B1E32',
  footer: '#0F1923',
}

// ─── Palette 3 — Rich Heritage ───────────────────────────────────────────────
// Dark Mahogany + Cream + Antique Gold + Espresso

const RICH_HERITAGE: PaletteTokens = {
  paper: '#35170F',
  paper2: '#3F1D14',
  paper3: '#4D2418',
  vellum: '#F2E3C2',
  cream: '#E8D7AE',
  ink: '#1A0E0A',
  inkMid: '#3A2822',
  inkSoft: '#6B5148',
  rule: 'rgba(184,149,85,0.18)',
  ruleSoft: 'rgba(184,149,85,0.09)',
  indigo: '#8A6E3B',
  indigoDeep: '#6E5428',
  indigoSoft: 'rgba(138,110,59,0.16)',
  brick: '#A83E2A',
  gold: '#B89555',
  moss: '#3D5538',
  star: '#B89555',
  teal: '#8A6E3B',
  tealDeep: '#6E5428',
  footer: '#120807',
}

// ─── Palette 4 — Modern Luxury ───────────────────────────────────────────────
// Mahogany + Soft Beige + Muted Gold + Slate

const MODERN_LUXURY: PaletteTokens = {
  paper: '#5A2C1E',
  paper2: '#6B3526',
  paper3: '#7C4030',
  vellum: '#E8DDCE',
  cream: '#DED0BC',
  ink: '#24272D',
  inkMid: '#3D4148',
  inkSoft: '#6B7078',
  rule: 'rgba(197,164,109,0.16)',
  ruleSoft: 'rgba(197,164,109,0.08)',
  indigo: '#30343B',
  indigoDeep: '#24272D',
  indigoSoft: 'rgba(48,52,59,0.14)',
  brick: '#C44D2E',
  gold: '#C5A46D',
  moss: '#4A6B44',
  star: '#C5A46D',
  teal: '#30343B',
  tealDeep: '#24272D',
  footer: '#1A120E',
}

// ─── Palette 5 — Santorini ──────────────────────────────────────────────────
// Bright Aegean turquoise water + Crisp White + Warm Sun Gold + Coral
// Inspired by the caldera: shallow turquoise waters, whitewashed buildings,
// blue-domed chapels, and golden hour sunlight on the cliffs.

const SANTORINI: PaletteTokens = {
  paper: '#006A80',
  paper2: '#005D71',
  paper3: '#005164',
  vellum: '#FFFFFF',
  cream: '#F0FAFD',
  ink: '#081F2D',
  inkMid: '#1A3D52',
  inkSoft: '#4A6D82',
  rule: 'rgba(240,250,253,0.14)',
  ruleSoft: 'rgba(240,250,253,0.07)',
  indigo: '#08709A',
  indigoDeep: '#065D82',
  indigoSoft: 'rgba(8,112,154,0.18)',
  brick: '#CC3E2A',
  gold: '#8A6C22',
  moss: '#2D7A5E',
  star: '#8A6C22',
  teal: '#08709A',
  tealDeep: '#065D82',
  footer: '#054D5E',
}

// ─── Registry ────────────────────────────────────────────────────────────────

export const PALETTES: PaletteDef[] = [
  {
    name: 'mahogany',
    label: 'Mahogany + Epoxy',
    emoji: '🪵',
    description: 'Dark wood, warm cream, teal inlay. The original.',
    tokens: MAHOGANY,
  },
  {
    name: 'luxury-classic',
    label: 'Luxury Classic',
    emoji: '🥇',
    description: 'Mahogany + Ivory + Champagne Gold + Charcoal. Premium consultancy.',
    tokens: LUXURY_CLASSIC,
  },
  {
    name: 'executive',
    label: 'Executive',
    emoji: '🏛️',
    description: 'Mahogany + Warm White + Deep Navy + Gold. Corporate/professional.',
    tokens: EXECUTIVE,
  },
  {
    name: 'rich-heritage',
    label: 'Rich Heritage',
    emoji: '🌰',
    description: 'Dark Mahogany + Cream + Antique Gold + Espresso. Traditional, established.',
    tokens: RICH_HERITAGE,
  },
  {
    name: 'modern-luxury',
    label: 'Modern Luxury',
    emoji: '✨',
    description: 'Mahogany + Soft Beige + Muted Gold + Slate. Contemporary.',
    tokens: MODERN_LUXURY,
  },
  {
    name: 'santorini',
    label: 'Santorini',
    emoji: '🇬🇷',
    description: 'Aegean turquoise waters + crisp white + warm sun gold + coral. Bright Mediterranean.',
    tokens: SANTORINI,
  },
]

/** Look up a palette by its name. Falls back to mahogany. */
export function getPalette(name: string): PaletteDef {
  return PALETTES.find(p => p.name === name) ?? PALETTES[0]
}