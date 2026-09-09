/**
 * Marketplace design tokens.
 *
 * Every value is a CSS custom-property reference with a fallback to the
 * default Studio (light professional) palette. Paper is a LIGHT chrome
 * surface; onPaper is dark ink. Accent tokens (legacy names indigo / teal)
 * are action colour only — never the page fill.
 */

export const T = {
  paper:       'var(--ys-paper, #F4F6F8)',
  paper2:      'var(--ys-paper2, #EEF1F4)',
  paper3:      'var(--ys-paper3, #E6EAEF)',
  vellum:      'var(--ys-vellum, #FFFFFF)',
  cream:       'var(--ys-cream, #F7F8FA)',
  ink:         'var(--ys-ink, #0F172A)',
  inkMid:      'var(--ys-inkMid, #334155)',
  inkSoft:     'var(--ys-inkSoft, #526072)',
  /** Primary text on LIGHT chrome (header, page, footer, rails). */
  onPaper:     'var(--ys-onPaper, #0F172A)',
  /** Secondary text on light chrome. */
  onPaperSoft: 'var(--ys-onPaperSoft, rgba(15,23,42,0.72))',
  /** Emphasis on light chrome (same family as ink — not a cream highlight). */
  onPaperEm:   'var(--ys-onPaperEm, #0F172A)',
  rule:        'var(--ys-rule, rgba(15,23,42,0.10))',
  ruleSoft:    'var(--ys-ruleSoft, rgba(15,23,42,0.06))',
  /** Legacy token name; semantic role is Marketplace action accent. */
  indigo:      'var(--ys-indigo, #3C3B6E)',
  indigoDeep:  'var(--ys-indigoDeep, #2A2A55)',
  indigoSoft:  'var(--ys-indigoSoft, rgba(60,59,110,0.12))',
  brick:       'var(--ys-brick, #B42318)',
  gold:        'var(--ys-gold, #6B5210)',
  moss:        'var(--ys-moss, #3F5A28)',
  star:        'var(--ys-star, #6B4700)',
  /** Legacy token name; alias of the same action accent. */
  teal:        'var(--ys-teal, #3C3B6E)',
  tealDeep:    'var(--ys-tealDeep, #2A2A55)',
  footer:      'var(--ys-footer, #E8ECF1)',
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
