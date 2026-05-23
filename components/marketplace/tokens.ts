// Editorial design tokens for the public marketplace surface.
// Mirror of the T/F objects inlined in PublicMarketplaceLanding.tsx so
// secondary marketplace pages (gig detail, provider profile, etc.) can
// stay visually consistent with the landing without copy-pasting palette
// values.

export const T = {
  paper: '#FBFAF7',
  paper2: '#F4F0E6',
  paper3: '#ECE6D5',
  vellum: '#FFFEF9',
  ink: '#1D2433',
  inkMid: '#4A4F5B',
  inkSoft: '#7B7B72',
  rule: '#D9D1BD',
  ruleSoft: '#E7E0CD',
  indigo: '#3C3B6E',
  indigoDeep: '#2A2A55',
  indigoSoft: 'rgba(60,59,110,0.10)',
  brick: '#B22234',
  gold: '#C4A45A',
  moss: '#5F6B3A',
  star: '#C68B27',
} as const

export const F = {
  display: "var(--font-lora), 'Lora', Georgia, 'Times New Roman', serif",
  ui: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
} as const
