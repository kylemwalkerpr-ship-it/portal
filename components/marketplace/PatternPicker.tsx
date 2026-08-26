'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'ys-marketplace-pattern'

export type PatternId =
  | 'none'
  | 'linen'
  | 'dots'
  | 'diagonal'
  | 'woodgrain'
  | 'crosshatch'
  | 'diamonds'

interface PatternDef {
  id: PatternId
  label: string
  emoji: string
  css: string  // CSS background-image value
}const PATTERNS: PatternDef[] = [
  { id: 'none', label: 'Solid', emoji: '◼️', css: 'none' },
  {
    id: 'linen', label: 'Linen', emoji: '🧵',
    css: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 4px)',
  },
  {
    id: 'dots', label: 'Dots', emoji: '🔲',
    css: 'radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)',
  },
  {
    id: 'diagonal', label: 'Diagonal', emoji: '📐',
    css: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 8px)',
  },
  {
    id: 'woodgrain', label: 'Wood grain', emoji: '🪵',
    css: [
      'repeating-linear-gradient(0deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 3px)',
      'repeating-linear-gradient(2deg, rgba(0,0,0,0.05) 0px, rgba(0,0,0,0.05) 1px, transparent 1px, transparent 6px)',
    ].join(', '),
  },
  {
    id: 'crosshatch', label: 'Crosshatch', emoji: '🔺',
    css: [
      'repeating-linear-gradient(45deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 8px)',
      'repeating-linear-gradient(-45deg, rgba(0,0,0,0.04) 0px, rgba(0,0,0,0.04) 1px, transparent 1px, transparent 8px)',
    ].join(', '),
  },
  {
    id: 'diamonds', label: 'Diamonds', emoji: '💎',
    css: [
      'linear-gradient(45deg, rgba(0,0,0,0.04) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.04) 75%)',
      'linear-gradient(45deg, rgba(0,0,0,0.04) 25%, transparent 25%, transparent 75%, rgba(0,0,0,0.04) 75%)',
    ].join(', '),
  },
]

export function getPatternCss(id: PatternId): string {
  return PATTERNS.find(p => p.id === id)?.css ?? 'none'
}

export function getPatternBackgroundSize(id: PatternId): string {
  switch (id) {
    case 'dots': return '16px 16px'
    case 'diamonds': return '16px 16px'
    default: return 'auto'
  }
}

export function getPatternPosition(id: PatternId): string {
  switch (id) {
    case 'diamonds': return '0 0, 8px 8px'
    default: return '0 0'
  }
}

/**
 * PatternPicker — compact background texture switcher for the marketplace.
 * Lives next to the PalettePicker in the shell header.
 */
export function PatternPicker() {
  const [selected, setSelected] = useState<PatternId>(() => {
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

  // Apply pattern by injecting a <style> tag that overrides .cw-market::before.
  // The ::before pseudo-element has position:fixed inset:0 z-index:-2 and
  // covers the entire viewport — setting backgroundImage on .cw-market itself
  // is invisible behind it.
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
    applyPattern(selected)
  }, [selected, applyPattern])

  const handleSelect = (id: PatternId) => {
    setSelected(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch {}
    setOpen(false)
  }

  const current = PATTERNS.find(p => p.id === selected) ?? PATTERNS[0]

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
        aria-label={`Background pattern: ${current.label}. Click to change.`}
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
        <span aria-hidden="true" style={{ fontSize: 12 }}>{current.emoji}</span>
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose background pattern"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 200,
            margin: 0,
            padding: 4,
            listStyle: 'none',
            border: '1px solid rgba(148,163,184,0.30)',
            borderRadius: 8,
            background: '#fff',
            boxShadow: '0 12px 28px rgba(15,23,42,0.16)',
            maxHeight: '60vh',
            overflowY: 'auto',
            zIndex: 250,
          }}
        >
          {PATTERNS.map(p => {
            const active = p.id === selected
            return (
              <li key={p.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
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
                  {/* Pattern preview swatch */}
                  <span
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 3,
                      background: '#FAFAF7',
                      backgroundImage: p.css,
                      backgroundSize: getPatternBackgroundSize(p.id),
                      backgroundPosition: getPatternPosition(p.id),
                      border: '1px solid rgba(0,0,0,0.1)',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', lineHeight: 1.3 }}>
                      {p.emoji} {p.label}
                    </span>
                  </span>
                  {active && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0E7C74', flexShrink: 0 }}>✓</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
