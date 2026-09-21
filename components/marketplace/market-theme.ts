/**
 * Marketplace theme preference — ONE state + ONE DOM writer.
 *
 * Reliability contract (MARKETPLACE-PALETTE-FLORAL-RELIABILITY):
 *
 *  1. Palette + pattern live in a single module-level store. Every consumer
 *     (the desktop ThemePicker, the ThemePicker inside the mobile drawer, the
 *     standalone PatternPicker) reads the same snapshot, so two mounted
 *     pickers can never hold divergent pattern state.
 *  2. This module is the only writer. It paints palette tokens and pattern
 *     custom properties on documentElement AND on every mounted .cw-market
 *     root (the landing has nested roots; querySelector used to reach only
 *     the first one), and it paints the body so overscroll matches the paper.
 *  3. Nothing injects a global <style> tag any more; the canvas rule
 *     (.cw-market::before) reads the --ys-pattern-* variables.
 *  4. The blocking boot script (palette-boot.ts) writes the same values from
 *     the same registries before hydration, so a remount (e.g. /shop ↔
 *     /marketplace) restores the saved palette + pattern with no default
 *     flash.
 */
import {
  DEFAULT_PALETTE_NAME,
  PALETTE_STORAGE_KEY,
  PALETTES,
  getPalette,
} from './palettes'
import { applyPaletteCssVars } from './tokens'
import {
  DEFAULT_PATTERN_ID,
  MARKET_PATTERN_STORAGE_KEY,
  getPattern,
  isPatternId,
  patternCssVars,
  type PatternId,
} from './patterns'

export interface MarketThemePreference {
  /** Palette id — persisted under `ys-marketplace-palette`. */
  paletteName: string
  /** Pattern id — persisted under `ys-marketplace-pattern`. */
  patternId: PatternId
}

/** Server render + first hydration always start from the shipped default. */
export const DEFAULT_MARKET_THEME: MarketThemePreference = Object.freeze({
  paletteName: DEFAULT_PALETTE_NAME,
  patternId: DEFAULT_PATTERN_ID,
})

// ─── validation / storage ────────────────────────────────────────────────────

/** Unknown / stale values fall back to the default instead of throwing. */
export function resolveMarketThemePreference(raw: unknown): MarketThemePreference {
  const out: MarketThemePreference = { ...DEFAULT_MARKET_THEME }
  if (raw && typeof raw === 'object') {
    const value = raw as Record<string, unknown>
    if (typeof value.paletteName === 'string' && PALETTES.some((p) => p.name === value.paletteName)) {
      out.paletteName = value.paletteName
    }
    if (isPatternId(value.patternId)) out.patternId = value.patternId
  }
  return out
}

/** Read both persisted ids. A blocked localStorage is a no-op, not a crash. */
export function readStoredMarketTheme(): MarketThemePreference {
  if (typeof window === 'undefined') return { ...DEFAULT_MARKET_THEME }
  let paletteName: string | null = null
  let patternId: string | null = null
  try { paletteName = window.localStorage.getItem(PALETTE_STORAGE_KEY) } catch { /* private mode */ }
  try { patternId = window.localStorage.getItem(MARKET_PATTERN_STORAGE_KEY) } catch { /* private mode */ }
  return resolveMarketThemePreference({ paletteName: paletteName ?? undefined, patternId: patternId ?? undefined })
}

function persistMarketThemePreference(preference: MarketThemePreference) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(PALETTE_STORAGE_KEY, preference.paletteName) } catch { /* private mode */ }
  try { window.localStorage.setItem(MARKET_PATTERN_STORAGE_KEY, preference.patternId) } catch { /* private mode */ }
}

// ─── DOM writer ──────────────────────────────────────────────────────────────

/** Every mounted market root, including nested landing roots (document order). */
export function marketRoots(): HTMLElement[] {
  if (typeof document === 'undefined') return []
  const roots = document.querySelectorAll<HTMLElement>('.cw-market')
  return Array.prototype.slice.call(roots) as HTMLElement[]
}

/**
 * Deterministically paint one preference everywhere it is read from:
 * documentElement (what any .cw-market root inherits) and each mounted root
 * (so a nested / remounted root carries the same values, never a stale or
 * default hue). Idempotent — re-applying identical values is visually idle.
 */
