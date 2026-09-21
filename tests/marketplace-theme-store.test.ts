/**
 * MARKETPLACE-PALETTE-FLORAL-RELIABILITY — shared theme store + boot script.
 *
 * The user report was "palette and pattern work intermittently". The causes
 * were two independent pattern writers (desktop + mobile-drawer ThemePicker),
 * a duplicated pattern registry, and a root-level token declaration that beat
 * the first-paint boot values until React hydrated.
 *
 * These tests pin the replacement contract:
 *   1. ONE store: two mounted pickers read the same snapshot and cannot
 *      diverge; one mutation notifies each consumer exactly once.
 *   2. ONE writer: palette tokens + --ys-pattern-* land on documentElement and
 *      on EVERY mounted .cw-market root; nothing injects a <style> tag.
 *   3. Persistence/remount: select → remount → same palette + pattern, with no
 *      default-frame write in between.
 *   4. Boot: first paint restores both keys, invalid values fall back.
 */
import { PALETTES, PALETTE_STORAGE_KEY } from '../components/marketplace/palettes'
import {
  MARKET_PATTERN_STORAGE_KEY,
  PATTERNS,
  getPatternBackgroundSize,
  getPatternImage,
  getPatternOpacity,
  getPatternPosition,
  patternBootData,
} from '../components/marketplace/patterns'
import { buildPaletteBootScript } from '../components/marketplace/palette-boot'

const DEFAULT_PALETTE_PAPER = PALETTES[0].tokens.paper

// ── DOM + storage stub (jest env is `node`) ──────────────────────────────────

function makeElement(kind: string, writes: string[]) {
  const sets: Record<string, string> = {}
  const attrs: Record<string, string> = {}
  return {
    kind,
    sets,
    attrs,
    style: {
      setProperty: (key: string, value: string) => {
        sets[key] = value
        writes.push(`${kind}:${key}=${value}`)
      },
      backgroundColor: '',
    },
    setAttribute: (key: string, value: string) => { attrs[key] = value },
  }
}

function setup(stored: Record<string, string> = {}, rootCount = 2) {
  const writes: string[] = []
  const html = makeElement('html', writes)
  const body = makeElement('body', writes)
  const roots = Array.from({ length: rootCount }, (_v, i) => makeElement(`root${i}`, writes))
  const storage: Record<string, string> = { ...stored }
  const createElement = jest.fn(() => makeElement('created', writes))
  const addEventListener = jest.fn()

  ;(global as any).window = {
    localStorage: {
      getItem: (key: string) => (key in storage ? storage[key] : null),
      setItem: (key: string, value: string) => { storage[key] = value },
    },
    addEventListener,
    requestAnimationFrame: (fn: () => void) => { fn(); return 1 },
  }
  ;(global as any).document = {
    documentElement: html,
    body,
    createElement,
    querySelector: (selector: string) => (selector === '.cw-market' ? (roots[0] ?? null) : null),
    querySelectorAll: (selector: string) => (selector === '.cw-market' ? roots : []),
  }

  return { writes, html, body, roots, storage, createElement, addEventListener }
}

type Store = typeof import('../components/marketplace/market-theme')

/** A fresh module instance = a fresh page load / provider mount. */
function loadStore(): Store {
  let mod: Store | undefined
  jest.isolateModules(() => {
    mod = require('../components/marketplace/market-theme') as Store
  })
  return mod as Store
}

const palette = (name: string) => PALETTES.find((p) => p.name === name)!

// ── validation ───────────────────────────────────────────────────────────────

describe('market theme preference validation', () => {
  it('falls back to the shipped default for unknown / missing values', () => {
    setup()
    const store = loadStore()
    expect(store.resolveMarketThemePreference(null)).toEqual({ paletteName: 'mahogany', patternId: 'none' })
    expect(store.resolveMarketThemePreference({ paletteName: 'ghost', patternId: 'ghost' }))
      .toEqual({ paletteName: 'mahogany', patternId: 'none' })
    expect(store.resolveMarketThemePreference({ paletteName: 'santorini', patternId: 'linen' }))
      .toEqual({ paletteName: 'santorini', patternId: 'linen' })
  })

  it('reads persisted ids and ignores invalid stored values', () => {
    setup({ [PALETTE_STORAGE_KEY]: 'ghost', [MARKET_PATTERN_STORAGE_KEY]: 'ghost' })
    expect(loadStore().readStoredMarketTheme()).toEqual({ paletteName: 'mahogany', patternId: 'none' })

    setup({ [PALETTE_STORAGE_KEY]: 'modern-luxury', [MARKET_PATTERN_STORAGE_KEY]: 'woodgrain' })
    expect(loadStore().readStoredMarketTheme()).toEqual({ paletteName: 'modern-luxury', patternId: 'woodgrain' })
  })
})

