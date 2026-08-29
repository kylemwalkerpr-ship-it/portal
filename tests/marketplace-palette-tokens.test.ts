/**
 * Palette token plumbing tests.
 *
 * 1. applyPaletteCssVars writes every expected --ys-* key on BOTH the
 *    .cw-market element and document.documentElement, and paints the body.
 * 2. The blocking first-paint boot script (palette-boot.ts) is generated
 *    from the SAME registry (no drift), is valid JS, resolves every stored
 *    palette name, and writes identical values — so hydration is
 *    idempotent and no flash can occur.
 */
import { PALETTES, DEFAULT_PALETTE_NAME } from '../components/marketplace/palettes'
import { applyPaletteCssVars, T } from '../components/marketplace/tokens'
import { buildPaletteBootScript, PALETTE_STORAGE_KEY } from '../components/marketplace/palette-boot'

// ── minimal DOM stub (jest env is `node`) ────────────────────────────────────

type StyleTarget = { style: { setProperty: (k: string, v: string) => void; backgroundColor: string } }

function makeDom(stored: string | null) {
  const htmlSets: Record<string, string> = {}
  const marketSets: Record<string, string> = {}
  const html: StyleTarget & { attrs: Record<string, string> } = {
    style: { setProperty: (k, v) => { htmlSets[k] = v }, backgroundColor: '' },
    attrs: {},
  }
  ;(html as unknown as { setAttribute: (k: string, v: string) => void }).setAttribute =
    (k: string, v: string) => { html.attrs[k] = v }
  const market: StyleTarget = {
    style: { setProperty: (k, v) => { marketSets[k] = v }, backgroundColor: '' },
  }
  const body: StyleTarget = { style: { setProperty: () => {}, backgroundColor: '' } }
  ;(global as any).window = { localStorage: { getItem: () => stored } }
  ;(global as any).document = {
    documentElement: html,
    body,
    querySelector: (sel: string) => (sel === '.cw-market' ? market : null),
  }
  return { html, htmlSets, market, marketSets, body }
}

// ── applyPaletteCssVars ──────────────────────────────────────────────────────

const EXPECTED_KEYS = [
  '--ys-paper', '--ys-paper2', '--ys-paper3', '--ys-vellum', '--ys-cream',
  '--ys-ink', '--ys-inkMid', '--ys-inkSoft', '--ys-onPaper', '--ys-onPaperSoft',
  '--ys-rule', '--ys-ruleSoft', '--ys-indigo', '--ys-indigoDeep', '--ys-indigoSoft',
  '--ys-brick', '--ys-gold', '--ys-moss', '--ys-star', '--ys-teal', '--ys-tealDeep',
  '--ys-footer',
]

describe('applyPaletteCssVars', () => {
  it('tokens.ts exposes exactly the --ys-* keys the applier writes', () => {
    const tKeys = Object.keys(T)
      .filter((k) => k !== 'display' && k !== 'ui' && k !== 'mono')
    expect(new Set(tKeys)).toEqual(new Set(EXPECTED_KEYS.map((k) => k.replace('--ys-', ''))))
    for (const k of tKeys) expect((T as any)[k]).toMatch(/^var\(--ys-/)
  })

  for (const palette of PALETTES) {
    it(`writes all --ys-* keys for ${palette.name} on .cw-market AND <html>, idempotently`, () => {
      const dom = makeDom(null)
      const el = { style: { setProperty: (k: string, v: string) => { dom.marketSets[k] = v } } } as HTMLElement

      applyPaletteCssVars(el, palette.tokens)
      for (const key of EXPECTED_KEYS) {
        expect(dom.marketSets[key]).toBe(palette.tokens[key.replace('--ys-', '')])
        expect(dom.htmlSets[key]).toBe(palette.tokens[key.replace('--ys-', '')])
      }
      expect(dom.body.style.backgroundColor).toBe(palette.tokens.paper)

      // idempotence: applying twice yields identical values (no visible jump)
      applyPaletteCssVars(el, palette.tokens)
      for (const key of EXPECTED_KEYS) {
        expect(dom.marketSets[key]).toBe(palette.tokens[key.replace('--ys-', '')])
      }
    })
  }
})

// ── boot script ──────────────────────────────────────────────────────────────

describe('palette boot script (first-paint, no flash)', () => {
  it('is syntactically valid JavaScript', () => {
    expect(() => new Function(buildPaletteBootScript())).not.toThrow()
  })

  it('embeds every palette name and every token key (no drift from PALETTES)', () => {
    const script = buildPaletteBootScript()
    for (const p of PALETTES) {
      expect(script).toContain(`"${p.name}"`)
      for (const token of Object.keys(p.tokens)) {
        expect(script).toContain(`"${token}":"${p.tokens[token]}"`)
      }
    }
  })

  it('reads the same localStorage key as PaletteProvider', () => {
    expect(buildPaletteBootScript()).toContain(PALETTE_STORAGE_KEY)
  })

  for (const palette of PALETTES) {
    it(`applies ${palette.name} vars, body paint and data attribute from storage`, () => {
      const dom = makeDom(palette.name)
      new Function(buildPaletteBootScript())()
      expect(dom.htmlSets['--ys-paper']).toBe(palette.tokens.paper)
      expect(dom.htmlSets['--ys-gold']).toBe(palette.tokens.gold)
      expect(dom.marketSets['--ys-paper']).toBe(palette.tokens.paper)
      expect(dom.body.style.backgroundColor).toBe(palette.tokens.paper)
      expect(dom.html.attrs['data-ys-palette']).toBe(palette.name)
    })
  }

  it('falls back to the default palette when storage is empty/unknown', () => {
    const fallback = PALETTES.find((p) => p.name === DEFAULT_PALETTE_NAME)!
    for (const stored of [null, 'does-not-exist']) {
      const dom = makeDom(stored)
      new Function(buildPaletteBootScript())()
      expect(dom.htmlSets['--ys-paper']).toBe(fallback.tokens.paper)
      expect(dom.html.attrs['data-ys-palette']).toBe(fallback.name)
    }
  })
})
