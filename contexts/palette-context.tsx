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

  // Apply CSS vars to .cw-market whenever the palette changes
  useEffect(() => {
    const root = document.querySelector('.cw-market') as HTMLElement | null
    if (!root) return
    applyPaletteCssVars(root, palette.tokens)
  }, [paletteName, palette.tokens])

  // Leaving the marketplace unmounts this provider — restore the portal's
  // own body background so the dark market paper doesn't leak into it.
  useEffect(() => {
    return () => {
      if (typeof document !== 'undefined') document.body.style.backgroundColor = ''
    }
  }, [])

  // Also apply on first mount once .cw-market exists
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const root = document.querySelector('.cw-market') as HTMLElement | null
      if (root) applyPaletteCssVars(root, palette.tokens)
    })
    return () => cancelAnimationFrame(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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