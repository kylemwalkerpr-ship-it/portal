'use client'
/**
 * Portal appearance preferences beyond the color theme: typography family,
 * letter-spacing (kerning), and background pattern. Persisted in
 * localStorage and applied as data-attributes on <html>; the CSS lives in
 * app/portal-themes.css. Shared by all four role shells via ThemePicker.
 */
import { useEffect, useState } from 'react'

export type PortalFontId = 'classic' | 'modern' | 'editorial'
export type PortalKerningId = 'tight' | 'normal' | 'relaxed'
export type PortalPatternId = 'plain' | 'dots' | 'grid' | 'linen'

export interface PortalAppearance {
  font: PortalFontId
  kerning: PortalKerningId
  pattern: PortalPatternId
}

export const DEFAULT_APPEARANCE: PortalAppearance = {
  font: 'classic',
  kerning: 'normal',
  pattern: 'plain',
}

export const FONT_OPTIONS: Array<{ id: PortalFontId; name: string; description: string; preview: string }> = [
  { id: 'classic', name: 'Classic', description: 'Garamond display · system body', preview: "'Cormorant Garamond', Georgia, serif" },
  { id: 'modern', name: 'Modern', description: 'Clean sans throughout', preview: "-apple-system, 'Inter', 'Segoe UI', sans-serif" },
  { id: 'editorial', name: 'Editorial', description: 'Georgia serif throughout', preview: "Georgia, 'Times New Roman', serif" },
]

export const KERNING_OPTIONS: Array<{ id: PortalKerningId; name: string; description: string }> = [
  { id: 'tight', name: 'Tight', description: 'Compact, dense reading' },
  { id: 'normal', name: 'Normal', description: 'Default letter spacing' },
  { id: 'relaxed', name: 'Relaxed', description: 'Airy, open spacing' },
]

export const PATTERN_OPTIONS: Array<{ id: PortalPatternId; name: string; description: string }> = [
  { id: 'plain', name: 'Plain', description: 'Solid background' },
  { id: 'dots', name: 'Dots', description: 'Subtle dot grid' },
  { id: 'grid', name: 'Grid', description: 'Fine blueprint grid' },
  { id: 'linen', name: 'Linen', description: 'Soft woven texture' },
]

const STORAGE_KEY = 'yousafe.portal.appearance'
const SYNC_EVENT = 'yousafe-portal-appearance-changed'

const VALID: Record<keyof PortalAppearance, string[]> = {
  font: FONT_OPTIONS.map((o) => o.id),
  kerning: KERNING_OPTIONS.map((o) => o.id),
  pattern: PATTERN_OPTIONS.map((o) => o.id),
}

function sanitize(raw: unknown): PortalAppearance {
  const out = { ...DEFAULT_APPEARANCE }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(VALID) as Array<keyof PortalAppearance>) {
      const v = (raw as Record<string, unknown>)[key]
      if (typeof v === 'string' && VALID[key].includes(v)) (out as any)[key] = v
    }
  }
  return out
}

export function applyAppearance(a: PortalAppearance) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.setAttribute('data-portal-font', a.font)
  el.setAttribute('data-portal-kerning', a.kerning)
  el.setAttribute('data-portal-pattern', a.pattern)
}

export function usePortalAppearance(): [PortalAppearance, (patch: Partial<PortalAppearance>) => void] {
  const [appearance, setAppearance] = useState<PortalAppearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    try {
      const cached = sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'))
      setAppearance(cached)
      applyAppearance(cached)
    } catch { applyAppearance(DEFAULT_APPEARANCE) }

    const onSync = (e: Event) => {
      const next = sanitize((e as CustomEvent).detail)
      setAppearance(next)
      applyAppearance(next)
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const next = sanitize(JSON.parse(e.newValue))
        setAppearance(next)
        applyAppearance(next)
      } catch { /* ignore */ }
    }
    window.addEventListener(SYNC_EVENT, onSync as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SYNC_EVENT, onSync as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const update = (patch: Partial<PortalAppearance>) => {
    const next = sanitize({ ...appearance, ...patch })
    setAppearance(next)
    applyAppearance(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }))
  }

  return [appearance, update]
}