export function applyMarketTheme(preference: MarketThemePreference): void {
  if (typeof document === 'undefined') return
  const next = getPalette(preference.paletteName)
  const patternVars = patternCssVars(preference.patternId)
  const docEl = document.documentElement

  const roots = marketRoots()
  // Writing through documentElement first means any root that mounts later
  // (lazy panel, nested landing root, portal drawer) inherits the saved theme.
  applyPaletteCssVars(docEl, next.tokens)
  for (const root of roots) applyPaletteCssVars(root, next.tokens)

  for (const [prop, value] of Object.entries(patternVars)) {
    docEl.style.setProperty(prop, value)
    for (const root of roots) root.style.setProperty(prop, value)
  }

  docEl.setAttribute('data-ys-palette', next.name)
  docEl.setAttribute('data-ys-pattern', preference.patternId)
}

/** Portal body paint is market-only: drop it once no market root remains. */
export function clearMarketBodyPaint(): void {
  if (typeof document === 'undefined' || !document.body) return
  document.body.style.backgroundColor = ''
}

// ─── shared store ────────────────────────────────────────────────────────────

type Listener = () => void

let preference: MarketThemePreference = { ...DEFAULT_MARKET_THEME }
let hydrated = false
let hydrationScheduled = false
let crossTabBound = false
const listeners = new Set<Listener>()

/** Stable snapshot — identity only changes when the preference changes. */
export function getMarketThemeSnapshot(): MarketThemePreference {
  return preference
}

/** Hydration must match the server render; the boot script already painted. */
export function getMarketThemeServerSnapshot(): MarketThemePreference {
  return DEFAULT_MARKET_THEME
}

function scheduleMarketThemeHydration() {
  if (typeof window === 'undefined' || hydrated || hydrationScheduled) return
  hydrationScheduled = true
  queueMicrotask(() => {
    hydrationScheduled = false
    if (!hydrated) hydrateMarketTheme()
  })
}

export function subscribeMarketTheme(listener: Listener): () => void {
  listeners.add(listener)
  // useSyncExternalStore subscribes only after the SSR/default snapshot has
  // hydrated. Adopt persisted browser state *after* the listener exists so
  // the first saved palette/pattern cannot be painted by the boot script yet
  // remain invisible to React until a later user interaction.
  scheduleMarketThemeHydration()
  return () => { listeners.delete(listener) }
}

function emit() {
  for (const listener of Array.from(listeners)) {
    try { listener() } catch { /* a consumer must never break the store */ }
  }
}

/** Cross-tab sync: another tab's picker wins, then repaints this document. */
function bindCrossTabSync() {
  if (crossTabBound || typeof window === 'undefined') return
  crossTabBound = true
  const adopt = (next: MarketThemePreference) => {
    if (next.paletteName === preference.paletteName && next.patternId === preference.patternId) return
    preference = next
    applyMarketTheme(preference)
    emit()
  }
  window.addEventListener('storage', (event: StorageEvent) => {
    // Only the key that actually changed is adopted, so a pattern change in
    // another tab can never reset the palette (and vice versa).
    if (event.key === PALETTE_STORAGE_KEY) {
      adopt(resolveMarketThemePreference({
        paletteName: event.newValue ?? undefined,
        patternId: preference.patternId,
      }))
    } else if (event.key === MARKET_PATTERN_STORAGE_KEY) {
      adopt(resolveMarketThemePreference({
        paletteName: preference.paletteName,
        patternId: event.newValue ?? undefined,
      }))
    }
  })
}

/**
 * Read persisted ids once per document and paint them. Idempotent: a second
 * provider instance (route remount, nested layout) must not reset state to
 * the default or re-read over a newer in-memory choice.
 */
export function hydrateMarketTheme(): MarketThemePreference {
  if (typeof window !== 'undefined') bindCrossTabSync()
  if (hydrated) return preference
  hydrated = true
  preference = readStoredMarketTheme()
  applyMarketTheme(preference)
  emit()
  return preference
}

/**
 * The only mutation entry point. Persists, repaints every root and notifies
 * every consumer — so palette and pattern always move together.
 */
export function setMarketThemePreference(patch: Partial<MarketThemePreference>): MarketThemePreference {
  const next = resolveMarketThemePreference({ ...preference, ...patch })
  if (next.paletteName === preference.paletteName && next.patternId === preference.patternId) {
    return preference
  }
  preference = next
  persistMarketThemePreference(next)
  applyMarketTheme(next)
  emit()
  return next
}

/** Convenience: resolved registry entries for a snapshot. */
export function resolveMarketTheme(preferenceValue: MarketThemePreference) {
  return {
    palette: getPalette(preferenceValue.paletteName),
    pattern: getPattern(preferenceValue.patternId),
  }
}
