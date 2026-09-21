'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { PALETTES, getPalette, type PaletteDef } from '@/components/marketplace/palettes'
import {
  applyMarketTheme,
  clearMarketBodyPaint,
  getMarketThemeServerSnapshot,
  getMarketThemeSnapshot,
  hydrateMarketTheme,
  setMarketThemePreference,
  subscribeMarketTheme,
} from '@/components/marketplace/market-theme'
import { getPattern, type PatternDef, type PatternId } from '@/components/marketplace/patterns'

/**
 * Marketplace theme provider — the ONE source of truth for the selected
 * palette AND background pattern.
 *
 * Both ThemePicker instances (desktop nav + mobile drawer) and the standalone
 * PatternPicker read this context, so they cannot hold divergent pattern
 * state, and no component writes the global canvas itself: every mutation goes
 * through the shared store in components/marketplace/market-theme.ts, which
 * paints documentElement and all mounted .cw-market roots.
 */
interface PaletteContextValue {
  /** All available palettes */
  palettes: PaletteDef[]
  /** Currently selected palette */
  palette: PaletteDef
  /** Switch to a different palette by name */
  setPaletteName: (name: string) => void
  /** Currently selected background pattern (shared by every picker) */
  patternId: PatternId
  /** Resolved registry entry for `patternId` */
  pattern: PatternDef
  /** Switch to a different background pattern by id */
  setPatternId: (id: PatternId) => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('usePalette must be used within PaletteProvider')
  return ctx
}

/** Readable alias — the provider now owns palette + pattern. */
export const useMarketplaceTheme = usePalette

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const preference = useSyncExternalStore(
    subscribeMarketTheme,
    getMarketThemeSnapshot,
    getMarketThemeServerSnapshot,
  )

  // Single applier for palette + pattern. Runs once after hydration (the
  // blocking boot script already painted identical values) and again whenever
  // the preference changes or a provider/layout remounts. The live snapshot is
  // re-read here so a stale render value can never repaint an older theme over
  // a newer one.
  useEffect(() => {
    hydrateMarketTheme()
    applyMarketTheme(getMarketThemeSnapshot())
  }, [preference])

  // Route remounts (/marketplace ↔ /shop) must not strand market paper on
  // portal pages. Drop the body paint only once no market root is left, so the
  // handoff between two providers never flashes white.
  useEffect(() => () => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return
    window.requestAnimationFrame(() => {
      if (typeof document !== 'undefined' && !document.querySelector('.cw-market')) clearMarketBodyPaint()
    })
  }, [])

  const setPaletteName = useCallback((name: string) => {
    setMarketThemePreference({ paletteName: name })
  }, [])

  const setPatternId = useCallback((id: PatternId) => {
    setMarketThemePreference({ patternId: id })
  }, [])

  const palette = getPalette(preference.paletteName)
  const pattern = getPattern(preference.patternId)

  const value = useMemo<PaletteContextValue>(() => ({
    palettes: PALETTES,
    palette,
    setPaletteName,
    patternId: preference.patternId,
    pattern,
    setPatternId,
  }), [palette, setPaletteName, preference.patternId, pattern, setPatternId])

  return (
    <PaletteContext.Provider value={value}>
      {children}
    </PaletteContext.Provider>
  )
}
