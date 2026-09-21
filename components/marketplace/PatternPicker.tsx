'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useMarketplaceTheme } from '@/contexts/palette-context'
import { T } from './tokens'
import { PATTERNS, getPattern, type PatternId } from './patterns'

/**
 * PatternPicker — compact background-motif switcher for the marketplace.
 *
 * Reliability contract (MARKETPLACE-PALETTE-FLORAL-RELIABILITY):
 *   - Keeps NO pattern state, NO localStorage access and NO style-tag writer of
 *     its own. It reads/writes the shared provider store, so it can never
 *     diverge from ThemePicker (or from a second picker mounted elsewhere).
 *   - Motifs and their CSS come from the pure registry in ./patterns.
 */

/** Motif preview swatch — same layered gradients the canvas uses. */
function PatternSwatch({ id }: { id: PatternId }) {
  const def = getPattern(id)
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 22,
        height: 22,
        flexShrink: 0,
        borderRadius: 3,
        backgroundColor: 'var(--ys-cream, #F9FAFB)',
        backgroundImage: def.layers.length ? def.layers.join(', ') : undefined,
        backgroundSize: def.backgroundSize,
        backgroundPosition: def.backgroundPosition,
        border: '1px solid var(--ys-rule, rgba(15,23,42,0.10))',
      }}
    />
  )
}

export function PatternPicker() {
  const { patternId, pattern, setPatternId } = useMarketplaceTheme()
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

  const handleSelect = useCallback((id: PatternId) => {
    setPatternId(id)
    setOpen(false)
  }, [setPatternId])

  return (
    <div
      ref={wrapRef}
      data-no-translate
      data-ys-pattern-picker=""
      data-ys-selected-pattern={patternId}
      style={{
        position: 'relative',
        display: 'inline-flex',
        fontFamily: 'var(--portal-font-body, -apple-system, BlinkMacSystemFont, "Inter", sans-serif)',
      }}
    >
      <button
        type="button"
        aria-label={`Botanical pattern: ${pattern.label}. Click to change.`}
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
        <PatternSwatch id={patternId} />
        <span aria-hidden="true" style={{ fontSize: 9, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose botanical pattern"
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
          {PATTERNS.map(p => {
            const active = p.id === patternId
            return (
              <li key={p.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  data-ys-pattern-option={p.id}
                  title={p.description}
                  onClick={() => handleSelect(p.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: 'none',
                    background: active ? T.indigoSoft : 'transparent',
                    color: active ? T.indigoDeep : T.ink,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    borderRadius: 5,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <PatternSwatch id={p.id} />
                  <span style={{ flex: 1 }}>
                    <span style={{ display: 'block', lineHeight: 1.3 }}>{p.label}</span>
                    <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, lineHeight: 1.35, color: active ? T.indigoDeep : T.inkSoft }}>
                      {p.description}
                    </span>
                  </span>
                  {active && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: T.indigo, flexShrink: 0 }}>✓</span>
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
