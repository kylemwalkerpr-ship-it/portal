/**
 * Marketplace palette contrast gate.
 *
 * The marketplace design contract has exactly two surface classes:
 *   DARK  (paper / paper2 / paper3 / footer) → light text (onPaper)
 *   LIGHT (vellum / cream)                   → dark text  (ink)
 * This test fails CI when ANY palette breaks the WCAG AA 4.5:1 floor for
 * its surface/text pairs — the mechanical guarantee behind "legibility is
 * paramount".
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

describe('marketplace palette contrast (WCAG AA ≥ 4.5:1)', () => {
  it('has palettes to test', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(6)
  })

  for (const palette of PALETTES) {
    describe(palette.label, () => {
      const t = palette.tokens

      // DARK surfaces carry the light onPaper text — the header, nav,
      // page background, and footer all read through these pairs.
      for (const surface of ['paper', 'paper2', 'paper3', 'footer'] as const) {
        it(`onPaper on ${surface} ≥ 4.5:1`, () => {
          const ratio = contrastRatio(t.onPaper, t[surface])
          if (ratio < AA) {
            console.warn(`${palette.label}: onPaper ${t.onPaper} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })
      }

      // onPaperSoft is secondary text — it is alpha-blended over the paper
      // surface, so test the BLENDED result at the exact alpha shipped.
      it('onPaperSoft blended over paper ≥ 4.5:1', () => {
        const soft = parseRgba(t.onPaperSoft)
        const blended = toHex(blendOver(soft, parseHex(t.paper)))
        const ratio = contrastRatio(blended, t.paper)
        if (ratio < AA) {
          console.warn(`${palette.label}: onPaperSoft ${t.onPaperSoft} (→ ${blended}) on ${t.paper} = ${ratio.toFixed(2)}:1`)
        }
        expect(ratio).toBeGreaterThanOrEqual(AA)
      })

      // LIGHT card surfaces carry dark ink — every vellum/cream card.
      for (const surface of ['vellum', 'cream'] as const) {
        it(`ink on ${surface} ≥ 4.5:1`, () => {
          const ratio = contrastRatio(t.ink, t[surface])
          if (ratio < AA) {
            console.warn(`${palette.label}: ink ${t.ink} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })
      }
    })
  }
})
