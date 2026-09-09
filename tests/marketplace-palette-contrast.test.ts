/**
 * Marketplace palette contrast gate (WCAG AA).
 *
 * Role matrix — light-professional chrome matching Portal Messages:
 *
 *   LIGHT chrome   (paper / paper2 / paper3 / footer)
 *     → onPaper / ink     (body copy, headings, nav)
 *     → onPaperSoft       (secondary copy; alpha-blended over the surface)
 *     → onPaperEm / gold  (emphasis, eyebrows)
 *     → inkMid / inkSoft  (meta)
 *     → indigo / teal / brick / moss / star  (links, badges, ratings)
 *
 *   LIGHT cards    (vellum / cream)
 *     → same dark-ink set as chrome
 *
 *   ACCENT fills   (indigo / indigoDeep / teal / tealDeep / brick / moss / ink)
 *     → #FFFFFF labels (buttons, selected chips)
 *
 * Floor: 4.5:1 for all normal-size text. No large-text (3:1) exceptions.
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

const LIGHT_CHROME = ['paper', 'paper2', 'paper3', 'footer'] as const
const LIGHT_CARDS = ['vellum', 'cream'] as const
const DARK_TEXT = ['onPaper', 'onPaperEm', 'ink', 'inkMid', 'inkSoft', 'gold', 'star'] as const
const ACCENT_TEXT = ['indigo', 'teal', 'brick', 'moss'] as const
const ACCENT_FILLS = ['indigo', 'indigoDeep', 'teal', 'tealDeep', 'brick', 'moss', 'ink'] as const

describe('marketplace palette contrast (WCAG AA ≥ 4.5:1)', () => {
  it('has palettes to test', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(6)
  })

  for (const palette of PALETTES) {
    describe(palette.label, () => {
      const t = palette.tokens

      it('keeps chrome and cards light (no saturated shell flood)', () => {
        for (const surface of [...LIGHT_CHROME, ...LIGHT_CARDS]) {
          const [r, g, b] = parseHex(t[surface])
          const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
          expect(luma).toBeGreaterThan(0.78)
        }
      })

      for (const surface of [...LIGHT_CHROME, ...LIGHT_CARDS]) {
        for (const text of DARK_TEXT) {
          it(`${text} on ${surface} ≥ 4.5:1`, () => {
            const ratio = contrastRatio(t[text], t[surface])
            if (ratio < AA) {
              console.warn(`${palette.label}: ${text} ${t[text]} on ${surface} ${t[surface]} = ${ratio.toFixed(2)}:1`)
            }
            expect(ratio).toBeGreaterThanOrEqual(AA)
          })
        }

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

      for (const surface of LIGHT_CHROME) {
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

      for (const fill of ACCENT_FILLS) {
        it(`white on ${fill} ≥ 4.5:1 (button labels)`, () => {
          const ratio = contrastRatio('#FFFFFF', t[fill])
          if (ratio < AA) {
            console.warn(`${palette.label}: white on ${fill} ${t[fill]} = ${ratio.toFixed(2)}:1`)
          }
          expect(ratio).toBeGreaterThanOrEqual(AA)
        })
      }
    })
  }
})
