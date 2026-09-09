/**
 * Marketplace design tokens.
 *
 * Every value is a CSS custom-property reference with a fallback to the
 * default Bright Emerald palette. This lets the Marketplace palette layer
 * swap shell colours while keeping one professional emerald action colour.
 * The fallbacks also make provider/seller surfaces that consume Marketplace
 * components render correctly during SSR before any client palette code runs.
 */

export const T = {
  paper:       'var(--ys-paper, #087A5B)',
  paper2:      'var(--ys-paper2, #076E52)',
  paper3:      'var(--ys-paper3, #065F46)',
  vellum:      'var(--ys-vellum, #FFFFFF)',
  cream:       'var(--ys-cream, #F7FAF9)',
  ink:         'var(--ys-ink, #17201D)',
  inkMid:      'var(--ys-inkMid, #43534D)',
  inkSoft:     'var(--ys-inkSoft, #5E6F68)',
  /** Light text for DARK surfaces (header, nav, footer, page background). */
  onPaper:     'var(--ys-onPaper, #FFFFFF)',
  /** Secondary light text on dark surfaces (labels, meta). */
  onPaperSoft: 'var(--ys-onPaperSoft, rgba(255,255,255,0.90))',
  /** Warm light accent for split headings / kickers on dark surfaces. */
  onPaperEm:   'var(--ys-onPaperEm, #FFF7E8)',
  rule:        'var(--ys-rule, rgba(255,255,255,0.22))',
  ruleSoft:    'var(--ys-ruleSoft, rgba(255,255,255,0.11))',
  /** Legacy token name; semantic role is Marketplace brand/action emerald. */
  indigo:      'var(--ys-indigo, #087A5B)',
  indigoDeep:  'var(--ys-indigoDeep, #065F46)',
  indigoSoft:  'var(--ys-indigoSoft, rgba(8,122,91,0.14))',
  brick:       'var(--ys-brick, #B42318)',
  gold:        'var(--ys-gold, #FFF4D6)',
  moss:        'var(--ys-moss, #3F6212)',
  star:        'var(--ys-star, #8A5A00)',
  /** Legacy token name; kept as an alias to the same emerald brand colour. */
  teal:        'var(--ys-teal, #087A5B)',
  tealDeep:    'var(--ys-tealDeep, #065F46)',
  footer:      'var(--ys-footer, #054C39)',
} as const

export const F = {
  display: "var(--font-fraunces), 'Fraunces', Georgia, 'Times New Roman', serif",
  ui: "var(--font-outfit), 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace",
} as const

/**
 * Convert a palette token object into inheritable --ys-* custom properties.
 * This is intentionally DOM-free so provider/seller shells can reuse the same
 * Marketplace contract without mounting the public palette picker.
 */
export function paletteCssVars(tokens: Record<string, string>): Record<string, string> {
  return {
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
    '--ys-onPaperEm':   tokens.onPaperEm,
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
}

/**
 * Apply a palette's tokens as CSS custom properties on a DOM element.
 * Also sets them on `document.documentElement` so `body` and other
 * full-page elements outside `.cw-market` follow the same colourway.
 */
export function applyPaletteCssVars(
  el: HTMLElement,
  tokens: Record<string, string>,
) {
  const map = paletteCssVars(tokens)
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
