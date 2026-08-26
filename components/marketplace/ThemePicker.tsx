'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { usePalette } from '@/contexts/palette-context'
import { getPatternCss, getPatternBackgroundSize, getPatternPosition } from './PatternPicker'
import type { PatternId } from './PatternPicker'

const STORAGE_KEY = 'ys-marketplace-pattern'

const PATTERNS: Array<{ id: PatternId; label: string; emoji: string }> = [
  { id: 'none', label: 'Solid', emoji: '◼️' },
  { id: 'linen', label: 'Linen', emoji: '🧵' },
  { id: 'dots', label: 'Dots', emoji: '🔲' },
  { id: 'diagonal', label: 'Diagonal', emoji: '📐' },
  { id: 'woodgrain', label: 'Wood grain', emoji: '🪵' },
  { id: 'crosshatch', label: 'Crosshatch', emoji: '🔺' },
  { id: 'diamonds', label: 'Diamonds', emoji: '💎' },
]

export function ThemePicker() {
  const { palettes, palette, setPaletteName } = usePalette()
  const [selectedPattern, setSelectedPattern] = useState<PatternId>(() => {
    if (typeof window === 'undefined') return 'none'
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && PATTERNS.some(p => p.id === stored)) return stored as PatternId
    } catch {}
    return 'none'
  })
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Click-outside / Esc to close
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // Apply CSS vars on mount
  useEffect(() => {
    const root = document.querySelector('.cw-market') as HTMLElement | null
    if (!root) return
    import('@/components/marketplace/tokens').then(({ applyPaletteCssVars }) => {
      applyPaletteCssVars(root, palette.tokens)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply pattern by injecting a <style> tag
  const applyPattern = useCallback((id: PatternId) => {
    const css = getPatternCss(id)
    const bgSize = getPatternBackgroundSize(id)
    const bgPos = getPatternPosition(id)
    let tag = document.getElementById('ys-pattern-override') as HTMLStyleElement | null
    if (!tag) {
      tag = document.createElement('style')
      tag.id = 'ys-pattern-override'
      document.head.appendChild(tag)
    }
    if (id === 'none') {
      tag.textContent = ''
    } else {
      tag.textContent = `.cw-market::before { background-image: ${css} !important; background-size: ${bgSize} !important; background-position: ${bgPos} !important; }`
    }
  }, [])

  useEffect(() => {
    applyPattern(selectedPattern)
  }, [selectedPattern, applyPattern])

  const handlePaletteSelect = (name: string) => {
    setPaletteName(name)
    setOpen(false)
  }

  const handlePatternSelect = (id: PatternId) => {
    setSelectedPattern(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch {}
  }

  const currentPattern = PATTERNS.find(p => p.id === selectedPattern) ?? PATTERNS[0]

  return (
    <div
      ref={wrapRef}
      data-no-translate
      style={{
        position: 'relative',
        display: 'inline-flex',
        fontFamily: 'var(--portal-font-body, -apple-system, BlinkMacSystemFont, "Inter", sans-serif)',
      }}
    >
      <button
        type="button"
        aria-label={`Theme: ${palette.label} + ${currentPattern.label}. Click to change.`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '5px 10px',
          border: '1px solid rgba(148,163,184,0.35)',
          borderRadius: 6,
          background: 'rgba(255,255,255,0.96)',
          color: '#0f172a',
          boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.04em',
          lineHeight: 1,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 12 }}>{palette.emoji}</span>
        <span aria-hidden="true" style={{ fontSize: 10 }}>{currentPattern.emoji}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose theme"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 260,
            border: '1px solid rgba(148,163,184,0.30)',
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 12px 28px rgba(15,23,42,0.16)',
            maxHeight: '65vh',
            overflowY: 'auto',
            zIndex: 250,
          }}
        >
          {/* Color palette section */}
          <div style={{ padding: '8px 10px 4px', fontSize: 9, fontWeight: 700, color: '#5C6070', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            🎨 Color Palette
          </div>
          {palettes.map(p => {
            const active = p.name === palette.name
            return (
              <button
                key={p.name}
                type="button"
                onClick={() => handlePaletteSelect(p.name)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '7px 10px',
                  border: 'none',
                  background: active ? 'rgba(14,124,116,0.10)' : 'transparent',
                  color: active ? '#0E7C74' : '#1A1F2E',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 700 : 500,
                  borderRadius: 5,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.paper }} />
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.vellum }} />
                  <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.gold }} />
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', lineHeight: 1.3 }}>{p.emoji} {p.label}</span>
                </span>
                {active && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#0E7C74', flexShrink: 0 }}>✓</span>
                )}
              </button>
            )
          })}

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(148,163,184,0.2)', margin: '4px 10px' }} />

          {/* Pattern section */}
          <div style={{ padding: '4px 10px 4px', fontSize: 9, fontWeight: 700, color: '#5C6070', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            ✨ Background Pattern
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: '4px 10px 10px' }}>
            {PATTERNS.map(p => {
              const active = p.id === selectedPattern
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePatternSelect(p.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    padding: '6px 2px',
                    border: active ? '2px solid #0E7C74' : '1px solid rgba(148,163,184,0.25)',
                    borderRadius: 6,
                    background: active ? 'rgba(14,124,116,0.08)' : '#FAFAF8',
                    cursor: 'pointer',
                    fontSize: 10,
                    fontWeight: active ? 700 : 500,
                    color: active ? '#0E7C74' : '#1A1F2E',
                    fontFamily: 'inherit',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{p.emoji}</span>
                  <span style={{ lineHeight: 1.1, textAlign: 'center' as const }}>{p.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
