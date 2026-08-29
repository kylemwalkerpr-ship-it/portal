/**
 * Marketplace palette contrast gate (WCAG AA).
 *
 * Role matrix — every token pair actually used in the market UI:
 *
 *   DARK surfaces  (paper / paper2 / paper3 / footer)
 *     → onPaper            (body copy, headings, nav)
 *     → onPaperSoft        (secondary copy; alpha-blended over the surface,
 *                           tested at the exact shipped alpha)
 *     → gold               (light accent: eyebrows, hero italics, prices)
 *     → #FFFFFF            (labels on solid accent fills that sit on dark
 *                           paper, e.g. seller CTA card)
 *
 *   LIGHT surfaces (vellum / cream)
 *     → ink / inkMid / inkSoft          (body / meta / muted copy)
 *     → star                            (ratings)
 *     → indigo / teal / brick / moss    (links, badges, accent text)
 *
 *   ACCENT fills   (indigo / indigoDeep / teal / tealDeep / brick / moss /
 *                   ink / inkSoft — dual-role tokens)
 *     → #FFFFFF and onPaper labels (buttons, chips, disabled upload CTAs)
 *
 * Floor: 4.5:1 for all normal-size text. No large-text (3:1) exceptions are
 * relied on: the smallest accent copy in the UI is 9–11px bold, which is
 * normal-size text under WCAG.
 *
 * `gold` is intentionally NOT required to pass on light surfaces (its role
 * is dark-surface-only) and `star` NOT on dark surfaces (light-surface-only)
 * — components that violated that split were migrated to the correct token.
 */
import { PALETTES } from '../components/marketplace/palettes'

// ── colour math ──────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (full.length !== 6) throw new Error(`Unsupported colour: ${hex}`)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function parseRgba(value: string): { r: number; g: number; b: number; a: number } {
  const m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s]+([\d.]+))?\s*\)/)
  if (!m) throw new Error(`Unsupported colour: ${value}`)
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  }
}

/** Blend src over dst (both parsed colours), returning an sRGB triple. */
function blendOver(src: { r: number; g: number; b: number; a: number }, dst: [number, number, number]): [number, number, number] {
  return [
    Math.round(src.r * src.a + dst[0] * (1 - src.a)),
    Math.round(src.g * src.a + dst[1] * (1 - src.a)),
    Math.round(src.b * src.a + dst[2] * (1 - src.a)),
  ]
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** WCAG relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(parseHex(fg))
  const l2 = luminance(parseHex(bg))
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ── the gate ─────────────────────────────────────────────────────────────────

const AA = 4.5

const DARK_SURFACES = ['paper', 'paper2', 'paper3', 'footer'] as const
const LIGHT_SURFACES = ['vellum', 'cream'] as const
const ACCENT_FILLS = ['indigo', 'indigoDeep', 'teal', 'tealDeep', 'brick', 'moss', 'ink', 'inkSoft'] as const
const ACCENT_TEXT = ['indigo', 'teal', 'brick', 'moss'] as const

describe('marketplace palette contrast (WCAG AA ≥ 4.5:1)', () => {
  it('has palettes to test', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(6)
  })

  for (const palette of PALETTES) {
    describe(palette.label, () => {
      const t = palette.tokens

      // ── DARK surfaces ──────────────────────────────────────────────────

      for (const surface of DARK_SURFACES) {
        it(`onPaper on ${surface} ≥ 4.5:1`, () => {
          const ratio = contrastRatio(t.onPaper, t[surface])
          if (ratio < AA) {
            console.warn(`${palette.label}: onPaper ${t.onPaper} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })

        it(`white on ${surface} ≥ 4.5:1 (hardcoded labels on dark)`, () => {
          expect(contrastRatio('#FFFFFF', t[surface])).toBeGreaterThanOrEqual(AA)
        })

        // gold is the light-on-dark accent (eyebrows, hero italics, prices)
        it(`gold on ${surface} ≥ 4.5:1`, () => {
          const ratio = contrastRatio(t.gold, t[surface])
          if (ratio < AA) {
            console.warn(`${palette.label}: gold ${t.gold} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })
      }

      // onPaperSoft is secondary text — it is alpha-blended over the paper
      // surface, so test the BLENDED result at the exact alpha shipped,
      // against every dark surface it appears on.
      for (const surface of DARK_SURFACES) {
        it(`onPaperSoft blended over ${surface} ≥ 4.5:1`, () => {
          const soft = parseRgba(t.onPaperSoft)
          const blended = toHex(blendOver(soft, parseHex(t[surface])))
          const ratio = contrastRatio(blended, t[surface])
          if (ratio < AA) {
            console.warn(`${palette.label}: onPaperSoft ${t.onPaperSoft} (→ ${blended}) on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })
      }

      // ── LIGHT surfaces ─────────────────────────────────────────────────

      for (const surface of LIGHT_SURFACES) {
        for (const text of ['ink', 'inkMid', 'inkSoft'] as const) {
          it(`${text} on ${surface} ≥ 4.5:1`, () => {
            const ratio = contrastRatio(t[text], t[surface])
            if (ratio < AA) {
              console.warn(`${palette.label}: ${text} ${t[text]} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
            }
            expect(ratio).toBeGreaterThanOrEqual(AA)
          })
        }

        // star is the dark-on-light accent (ratings on cards)
        it(`star on ${surface} ≥ 4.5:1`, () => {
          const ratio = contrastRatio(t.star, t[surface])
          if (ratio < AA) {
            console.warn(`${palette.label}: star ${t.star} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })

        // accent tokens are used as link/badge text on light cards
        for (const text of ACCENT_TEXT) {
          it(`${text} on ${surface} ≥ 4.5:1`, () => {
            const ratio = contrastRatio(t[text], t[surface])
            if (ratio < AA) {
              console.warn(`${palette.label}: ${text} ${t[text]} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
            }
            expect(ratio).toBeGreaterThanOrEqual(AA)
          })
        }
      }

      // ── ACCENT fills carry white AND onPaper labels (buttons, chips) ───

      for (const fill of ACCENT_FILLS) {
        it(`white on ${fill} ≥ 4.5:1 (button labels)`, () => {
          const ratio = contrastRatio('#FFFFFF', t[fill])
          if (ratio < AA) {
            console.warn(`${palette.label}: white on ${fill} ${t[fill]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })

        it(`onPaper on ${fill} ≥ 4.5:1`, () => {
          const ratio = contrastRatio(t.onPaper, t[fill])
          if (ratio < AA) {
            console.warn(`${palette.label}: onPaper ${t.onPaper} on ${fill} ${t[fill]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })
      }
    })
  }
})
