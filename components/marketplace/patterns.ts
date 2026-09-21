/**
 * Marketplace background patterns — ONE pure registry.
 *
 * Reliability contract (MARKETPLACE-PALETTE-FLORAL-RELIABILITY):
 *   - This module is the only place a motif's CSS, opacity ceiling, tile size
 *     and label are defined. ThemePicker, PatternPicker, the palette provider
 *     and the blocking boot script all read from here, so the contract cannot
 *     drift between two pickers.
 *   - Nothing injects a <style> tag any more. `patternCssVars()` returns the
 *     custom properties the provider writes on documentElement and on every
 *     mounted .cw-market root; the canvas rule (.cw-market::before) consumes
 *     them.
 *   - Persisted ids stay stable (`ys-marketplace-pattern`) so saved
 *     preferences survive; only the labels and the motif artwork are refined.
 *
 * Design contract (botanical family):
 *   - Every motif is a layered CSS gradient stack: no images, no SVG, no
 *     animation, no per-frame JS.
 *   - Motifs mix from palette variables (--ys-onPaper, --ys-moss,
 *     --ys-indigo), so switching the colour palette re-tints the floral
 *     texture instead of leaving pasted-on decoration.
 *   - `opacity` is a ceiling applied by the canvas rule, so no motif can
 *     reduce card/text legibility.
 */

export type PatternId =
  | 'none'
  | 'linen'
  | 'dots'
  | 'diagonal'
  | 'woodgrain'
  | 'crosshatch'
  | 'diamonds'

export interface PatternDef {
  id: PatternId
  /** Botanical label. Ids are persisted; labels are not. */
  label: string
  /** One-line meaning shown as a tooltip / aria hint. */
  description: string
  emoji: string
  /** Layered CSS background-image values. Empty for `none`. */
  layers: string[]
  backgroundSize: string
  backgroundPosition: string
  /** Ceiling for the whole motif layer (never above PATTERN_OPACITY_CEILING). */
  opacity: number
}

/** localStorage key — unchanged so saved preferences survive. */
export const MARKET_PATTERN_STORAGE_KEY = 'ys-marketplace-pattern'

/** Clean paper — the existing default (ThemePicker's unset fallback). */
export const DEFAULT_PATTERN_ID: PatternId = 'none'

/**
 * Hard ceiling for the motif layer. Even the densest motif stays a whisper of
 * texture behind cards so text contrast is never reduced on open paper.
 */
export const PATTERN_OPACITY_CEILING = 0.55

/** Palette-aware ink / botanical green / action accent mixes. */
const ink = (percent: number) =>
  `color-mix(in srgb, var(--ys-onPaper, #0F172A) ${percent}%, transparent)`
const moss = (percent: number) =>
  `color-mix(in srgb, var(--ys-moss, #3F5A28) ${percent}%, transparent)`
const accent = (percent: number) =>
  `color-mix(in srgb, var(--ys-indigo, #111827) ${percent}%, transparent)`

/**
 * Persisted pattern ids and their refined botanical motifs. Ids are frozen:
 * `none | linen | dots | diagonal | woodgrain | crosshatch | diamonds`.
 */
