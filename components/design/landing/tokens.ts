/**
 * Landing-page token palette.
 * Maps the prototype's semantic names to the production portal theme
 * variables (via shared.jsx C) or hard-coded hexes where there is no
 * CSS variable yet.
 */

export const T = {
  paper: '#FAFAF8',
  surface: '#FFFFFF',
  surface2: '#F1EEE6',
  ink: '#0F172A',
  inkMid: '#334155',
  inkSoft: '#64748B',
  inkDim: '#94A3B8',
  rule: '#E5E7EB',
  ruleSoft: '#F1F1EC',
  indigo: '#3C3B6E',
  indigoDeep: '#2A2A55',
  indigoSoft: 'rgba(60,59,110,0.08)',
  brick: '#B22234',
  gold: '#C4A45A',
  moss: '#5F6B3A',
  serif: "var(--font-cormorant), 'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace",
} as const