// ── useSyncExternalStore hydration ordering ───────────────────────────────────

describe('external-store hydration lifecycle', () => {
  it('notifies an already-subscribed consumer when persisted theme is adopted', async () => {
    setup({
      [PALETTE_STORAGE_KEY]: 'luxury-classic',
      [MARKET_PATTERN_STORAGE_KEY]: 'diamonds',
    })
    const store = loadStore()

    expect(store.getMarketThemeSnapshot()).toEqual({ paletteName: 'mahogany', patternId: 'none' })

    const seen: Array<[string, string]> = []
    const unsubscribe = store.subscribeMarketTheme(() => {
      const snap = store.getMarketThemeSnapshot()
      seen.push([snap.paletteName, snap.patternId])
    })

    // subscribeMarketTheme schedules browser hydration after subscription so
    // React's useSyncExternalStore listener cannot miss the persisted update.
    await Promise.resolve()

    expect(store.getMarketThemeSnapshot()).toEqual({
      paletteName: 'luxury-classic',
      patternId: 'diamonds',
    })
    expect(seen).toEqual([['luxury-classic', 'diamonds']])
    unsubscribe()
  })

  it('does not call an unsubscribed consumer when scheduled hydration runs', async () => {
    setup({
      [PALETTE_STORAGE_KEY]: 'rich-heritage',
      [MARKET_PATTERN_STORAGE_KEY]: 'linen',
    })
    const store = loadStore()
    const listener = jest.fn()
    const unsubscribe = store.subscribeMarketTheme(listener)
    unsubscribe()

    await Promise.resolve()

    expect(listener).not.toHaveBeenCalled()
    expect(store.getMarketThemeSnapshot()).toEqual({
      paletteName: 'rich-heritage',
      patternId: 'linen',
    })
  })
})

// ── one store, two consumers ─────────────────────────────────────────────────

describe('shared theme store (desktop picker + mobile drawer picker)', () => {
  it('cannot diverge: both consumers see the same snapshot after one mutation', () => {
    const dom = setup()
    const store = loadStore()
    store.hydrateMarketTheme()

    const desktop: Array<[string, string]> = []
    const drawer: Array<[string, string]> = []
    store.subscribeMarketTheme(() => {
      const snap = store.getMarketThemeSnapshot()
      desktop.push([snap.paletteName, snap.patternId])
    })
    store.subscribeMarketTheme(() => {
      const snap = store.getMarketThemeSnapshot()
      drawer.push([snap.paletteName, snap.patternId])
    })

    store.setMarketThemePreference({ patternId: 'diamonds' })

    expect(desktop).toEqual([['mahogany', 'diamonds']])
    expect(drawer).toEqual([['mahogany', 'diamonds']])
    // Exactly one notification per consumer: no ping-pong between writers.
    expect(desktop).toHaveLength(1)
    // The snapshot is a stable reference between reads (React-safe).
    expect(store.getMarketThemeSnapshot()).toBe(store.getMarketThemeSnapshot())
    expect(dom.html.sets['--ys-pattern-image']).toBe(getPatternImage('diamonds'))
  })

  it('keeps a second provider hydration from resetting the current pattern', () => {
    const dom = setup({ [PALETTE_STORAGE_KEY]: 'luxury-classic', [MARKET_PATTERN_STORAGE_KEY]: 'dots' })
    const store = loadStore()
    store.hydrateMarketTheme()
    store.setMarketThemePreference({ patternId: 'diamonds' })

    // The mobile drawer opens: another consumer mounts and re-hydrates.
    store.hydrateMarketTheme()
    store.subscribeMarketTheme(() => {})()
    store.applyMarketTheme(store.getMarketThemeSnapshot())

    expect(store.getMarketThemeSnapshot().patternId).toBe('diamonds')
    expect(dom.storage[MARKET_PATTERN_STORAGE_KEY]).toBe('diamonds')
    expect(dom.html.sets['--ys-pattern-image']).toBe(getPatternImage('diamonds'))
    expect(dom.html.sets['--ys-pattern-opacity']).toBe(String(getPatternOpacity('diamonds')))
  })

  it('follows another tab that changes only the pattern', () => {
    const dom = setup({ [PALETTE_STORAGE_KEY]: 'santorini', [MARKET_PATTERN_STORAGE_KEY]: 'linen' })
    const store = loadStore()
    store.hydrateMarketTheme()

    const handler = dom.addEventListener.mock.calls.find(([type]) => type === 'storage')?.[1] as
      | ((event: { key: string; newValue: string | null }) => void)
      | undefined
    expect(typeof handler).toBe('function')

    dom.storage[MARKET_PATTERN_STORAGE_KEY] = 'crosshatch'
    handler!({ key: MARKET_PATTERN_STORAGE_KEY, newValue: 'crosshatch' })

    expect(store.getMarketThemeSnapshot()).toEqual({ paletteName: 'santorini', patternId: 'crosshatch' })
    expect(dom.html.sets['--ys-pattern-image']).toBe(getPatternImage('crosshatch'))
    // The palette key was not part of the event, so it must be untouched.
    expect(dom.html.sets['--ys-paper']).toBe(palette('santorini').tokens.paper)
  })
})

