/**
 * Content Studio design tokens — single source of truth for the studio UI.
 *
 * Merged from the two parallel palettes that previously lived inline in
 * admin-content-studio.tsx:
 *   · `C` — functional palette (surface / status colors / radius)
 *   · `E` — editorial palette (ivory + parchment + gold on ink)
 *
 * Every original key from both palettes is preserved so existing usages
 * compile unchanged; on overlaps the editorial `E` value wins (they were
 * already identical for shared keys like `gold` / `goldSoft` / `serif`).
 * `goldGlow` / `goldRing` are new additions used by the extracted nav and
 * chapter-header components for hover / focus polish.
 */
export const studioTokens = {
  // ── surfaces ──
  bg: '#FBF6EC', // page background (== ivory)
  ivory: '#FBF6EC', // page background
  parchment: '#F5EDDD', // spread pages
  cream: '#FFFBF1', // rule-heavy regions
  paper: '#FFFFFF', // primary card surface
  surface: '#FFFFFF',
  surface2: '#F4EFE3',
  surface3: '#EFE7D6',

  // ── ink / text ──
  inkBlack: '#11151C',
  ink: '#1F2937',
  inkSoft: '#3F4654',
  inkMuted: '#6B7280',
  inkDim: '#9CA3AF',
  text: '#1F2937',
  textMuted: '#6B7280',
  textDim: '#9CA3AF',

  // ── editorial accent ──
  gold: '#A07E3A', // primary accent
  goldSoft: '#F2E6C2', // callout bg
  goldDeep: '#7C5F23', // hover / pressed
  goldGlow: '0 2px 10px rgba(160,126,58,0.33)',
  goldRing: '0 0 0 2.5px rgba(160,126,58,0.35)',

  // ── status colors ──
  ember: '#C2410C', // warning ink
  mossGreen: '#3F6F3F', // success ink
  mossSoft: '#D8E5D5',
  red: '#DC2626',
  green: '#166534',
  greenSoft: '#ECFDF5',
  orange: '#D97706',
  purple: '#7C3AED',
  navy: '#0F172A',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  cyan: '#3C3B6E',

  // ── borders ──
  border: 'rgba(0,0,0,0.08)',
  border2: 'rgba(0,0,0,0.05)',
  hairline: 'rgba(17,21,28,0.10)',
  hairlineSoft: 'rgba(17,21,28,0.05)',

  // ── typography ──
  serif:
    "var(--portal-font-display, 'Cormorant Garamond', 'Cormorant', 'Garamond', Georgia, 'Times New Roman', serif)",
  mono: "var(--portal-font-mono, 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace)",

  // ── radius ──
  radius: 12,
  radiusSm: 8,
  radiusXs: 6,

  // ── elevation ──
  shadowCard: '0 1px 3px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.04)',
  ivoryShadow: '0 1px 0 rgba(17,21,28,0.04), 0 12px 30px rgba(17,21,28,0.07)',
  paperShadow: '0 1px 2px rgba(17,21,28,0.06), 0 4px 14px rgba(17,21,28,0.04)',
  inset: 'inset 0 0 0 1px rgba(160,126,58,0.12)',
} as const

export type StudioTokens = typeof studioTokens
