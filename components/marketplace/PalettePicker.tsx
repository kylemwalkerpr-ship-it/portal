'use client'

import React, { useEffect, useRef } from 'react'
import { usePalette } from '@/contexts/palette-context'

/**
 * PalettePicker — compact color-theme switcher for the marketplace.
 *
 * Sits next to the GlobalLanguageBar in the marketplace header shell.
 * Matches the language picker's visual style: small pill with an emoji
 * icon that opens a dropdown listing the palette options.
 */
export function PalettePicker() {
  const { palettes, palette, setPaletteName } = usePalette()
  const [open, setOpen] = React.useState(false)
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

  // Apply CSS vars eagerly on mount (before the context useEffect fires in some edge cases)
  useEffect(() => {
    const root = document.querySelector('.cw-market') as HTMLElement | null
    if (!root) return
    // We re-apply here in case the layout paints before the context provider
    import('@/components/marketplace/tokens').then(({ applyPaletteCssVars }) => {
      applyPaletteCssVars(root, palette.tokens)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (name: string) => {
    setPaletteName(name)
    setOpen(false)
  }

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
        aria-label={`Colour theme: ${palette.label}. Click to change.`}
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
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose colour theme"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 220,
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
          {palettes.map(p => {
            const active = p.name === palette.name
            return (
              <li key={p.name} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => handleSelect(p.name)}
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
                  {/* Palette preview swatch row */}
                  <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.paper }} />
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.vellum }} />
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: p.tokens.gold }} />
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', lineHeight: 1.3 }}>{p.emoji} {p.label}</span>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 400, color: '#5C6070', lineHeight: 1.3, marginTop: 1 }}>
                      {p.description}
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