'use client'

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { PALETTES, DEFAULT_PALETTE_NAME, getPalette, type PaletteDef } from '@/components/marketplace/palettes'
import { applyPaletteCssVars } from '@/components/marketplace/tokens'

const STORAGE_KEY = 'ys-marketplace-palette'

interface PaletteContextValue {
  /** All available palettes */
  palettes: PaletteDef[]
  /** Currently selected palette */
  palette: PaletteDef
  /** Switch to a different palette by name */
  setPaletteName: (name: string) => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function usePalette(): PaletteContextValue {
  const ctx = useContext(PaletteContext)
  if (!ctx) throw new Error('usePalette must be used within PaletteProvider')
  return ctx
}

export function PaletteProvider({ children }: { children: React.ReactNode }) {
  const [paletteName, setPaletteNameRaw] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_PALETTE_NAME
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored && PALETTES.some(p => p.name === stored)) return stored
    } catch { /* localStorage blocked */ }
    return DEFAULT_PALETTE_NAME
  })

  const palette = getPalette(paletteName)

  // Apply CSS vars to .cw-market whenever the palette ACTUALLY changes.
  // The blocking boot script already wrote identical vars + set
  // data-ys-palette before hydration, so on mount (and on every inner
  // navigation remount) with the same palette this is a no-op — re-applying
  // here is what made tokens look like they "load" after each navigation.
  useEffect(() => {
    const root = document.querySelector('.cw-market') as HTMLElement | null
    if (!root) return
    if (document.documentElement.getAttribute('data-ys-palette') === paletteName) return
    applyPaletteCssVars(root, palette.tokens)
    document.documentElement.setAttribute('data-ys-palette', paletteName)
  }, [paletteName, palette.tokens])

  // Leaving the marketplace unmounts this provider — restore the portal's
  // own body background so the dark market paper doesn't leak into it.
  // Empty deps: this cleanup runs ONLY when the marketplace layout unmounts,
  // never on inner navigations (which keep the provider mounted).
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.style.backgroundColor = ''
    }
  }, [])

  const setPaletteName = useCallback((name: string) => {
    setPaletteNameRaw(name)
    try { window.localStorage.setItem(STORAGE_KEY, name) } catch {}
  }, [])

  return (
    <PaletteContext.Provider value={{ palettes: PALETTES, palette, setPaletteName }}>
      {children}
    </PaletteContext.Provider>
  )
}