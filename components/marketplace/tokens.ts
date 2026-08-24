// Mahogany veneer under a lit epoxy coat.
// Keep `indigo` / `brick` keys so existing T.indigo call sites stay teal inlay.
// T.ink stays dark for type on ivory cards. On-wood type uses T.cream.

export const T = {
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
} as const

export const F = {
  display: "var(--font-fraunces), 'Fraunces', Georgia, 'Times New Roman', serif",
  ui: "var(--font-outfit), 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
} as const
