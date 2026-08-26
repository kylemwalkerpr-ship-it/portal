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
  paper:       'var(--ys-paper, #4A2A1A)',
  paper2:      'var(--ys-paper2, #553222)',
  paper3:      'var(--ys-paper3, #603A28)',
  vellum:      'var(--ys-vellum, #FFF9F2)',
  cream:       'var(--ys-cream, #F7EDE0)',
  ink:         'var(--ys-ink, #1C1410)',
  inkMid:      'var(--ys-inkMid, #4A3C34)',
  inkSoft:     'var(--ys-inkSoft, #7A6C64)',
  /** Light text for DARK surfaces (header, nav, footer, page background).
   *  Every palette guarantees strong contrast of onPaper against paper*. */
  onPaper:     'var(--ys-onPaper, #F7EDE0)',
  /** Secondary light text on dark surfaces (labels, meta). */
  onPaperSoft: 'var(--ys-onPaperSoft, rgba(247,237,224,0.72))',
  rule:        'var(--ys-rule, rgba(247,237,224,0.16))',
  ruleSoft:    'var(--ys-ruleSoft, rgba(247,237,224,0.08))',
  indigo:      'var(--ys-indigo, #0B7A6E)',
  indigoDeep:  'var(--ys-indigoDeep, #086356)',
  indigoSoft:  'var(--ys-indigoSoft, rgba(11,122,110,0.18))',
  brick:       'var(--ys-brick, #C44020)',
  gold:        'var(--ys-gold, #8E6818)',
  moss:        'var(--ys-moss, #448050)',
  star:        'var(--ys-star, #8E6818)',
  teal:        'var(--ys-teal, #0B7A6E)',
  tealDeep:    'var(--ys-tealDeep, #086356)',
  footer:      'var(--ys-footer, #3A1E14)',
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
) {  const map: Record<string, string> = {
    '--ys-paper':       tokens.paper,
    '--ys-paper2':      tokens.paper2,
    '--ys-paper3':      tokens.paper3,
    '--ys-vellum':      tokens.vellum,
    '--ys-cream':       tokens.cream,
    '--ys-ink':         tokens.ink,
    '--ys-inkMid':      tokens.inkMid,
    '--ys-inkSoft':     tokens.inkSoft,
    '--ys-onPaper':     tokens.onPaper,
    '--ys-onPaperSoft': tokens.onPaperSoft,
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
  // Paint the body so overscroll / rubber-banding shows the palette instead
  // of a white flash. PaletteProvider clears this on unmount so leaving the
  // marketplace restores the portal's own body background.
  if (tokens.paper) document.body.style.backgroundColor = tokens.paper
}