/**
 * Marketplace design tokens.
 *
 * Every value is a CSS custom-property reference with a fallback to the
 * default Mahogany + Epoxy palette.  This lets a palette picker swap the
 * whole colourway by setting a handful of CSS variables on `.cw-market`
 * — no React re-render needed, and none of the 35 marketplace components
 * need to change their import.
 *
 * The fallback ensures that the original look renders even if the CSS
 * vars aren't set (e.g. during SSR / initial paint).
 */

export const T = {
  paper:       'var(--ys-paper, #2C1410)',
  paper2:      'var(--ys-paper2, #3A1C14)',
  paper3:      'var(--ys-paper3, #4A2518)',
  vellum:      'var(--ys-vellum, #FFF8F0)',
  cream:       'var(--ys-cream, #F6EBD8)',
  ink:         'var(--ys-ink, #1A120E)',
  inkMid:      'var(--ys-inkMid, #4A3A32)',
  inkSoft:     'var(--ys-inkSoft, #7A6A5E)',
  rule:        'var(--ys-rule, rgba(246,235,216,0.16))',
  ruleSoft:    'var(--ys-ruleSoft, rgba(246,235,216,0.08))',
  indigo:      'var(--ys-indigo, #0E7C74)',
  indigoDeep:  'var(--ys-indigoDeep, #085E58)',
  indigoSoft:  'var(--ys-indigoSoft, rgba(14,124,116,0.16))',
  brick:       'var(--ys-brick, #D4532A)',
  gold:        'var(--ys-gold, #E0B45A)',
  moss:        'var(--ys-moss, #3F6B4A)',
  star:        'var(--ys-star, #E0B45A)',
  teal:        'var(--ys-teal, #0E7C74)',
  tealDeep:    'var(--ys-tealDeep, #085E58)',
  footer:      'var(--ys-footer, #1A0C08)',
} as const

export const F = {
  display: "var(--font-fraunces), 'Fraunces', Georgia, 'Times New Roman', serif",
  ui: "var(--font-outfit), 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
} as const

/**
 * Apply a palette's tokens as CSS custom properties on a DOM element.
 * Also sets them on `document.documentElement` so `body` and other
 * full-page elements outside `.cw-market` follow the same colourway.
 * Call this from a `useEffect` after the palette name changes.
 */
export function applyPaletteCssVars(
  el: HTMLElement,
  tokens: Record<string, string>,
) {
  const map: Record<string, string> = {
    '--ys-paper':       tokens.paper,
    '--ys-paper2':      tokens.paper2,
    '--ys-paper3':      tokens.paper3,
    '--ys-vellum':      tokens.vellum,
    '--ys-cream':       tokens.cream,
    '--ys-ink':         tokens.ink,
    '--ys-inkMid':      tokens.inkMid,
    '--ys-inkSoft':     tokens.inkSoft,
    '--ys-rule':        tokens.rule,
    '--ys-ruleSoft':    tokens.ruleSoft,
    '--ys-indigo':      tokens.indigo,
    '--ys-indigoDeep':  tokens.indigoDeep,
    '--ys-indigoSoft':  tokens.indigoSoft,
    '--ys-brick':       tokens.brick,
    '--ys-gold':        tokens.gold,
    '--ys-moss':        tokens.moss,
    '--ys-star':        tokens.star,
    '--ys-teal':        tokens.teal,
    '--ys-tealDeep':    tokens.tealDeep,
    '--ys-footer':      tokens.footer,
  }
  const root = document.documentElement
  for (const [prop, value] of Object.entries(map)) {
    el.style.setProperty(prop, value)
    root.style.setProperty(prop, value)
  }
}