export const PATTERNS: PatternDef[] = [
  {
    id: 'none',
    label: 'Solid',
    description: 'Clean paper — no texture',
    emoji: '◻️',
    layers: [],
    backgroundSize: 'auto',
    backgroundPosition: '0 0',
    opacity: 0,
  },
  {
    id: 'linen',
    label: 'Petal Linen',
    description: 'Paper weave with pressed petal marks',
    emoji: '🌸',
    layers: [
      `repeating-linear-gradient(0deg, ${ink(4)} 0 1px, transparent 1px 6px)`,
      `repeating-linear-gradient(90deg, ${ink(3)} 0 1px, transparent 1px 7px)`,
      `radial-gradient(ellipse 4.5px 2px at 30% 36%, ${moss(11)} 0 62%, transparent 74%)`,
      `radial-gradient(ellipse 3.5px 1.6px at 74% 71%, ${moss(8)} 0 60%, transparent 72%)`,
    ],
    backgroundSize: 'auto, auto, 104px 98px, 138px 124px',
    backgroundPosition: '0 0, 0 0, 0 0, 26px 34px',
    opacity: 0.5,
  },
  {
    id: 'dots',
    label: 'Bud Scatter',
    description: 'Tiny buds and pollen points',
    emoji: '🌱',
    layers: [
      `radial-gradient(circle at 31% 33%, ${moss(34)} 0 1px, transparent 1.5px)`,
      `radial-gradient(circle at 73% 68%, ${ink(18)} 0 0.9px, transparent 1.4px)`,
      `radial-gradient(circle at 58% 18%, ${moss(17)} 0 0.8px, transparent 1.3px)`,
    ],
    backgroundSize: '23px 23px, 23px 23px, 37px 31px',
    backgroundPosition: '0 0, 11px 12px, 6px 15px',
    opacity: 0.5,
  },
  {
    id: 'diagonal',
    label: 'Vine Trails',
    description: 'Restrained diagonal stems and leaves',
    emoji: '🌿',
    layers: [
      `repeating-linear-gradient(135deg, ${moss(17)} 0 1px, transparent 1px 15px)`,
      `repeating-linear-gradient(135deg, transparent 0 5px, ${ink(8)} 5px 7.5px, transparent 7.5px 15px)`,
      `repeating-linear-gradient(65deg, ${moss(10)} 0 1px, transparent 1px 21px)`,
    ],
    backgroundSize: 'auto',
    backgroundPosition: '0 0',
    opacity: 0.42,
  },
  {
    id: 'woodgrain',
    label: 'Pressed Stems',
    description: 'Organic pressed-stem texture',
    emoji: '🍃',
    layers: [
      `repeating-linear-gradient(91deg, ${moss(14)} 0 1.3px, transparent 1.3px 7px)`,
      `repeating-linear-gradient(89deg, ${ink(6)} 0 1px, transparent 1px 11px)`,
      `repeating-linear-gradient(2deg, ${moss(7)} 0 1px, transparent 1px 16px)`,
    ],
    backgroundSize: 'auto',
    backgroundPosition: '0 0, 3px 0, 0 0',
    opacity: 0.4,
  },
  {
    id: 'crosshatch',
    label: 'Garden Trellis',
    description: 'Botanical trellis with leaf knots',
    emoji: '🪴',
    layers: [
      `repeating-linear-gradient(45deg, ${moss(14)} 0 1.2px, transparent 1.2px 15px)`,
      `repeating-linear-gradient(-45deg, ${moss(14)} 0 1.2px, transparent 1.2px 15px)`,
      `radial-gradient(circle at 50% 50%, ${ink(11)} 0 1.1px, transparent 1.6px)`,
    ],
    backgroundSize: 'auto, auto, 21px 21px',
    backgroundPosition: '0 0, 0 0, 0 0',
    opacity: 0.4,
  },
  {
    id: 'diamonds',
    label: 'Bloom Lattice',
    description: 'Small petal blooms on a lattice',
    emoji: '🌼',
    layers: [
      `radial-gradient(circle at 50% 25%, ${moss(22)} 0 1.5px, transparent 2.1px)`,
      `radial-gradient(circle at 50% 75%, ${moss(20)} 0 1.5px, transparent 2.1px)`,
      `radial-gradient(circle at 25% 50%, ${accent(16)} 0 1.4px, transparent 2px)`,
      `radial-gradient(circle at 75% 50%, ${accent(16)} 0 1.4px, transparent 2px)`,
      `radial-gradient(circle at 50% 50%, ${ink(14)} 0 0.8px, transparent 1.2px)`,
    ],
    backgroundSize: '27px 27px',
    backgroundPosition: '0 0',
    opacity: 0.42,
  },
]

export const PATTERN_IDS: PatternId[] = PATTERNS.map((p) => p.id)

/** Custom properties consumed by the .cw-market::before canvas rule. */
export const PATTERN_CSS_VARS = [
  '--ys-pattern-image',
  '--ys-pattern-size',
  '--ys-pattern-position',
  '--ys-pattern-opacity',
] as const

export function isPatternId(value: unknown): value is PatternId {
  return typeof value === 'string' && PATTERN_IDS.includes(value as PatternId)
}

/** Never throws: an unknown / missing id resolves to clean paper. */
export function getPattern(id: string | null | undefined): PatternDef {
  return PATTERNS.find((p) => p.id === id) ?? PATTERNS[0]
}

export function getPatternImage(id: string | null | undefined): string {
  const def = getPattern(id)
  return def.layers.length ? def.layers.join(', ') : 'none'
}

export function getPatternOpacity(id: string | null | undefined): number {
  return getPattern(id).opacity
}

export function getPatternBackgroundSize(id: string | null | undefined): string {
  return getPattern(id).backgroundSize
}

export function getPatternPosition(id: string | null | undefined): string {
  return getPattern(id).backgroundPosition
}

/**
 * The complete DOM contract for a motif. The provider writes these keys on
 * documentElement AND on every mounted .cw-market root; the boot script emits
 * the same values before hydration.
 */
export function patternCssVars(id: string | null | undefined): Record<string, string> {
  return {
    '--ys-pattern-image': getPatternImage(id),
    '--ys-pattern-size': getPatternBackgroundSize(id),
    '--ys-pattern-position': getPatternPosition(id),
    '--ys-pattern-opacity': String(getPatternOpacity(id)),
  }
}

/** [image, size, position, opacity] — compact shape embedded in the boot script. */
export type PatternBootEntry = [string, string, string, number]

/** Build-time snapshot used by the blocking boot script (no drift possible). */
export function patternBootData(): Record<string, PatternBootEntry> {
  const out: Record<string, PatternBootEntry> = {}
  for (const def of PATTERNS) {
    out[def.id] = [
      getPatternImage(def.id),
      def.backgroundSize,
      def.backgroundPosition,
      def.opacity,
    ]
  }
  return out
}
