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

  const apply = useCallback((name: string) => {
    if (typeof document === 'undefined') return
    const next = getPalette(name)
    const root = document.querySelector('.cw-market') as HTMLElement | null
    if (root) applyPaletteCssVars(root, next.tokens)
    document.documentElement.setAttribute('data-ys-palette', name)
  }, [])

  // Always write tokens onto .cw-market. The boot script paints <html>
  // before the shell exists; globals.css also declares first-paint fallbacks
  // on .cw-market which would otherwise lock the default hue and make the
  // picker look like a no-op. Re-applying identical values is visually idle.
  useEffect(() => {
    apply(paletteName)
  }, [paletteName, apply])

  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.style.backgroundColor = ''
    }
  }, [])

  const setPaletteName = useCallback((name: string) => {
    setPaletteNameRaw(name)
    try { window.localStorage.setItem(STORAGE_KEY, name) } catch {}
    apply(name)
  }, [apply])

  return (
    <PaletteContext.Provider value={{ palettes: PALETTES, palette, setPaletteName }}>
      {children}
    </PaletteContext.Provider>
  )
}