// ── one writer, every root ───────────────────────────────────────────────────

describe('theme writer', () => {
  it('paints palette + pattern on <html>, the body and every mounted root', () => {
    const dom = setup({}, 3)
    const store = loadStore()
    store.hydrateMarketTheme()
    store.setMarketThemePreference({ paletteName: 'santorini', patternId: 'crosshatch' })

    const tokens = palette('santorini').tokens
    for (const el of [dom.html, ...dom.roots]) {
      expect(el.sets['--ys-paper']).toBe(tokens.paper)
      expect(el.sets['--ys-indigo']).toBe(tokens.indigo)
      expect(el.sets['--ys-moss']).toBe(tokens.moss)
      expect(el.sets['--ys-pattern-image']).toBe(getPatternImage('crosshatch'))
      expect(el.sets['--ys-pattern-size']).toBe(getPatternBackgroundSize('crosshatch'))
      expect(el.sets['--ys-pattern-position']).toBe(getPatternPosition('crosshatch'))
      expect(el.sets['--ys-pattern-opacity']).toBe(String(getPatternOpacity('crosshatch')))
    }
    expect(dom.html.attrs['data-ys-palette']).toBe('santorini')
    expect(dom.html.attrs['data-ys-pattern']).toBe('crosshatch')
    expect(dom.body.style.backgroundColor).toBe(tokens.paper)
    // No component-level <style> injection survives.
    expect(dom.createElement).not.toHaveBeenCalled()
  })

  it('persists both ids on selection', () => {
    const dom = setup()
    const store = loadStore()
    store.hydrateMarketTheme()
    store.setMarketThemePreference({ paletteName: 'rich-heritage' })
    store.setMarketThemePreference({ patternId: 'woodgrain' })
    expect(dom.storage[PALETTE_STORAGE_KEY]).toBe('rich-heritage')
    expect(dom.storage[MARKET_PATTERN_STORAGE_KEY]).toBe('woodgrain')
  })

  it('is idempotent: re-selecting the current theme does not rewrite storage', () => {
    const dom = setup()
    const store = loadStore()
    store.hydrateMarketTheme()
    store.setMarketThemePreference({ patternId: 'linen' })
    const writesAfterSelect = dom.writes.length
    store.setMarketThemePreference({ patternId: 'linen' })
    expect(dom.writes.length).toBe(writesAfterSelect)
  })
})

// ── persistence / remount ────────────────────────────────────────────────────

