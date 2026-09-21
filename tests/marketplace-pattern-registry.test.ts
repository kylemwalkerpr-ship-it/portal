/**
 * MARKETPLACE-PALETTE-FLORAL-RELIABILITY — pattern registry + canvas contract.
 *
 * 1. Persisted pattern ids are frozen (localStorage migration safety).
 * 2. Every non-none motif generates valid, non-empty, image-free CSS that
 *    mixes from palette variables, and its opacity stays under a safe ceiling.
 * 3. Botanical labels/descriptions are unique and meaningful.
 * 4. The runtime #ys-pattern-override <style> writer is gone and the canvas
 *    (.cw-market::before) consumes the --ys-pattern-* variables instead.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_PATTERN_ID,
  MARKET_PATTERN_STORAGE_KEY,
  PATTERNS,
  PATTERN_CSS_VARS,
  PATTERN_IDS,
  PATTERN_OPACITY_CEILING,
  getPattern,
  getPatternImage,
  getPatternOpacity,
  isPatternId,
  patternBootData,
  patternCssVars,
} from '../components/marketplace/patterns'

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')
const exists = (file: string) => fs.existsSync(path.join(root, file))

const GRADIENT_FUNCTIONS = [
  'linear-gradient(',
  'radial-gradient(',
  'repeating-linear-gradient(',
  'repeating-radial-gradient(',
  'conic-gradient(',
]

describe('marketplace pattern registry', () => {
  it('preserves every persisted pattern id', () => {
    expect(PATTERN_IDS).toEqual([
      'none',
      'linen',
      'dots',
      'diagonal',
      'woodgrain',
      'crosshatch',
      'diamonds',
    ])
    expect(DEFAULT_PATTERN_ID).toBe('none')
    // Storage key is unchanged so saved preferences survive the refinement.
    expect(MARKET_PATTERN_STORAGE_KEY).toBe('ys-marketplace-pattern')
  })

  it('keeps botanical labels / descriptions unique and meaningful', () => {
    const labels = PATTERNS.map((p) => p.label)
    expect(new Set(labels).size).toBe(labels.length)
    expect(labels).toEqual([
      'Solid',
      'Petal Linen',
      'Bud Scatter',
      'Vine Trails',
      'Pressed Stems',
      'Garden Trellis',
      'Bloom Lattice',
    ])
    const descriptions = PATTERNS.map((p) => p.description)
    expect(new Set(descriptions).size).toBe(descriptions.length)
    for (const def of PATTERNS) {
      expect(def.description.length).toBeGreaterThan(10)
      expect(def.description.toLowerCase()).not.toContain('wood')
      expect(def.description.toLowerCase()).not.toContain('crosshatch')
    }
  })

  it('generates an empty motif for Solid and non-empty CSS for every other id', () => {
    expect(getPattern('none').layers).toEqual([])
    expect(getPatternImage('none')).toBe('none')
    expect(getPatternOpacity('none')).toBe(0)

    for (const def of PATTERNS.filter((p) => p.id !== 'none')) {
      const image = getPatternImage(def.id)
      expect(image.length).toBeGreaterThan(0)
      expect(image).not.toBe('none')
      // Layered gradients only: no image assets, no SVG payload.
      expect(image).not.toContain('url(')
      expect(image).not.toContain('<svg')
      for (const layer of def.layers) {
        expect(GRADIENT_FUNCTIONS.some((fn) => layer.startsWith(fn))).toBe(true)
        expect(layer).not.toContain('!important')
        expect(balanced(layer)).toBe(true)
      }
      // Motifs must inherit the palette so they re-tint with the colourway.
      expect(image).toMatch(/var\(--ys-(onPaper|moss|indigo)/)
      expect(def.backgroundSize.length).toBeGreaterThan(0)
      expect(def.backgroundPosition.length).toBeGreaterThan(0)
    }
  })

  it('keeps every motif opacity inside the safe ceiling', () => {
    expect(PATTERN_OPACITY_CEILING).toBeGreaterThan(0)
    expect(PATTERN_OPACITY_CEILING).toBeLessThanOrEqual(0.6)
    for (const def of PATTERNS) {
      expect(def.opacity).toBeGreaterThanOrEqual(0)
      expect(def.opacity).toBeLessThanOrEqual(PATTERN_OPACITY_CEILING)
    }
  })

  it('resolves unknown ids to Solid instead of throwing', () => {
    for (const bad of [null, undefined, '', 'does-not-exist']) {
      expect(getPattern(bad).id).toBe(DEFAULT_PATTERN_ID)
      expect(getPatternImage(bad)).toBe('none')
      expect(getPatternOpacity(bad)).toBe(0)
    }
    expect(isPatternId('linen')).toBe(true)
    expect(isPatternId('wood')).toBe(false)
    expect(isPatternId(7)).toBe(false)
  })

  it('exposes the complete CSS-variable contract for every motif', () => {
    expect(PATTERN_CSS_VARS).toEqual([
      '--ys-pattern-image',
      '--ys-pattern-size',
      '--ys-pattern-position',
      '--ys-pattern-opacity',
    ])
    for (const def of PATTERNS) {
      const vars = patternCssVars(def.id)
      expect(Object.keys(vars)).toEqual([...PATTERN_CSS_VARS])
      expect(vars['--ys-pattern-image']).toBe(getPatternImage(def.id))
      expect(vars['--ys-pattern-size']).toBe(def.backgroundSize)
      expect(vars['--ys-pattern-position']).toBe(def.backgroundPosition)
      expect(Number(vars['--ys-pattern-opacity'])).toBe(def.opacity)
      for (const value of Object.values(vars)) expect(value.length).toBeGreaterThan(0)
    }
  })

  it('hands the boot script exactly the registry values (no drift)', () => {
    const boot = patternBootData()
    expect(Object.keys(boot)).toEqual([...PATTERN_IDS])
    for (const def of PATTERNS) {
      expect(boot[def.id]).toEqual([
        getPatternImage(def.id),
        def.backgroundSize,
        def.backgroundPosition,
        def.opacity,
      ])
    }
  })
})

describe('pattern canvas contract (CSS variables, no competing writer)', () => {
  const RUNTIME_SOURCES = [
    'components/marketplace/ThemePicker.tsx',
    'components/marketplace/PatternPicker.tsx',
    'components/marketplace/MarketplaceShell.tsx',
    'components/marketplace/PalettePicker.tsx',
    'components/marketplace/market-theme.ts',
    'contexts/palette-context.tsx',
  ]

  it('leaves no runtime #ys-pattern-override style writer behind', () => {
    for (const file of RUNTIME_SOURCES) {
      const src = read(file)
      expect(`${file}: ${src}`).not.toContain('ys-pattern-override')
      expect(`${file}: ${src}`).not.toContain("createElement('style')")
    }
    // And nothing else in the shipped app injects it either.
    expect(exists('components/marketplace/PatternPicker.tsx')).toBe(true)
    const offenders = collectSourceFiles(['app', 'components', 'contexts', 'lib'])
      .filter((file) => read(file).includes('ys-pattern-override'))
    expect(offenders).toEqual([])
  })

  it('has .cw-market::before consume the theme pattern variables', () => {
    const canvasRules = [
      read('components/marketplace/MarketplaceShell.tsx'),
      read('app/marketplace/marketplace-landing.css'),
    ]
    for (const src of canvasRules) {
      const rule = src.match(/\.cw-market::before\s*\{[\s\S]*?\}/)?.[0] ?? ''
      expect(rule.length).toBeGreaterThan(0)
      expect(rule).toContain('background-image: var(--ys-pattern-image, none)')
      expect(rule).toContain('background-size: var(--ys-pattern-size, auto)')
      expect(rule).toContain('background-position: var(--ys-pattern-position, 0 0)')
      expect(rule).toContain('opacity: var(--ys-pattern-opacity, 0.22)')
      expect(rule).toContain('pointer-events: none')
      // The paper layer stays transparent so cards are never tinted.
      expect(rule).toContain('background-color: transparent')
    }
  })

  it('keeps the palette tokens off .cw-market until the boot script has run', () => {
    const globals = read('app/globals.css')
    // A root-level token declaration would beat the boot-scripted <html>
    // values and flash the shipped default on every remount.
    expect(globals).toMatch(/html:not\(\[data-ys-palette\]\) \.cw-market\s*\{[\s\S]*?--ys-paper: #F7F8FA/)
    const ungated = globals.match(/(^|\n)\.cw-market\s*\{([\s\S]*?)\}/)?.[2] ?? ''
    expect(ungated).not.toContain('--ys-paper:')
    expect(ungated).not.toContain('--ys-onPaper:')
  })
})

// ── helpers ──────────────────────────────────────────────────────────────────

function balanced(value: string): boolean {
  let depth = 0
  for (const ch of value) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

function collectSourceFiles(dirs: string[]): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (/\.(ts|tsx|css)$/.test(entry.name)) out.push(rel)
    }
  }
  for (const dir of dirs) walk(dir)
  return out
}