describe('persistence and remount', () => {
  const SELECTED = { paletteName: 'rich-heritage', patternId: 'linen' } as const

  it('restores the exact saved palette + pattern when the provider remounts', () => {
    const first = setup()
    const before = loadStore()
    before.hydrateMarketTheme()
    before.setMarketThemePreference(SELECTED)

    // /shop ↔ /marketplace: a new provider mounts against the saved storage and
    // a fresh DOM (no inline styles inherited from the previous tree).
    const after = setup(first.storage)
    const remounted = loadStore()
    remounted.hydrateMarketTheme()

    const tokens = palette(SELECTED.paletteName).tokens
    // The FIRST write after remount is already the saved palette — there is no
    // default frame to flash.
    expect(after.writes[0]).toBe(`html:--ys-paper=${tokens.paper}`)
    expect(after.writes.some((w) => w.includes(DEFAULT_PALETTE_PAPER))).toBe(false)
    for (const el of [after.html, ...after.roots]) {
      expect(el.sets['--ys-paper']).toBe(tokens.paper)
      expect(el.sets['--ys-pattern-image']).toBe(getPatternImage(SELECTED.patternId))
    }
    expect(after.html.attrs['data-ys-palette']).toBe(SELECTED.paletteName)
    expect(after.html.attrs['data-ys-pattern']).toBe(SELECTED.patternId)
    expect(remounted.getMarketThemeSnapshot()).toEqual(SELECTED)
  })

  it('restores a previously saved theme on a cold load (no selection this session)', () => {
    const dom = setup({
      [PALETTE_STORAGE_KEY]: 'modern-luxury',
      [MARKET_PATTERN_STORAGE_KEY]: 'woodgrain',
    })
    loadStore().hydrateMarketTheme()
    const tokens = palette('modern-luxury').tokens
    expect(dom.html.sets['--ys-paper']).toBe(tokens.paper)
    expect(dom.html.sets['--ys-pattern-image']).toBe(getPatternImage('woodgrain'))
    for (const el of dom.roots) {
      expect(el.sets['--ys-pattern-image']).toBe(getPatternImage('woodgrain'))
    }
    expect(dom.writes.some((w) => w.includes(DEFAULT_PALETTE_PAPER))).toBe(false)
  })

  it('drops the market body paint only when no market root is left', () => {
    const dom = setup()
    const store = loadStore()
    store.hydrateMarketTheme()
    store.clearMarketBodyPaint()
    expect(dom.body.style.backgroundColor).toBe('')
  })
})

// ── first-paint boot ─────────────────────────────────────────────────────────

describe('first-paint boot (palette + pattern)', () => {
  it('is valid JavaScript', () => {
    expect(() => new Function(buildPaletteBootScript())).not.toThrow()
  })

  it('restores the saved pattern variables before hydration', () => {
    const dom = setup({
      [PALETTE_STORAGE_KEY]: 'executive',
      [MARKET_PATTERN_STORAGE_KEY]: 'crosshatch',
    })
    new Function(buildPaletteBootScript())()

    expect(dom.html.sets['--ys-pattern-image']).toBe(getPatternImage('crosshatch'))
    expect(dom.html.sets['--ys-pattern-size']).toBe(getPatternBackgroundSize('crosshatch'))
    expect(dom.html.sets['--ys-pattern-position']).toBe(getPatternPosition('crosshatch'))
    expect(dom.html.sets['--ys-pattern-opacity']).toBe(String(getPatternOpacity('crosshatch')))
    expect(dom.html.attrs['data-ys-pattern']).toBe('crosshatch')
    // Roots that already exist in the parsed document get the same values.
    for (const el of dom.roots) {
      expect(el.sets['--ys-pattern-image']).toBe(getPatternImage('crosshatch'))
      expect(el.sets['--ys-paper']).toBe(palette('executive').tokens.paper)
    }
  })

  it('falls back to clean paper for a missing or invalid stored pattern', () => {
    const cases: Array<Record<string, string>> = [
      {},
      { [MARKET_PATTERN_STORAGE_KEY]: '' },
      { [MARKET_PATTERN_STORAGE_KEY]: 'wood' },
      { [MARKET_PATTERN_STORAGE_KEY]: 'DOTS' },
    ]
    for (const stored of cases) {
      const dom = setup(stored)
      new Function(buildPaletteBootScript())()
      expect(dom.html.sets['--ys-pattern-image']).toBe('none')
      expect(dom.html.sets['--ys-pattern-opacity']).toBe('0')
      expect(dom.html.attrs['data-ys-pattern']).toBe('none')
    }
  })

  it('embeds the registry values verbatim so boot and provider cannot drift', () => {
    const script = buildPaletteBootScript()
    expect(script).toContain(MARKET_PATTERN_STORAGE_KEY)
    expect(script).toContain(PALETTE_STORAGE_KEY)
    for (const entry of Object.values(patternBootData())) {
      expect(script).toContain(JSON.stringify(entry))
    }
    // Every persisted id is bootable.
    for (const def of PATTERNS) expect(script).toContain(def.id)
  })
})
